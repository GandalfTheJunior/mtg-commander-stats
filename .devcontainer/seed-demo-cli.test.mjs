// Exercise the actual marker files, CLI lock and orchestration across failures.
// Docker/Maven/source HTTP are boundary fixtures; real infrastructure is tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mtg seed cli '));
  for (const dir of ['.devcontainer', 'tools/demo', 'backend', 'bin', 'home', '.demo']) mkdirSync(join(root, dir), {recursive: true});
  copyFileSync(new URL('./seed-demo.mjs', import.meta.url), join(root, '.devcontainer/seed-demo.mjs'));
  copyFileSync(new URL('../tools/demo/diagnostics.mjs', import.meta.url), join(root, 'tools/demo/diagnostics.mjs'));
  const config = join(root, 'fixture.json');
  const marker = join(root, 'home/.local/state/mtg-commander-stats/demo-seed-once.json');
  const state = {buildFail: true, seedFailure: '', restoreFail: false, sourceDirty: false, targetCount: 0, imports: 0};
  const save = () => writeFileSync(config, JSON.stringify(state));
  save();
  const cli = path => {
    chmodSync(path, 0o700);
  };
  writeFileSync(join(root, 'backend/mvnw'), `#!${process.execPath}\nimport fs from 'node:fs';
    const state = JSON.parse(fs.readFileSync(${JSON.stringify(config)}));
    process.exit(state.buildFail ? 1 : 0);\n`);
  cli(join(root, 'backend/mvnw'));
  writeFileSync(join(root, 'tools/demo/demo.mjs'), `import fs from 'node:fs';
    const state = JSON.parse(fs.readFileSync(${JSON.stringify(config)}));
    const marker = '.demo/seed-status.json';
    const command = process.argv[2];
    if (command === 'check-empty' && (state.sourceDirty || fs.existsSync(marker))) process.exit(1);
    if (command === 'seed') {
      if (state.seedFailure === 'startup') { console.error('demo-failure: backend-startup kind=unknown'); process.exit(1); }
      fs.writeFileSync(marker, JSON.stringify({status: state.seedFailure === 'partial' ? 'started' : 'complete'}));
      if (state.seedFailure === 'partial') process.exit(1);
    }\n`);
  writeFileSync(join(root, 'bin/docker'), `#!${process.execPath}\nconst fs = require('node:fs');
    const statePath = ${JSON.stringify(config)};
    const state = JSON.parse(fs.readFileSync(statePath));
    const a = process.argv.slice(2), root = ${JSON.stringify(root)}, id = 'a'.repeat(64), source = 'b'.repeat(64);
    let output = '';
    if (a[0] === 'compose' && a[1] === 'config') output = JSON.stringify({name:'test', services:{postgres:{image:'postgres:18', volumes:[{type:'volume',source:'postgres-data',target:'/var/lib/postgresql'}]}}, volumes:{'postgres-data':{name:'test-data'}}});
    else if (a[0] === 'compose') output = id;
    else if (a[0] === 'ps') output = source;
    else if (a[0] === 'inspect') {
      const demo = a.at(-1) === source;
      output = JSON.stringify({Id:demo?source:id,Image:'postgres:18',State:{Running:true,Health:{Status:'healthy'}},
        Labels:{'com.docker.compose.project':demo?'mtg-commander-demo':'test','com.docker.compose.service':'postgres',
          'com.docker.compose.project.working_dir':root+(demo?'/tools/demo':''),'com.docker.compose.project.config_files':root+(demo?'/tools/demo/compose.yaml':'/compose.yaml')},
        Mounts:[{Type:'volume',Name:demo?'mtg-commander-demo-data':'test-data',Destination:'/var/lib/postgresql',RW:true}]});
    } else if (a.includes('pg_dump')) output = 'archive';
    else if (a.includes('pg_restore')) output = 'SELECT 1;';
    else if (a.includes('-Atc')) {
      const query = a.at(-1);
      if (query.includes('pg_tables')) output = 'decks\\ngames\\nplay_groups\\nusers';
      else if (query.includes('string_agg')) output = '1:verified,8:verified';
      else if (a[1] === source) output = query.includes('"users"')?'7':query.includes('"decks"')?'21':query.includes('"games"')?'32':'2';
      else output = String(state.targetCount);
    } else if (a.includes('psql')) {
      if (JSON.parse(fs.readFileSync(${JSON.stringify(marker)})).status !== 'started') process.exit(90);
      if (state.restoreFail) process.exit(1);
      state.imports++; state.targetCount = 1; fs.writeFileSync(statePath, JSON.stringify(state));
    } else process.exit(91);
    process.stdout.write(output);\n`);
  cli(join(root, 'bin/docker'));
  const run = args => spawnSync(process.execPath, ['.devcontainer/seed-demo.mjs', ...args], {
    cwd: root, env: {...process.env, HOME: join(root, 'home'), PATH: join(root, 'bin') + ':' + process.env.PATH,
      CODESPACE_NAME: 'test', MTG_CODESPACE_DEMO_DATA: '1'}, encoding: 'utf8', timeout: 15000,
  });
  return {state, save, run, marker: () => JSON.parse(readFileSync(marker)),
    disk: () => JSON.parse(readFileSync(config)), root};
}

test('build and source-start failures remain preparing, safe retry completes once; restart preserves data', () => {
  const f = fixture();
  assert.equal(f.run([]).status, 1);
  assert.equal(f.marker().status, 'preparing');
  f.state.buildFail = false; f.state.seedFailure = 'startup'; f.save();
  const failure = f.run([]);
  assert.equal(failure.status, 1, failure.stderr);
  assert.match(failure.stderr, /backend-startup/);
  assert.equal(f.marker().status, 'preparing');
  f.state.seedFailure = ''; f.save();
  const success = f.run([]);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(f.marker().status, 'complete');
  assert.equal(f.disk().imports, 1);
  assert.equal(f.run([]).status, 0);
  assert.equal(f.disk().imports, 1);
});

test('partial source, dirty source and failed import never auto-retry; explicit verified resume is transactional', () => {
  for (const failure of ['partial', 'dirty', 'restore']) {
    const f = fixture();
    f.state.buildFail = false;
    f.state.seedFailure = failure === 'partial' ? 'partial' : '';
    f.state.sourceDirty = failure === 'dirty'; f.state.restoreFail = failure === 'restore'; f.save();
    assert.equal(f.run([]).status, 1);
    assert.equal(f.marker().status, failure === 'restore' ? 'started' : 'preparing');
    assert.equal(f.run([]).status, 1);
    assert.equal(f.disk().imports, 0);
    if (failure === 'restore') {
      f.state.restoreFail = false; f.save();
      const recovery = f.run(['--resume-existing-demo']);
      assert.equal(recovery.status, 0, recovery.stderr);
      assert.equal(f.marker().status, 'complete');
      assert.equal(f.disk().imports, 1);
    } else assert.equal(f.run(['--resume-existing-demo']).status, 1);
  }
});
