import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decideSeed, verifyTarget, verifySource, decideRecovery, decidePreparation, restorationSql, SeedError} from './seed-demo.mjs';

const root = '/work/mtg';
const id = 'a'.repeat(64);
const volume = 'mtg-commander-stats_postgres-data';
const config = {
  name: 'mtg-commander-stats',
  services: {postgres: {image: 'postgres:18', volumes: [
    {type: 'volume', source: 'postgres-data', target: '/var/lib/postgresql'},
  ]}},
  volumes: {'postgres-data': {name: volume}},
};
function target(overrides = {}) {
  return {
    Id: id, Image: 'postgres:18', State: {Running: true, Health: {Status: 'healthy'}},
    Labels: {'com.docker.compose.project': config.name, 'com.docker.compose.service': 'postgres',
      'com.docker.compose.project.working_dir': root,
      'com.docker.compose.project.config_files': root + '/compose.yaml'},
    Mounts: [{Type: 'volume', Name: volume, Destination: '/var/lib/postgresql', RW: true}],
    ...overrides,
  };
}
test('only a genuinely empty and unmarked database can be seeded', () => {
  assert.equal(decideSeed(null, [{name: 'users', count: 0}, {name: 'decks', count: 0}]), 'seed');
  assert.equal(decideSeed(null, [{name: 'users', count: 1}, {name: 'decks', count: 0}]), 'existing-data');
  assert.equal(decideSeed(null, [{name: 'users', count: 0}, {name: 'decks', count: 1}]), 'existing-data');
  assert.equal(decideSeed('complete', []), 'skip');
});
test('interrupted, unknown and incomplete seed status refuses writes', () => {
  assert.throws(() => decideSeed('started', [{name: 'users', count: 0}]), SeedError);
  assert.throws(() => decideSeed('unknown', [{name: 'users', count: 0}]), SeedError);
  for (const rows of [[], [{name: 'users', count: -1}], [{name: 'users', count: NaN}]]) {
    assert.throws(() => decideSeed(null, rows), SeedError);
  }
});
test('validate the healthy expected Docker Compose database and persistent volume', () => {
  assert.doesNotThrow(() => verifyTarget(config, target(), root, id));
  assert.throws(() => verifyTarget(config, target({Image: 'postgres:17'}), root, id), SeedError);
  assert.throws(() => verifyTarget(config, target({State: {Running: false}}), root, id), SeedError);
  assert.throws(() => verifyTarget(config, target({Labels: {...target().Labels,
    'com.docker.compose.project.working_dir': '/other'}}), root, id), SeedError);
  assert.throws(() => verifyTarget(config, target({Mounts: []}), root, id), SeedError);
  assert.throws(() => verifyTarget({...config, services: {postgres: {image: 'postgres:18', volumes: []}}},
    target(), root, id), SeedError);
  assert.throws(() => verifyTarget(config, target(), root, 'b'.repeat(64)), SeedError);
});
test('demo import source must be the dedicated healthy isolated database', () => {
  const source = {
    Id: id, Image: 'postgres:18', State: {Running: true, Health: {Status: 'healthy'}},
    Labels: {'com.docker.compose.project': 'mtg-commander-demo', 'com.docker.compose.service': 'postgres',
      'com.docker.compose.project.working_dir': root + '/tools/demo',
      'com.docker.compose.project.config_files': root + '/tools/demo/compose.yaml'},
    Mounts: [{Type: 'volume', Name: 'mtg-commander-demo-data', Destination: '/var/lib/postgresql', RW: true}],
  };
  assert.doesNotThrow(() => verifySource(source, id, root));
  assert.throws(() => verifySource({...source, Mounts: []}, id, root), SeedError);
  assert.throws(() => verifySource({...source, Labels: {...source.Labels,
    'com.docker.compose.project': 'another'}}, id, root), SeedError);
  assert.throws(() => verifySource(source, id, '/foreign'), SeedError);
});

test('Codespaces initializes app schema before importing any demo records', () => {
  const script = readFileSync(new URL('./start.sh', import.meta.url), 'utf8');
  const flywayReady = script.indexOf('wait_service backend http://127.0.0.1:8080/api/csrf 120');
  const demoRun = script.indexOf('node "$repo_root/.devcontainer/seed-demo.mjs"');
  assert.ok(flywayReady !== -1 && demoRun > flywayReady);
});

test('explicit recovery checks interrupted marker, source verification and target emptiness', () => {
  const empty = [{name: 'users', count: 0}, {name: 'decks', count: 0}];
  assert.equal(decideRecovery('started', empty, 'complete'), 'recover');
  assert.throws(() => decideRecovery(null, empty, 'complete'), SeedError);
  assert.throws(() => decideRecovery('started', [{name:'users',count:1}], 'complete'), SeedError);
  assert.throws(() => decideRecovery('started', empty, 'started'), SeedError);
});
test('preparation retry requires owned v2 phase, no source attempt and every target table empty', () => {
  const owner = {codespace: 'test', root: '/work', project: 'test', volume: 'test-data'};
  const marker = {version: 2, status: 'preparing', owner};
  const empty = [{name: 'users', count: 0}, {name: 'decks', count: 0}];
  assert.equal(decidePreparation(marker, owner, empty, null), 'prepare');
  for (const previous of [null, {status: 'started'}, {...marker, version: 1}, {...marker, status: 'started'},
    {...marker, owner: {...owner, volume: 'foreign'}}, {...marker, owner: {...owner, codespace: 'foreign'}}]) {
    assert.throws(() => decidePreparation(previous, owner, empty, null), SeedError);
  }
  for (const source of ['started', 'complete', 'unknown']) {
    assert.throws(() => decidePreparation(marker, owner, empty, source), SeedError);
  }
  assert.throws(() => decidePreparation(marker, owner, [{name: 'decks', count: 1}], null), SeedError);
  assert.throws(() => decidePreparation(marker, owner, [], null), SeedError);
  assert.equal(decideRecovery('preparing', empty, 'complete'), 'recover');
});
test('restore SQL locks tables and restores public search path before constraints', () => {
  const script = restorationSql('SELECT 1;', ['users', 'decks', 'play_groups']);
  assert.ok(script.startsWith('BEGIN;'));
  assert.ok(script.includes('LOCK TABLE public."users", public."decks", public."play_groups" IN ACCESS EXCLUSIVE MODE;'));
  assert.ok(script.includes('EXISTS (SELECT 1 FROM public."decks")'));
  assert.ok(script.indexOf('SET search_path TO public;') > script.indexOf('SELECT 1;'));
  assert.ok(script.indexOf('SET search_path TO public;') < script.indexOf('SET CONSTRAINTS ALL IMMEDIATE;'));
  assert.ok(script.endsWith('COMMIT;\n'));
  assert.throws(() => restorationSql('', ['users']), SeedError);
});

test('real failed child retains only closed stage/HTTP/exit diagnostics', async () => {
  const {safeRun} = await import('./seed-demo.mjs');
  const script = `console.log('credentials-and-private-body');
    console.error('credentials-and-private-body');
    console.error('demo-failure: games method=POST resource=groups status=500 expected=201');
    console.error('demo-exit: code=1 signal=none'); process.exitCode = 1;`;
  assert.throws(() => safeRun(process.execPath, ['-e', script],
    {stage: 'isolated demo seed', demoDiagnostics: true}), error => {
    assert.match(error.message, /isolated demo seed.*games method=POST resource=groups status=500 expected=201/);
    assert.match(error.message, /demo-exit: code=1 signal=none/);
    assert.doesNotMatch(error.message, /credentials-and-private-body/);
    return true;
  });
});
