import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decideSeed, verifyTarget, verifySource, SeedError} from './seed-demo.mjs';

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
    Labels: {'com.docker.compose.project': 'mtg-commander-demo', 'com.docker.compose.service': 'postgres'},
    Mounts: [{Type: 'volume', Name: 'mtg-commander-demo-data', Destination: '/var/lib/postgresql'}],
  };
  assert.doesNotThrow(() => verifySource(source, id));
  assert.throws(() => verifySource({...source, Mounts: []}, id), SeedError);
  assert.throws(() => verifySource({...source, Labels: {...source.Labels,
    'com.docker.compose.project': 'another'}}, id), SeedError);
});

test('Codespaces initializes app schema before importing any demo records', () => {
  const script = readFileSync(new URL('./start.sh', import.meta.url), 'utf8');
  const flywayReady = script.indexOf('wait_service backend http://127.0.0.1:8080/api/csrf 120');
  const demoRun = script.indexOf('node "$repo_root/.devcontainer/seed-demo.mjs"');
  assert.ok(flywayReady !== -1 && demoRun > flywayReady);
});
