import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {delimiter, dirname, join} from 'node:path';
import {root, sourceApplicationTables, DemoError} from './demo.mjs';

const SESSION_TABLES = ['session_store.spring_session', 'session_store.spring_session_attributes'];

test('source emptiness skips exactly the known session-store tables and rejects other schemas', () => {
  assert.deepEqual(sourceApplicationTables(['public.decks', ...SESSION_TABLES, 'public.users']), ['decks', 'users']);
  for (const unexpected of ['session_store.other', 'other.spring_session', 'public.Users', 'public."x"', 'session_store.spring_session ']) {
    assert.throws(() => sourceApplicationTables(['public.users', unexpected]), DemoError);
  }
});

// A fake Docker CLI answering as a healthy isolated demo database. It reads its
// scenario from a file beside it: demo.mjs passes children only an allowlisted environment.
const FAKE_DOCKER = String.raw`#!/usr/bin/env node
const {appendFileSync, readFileSync} = require('node:fs');
const {join} = require('node:path');
const scenario = JSON.parse(readFileSync(join(__dirname, 'scenario.json'), 'utf8'));
const args = process.argv.slice(2);
const out = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
const root = scenario.root;
if (args[0] === 'context') out([{Endpoints: {docker: {Host: 'unix:///var/run/docker.sock'}}}]);
else if (args[0] === 'volume') out([{Name: 'mtg-commander-demo-data', Labels: {'io.mtg-commander.demo': 'true', 'com.docker.compose.project': 'mtg-commander-demo', 'com.docker.compose.volume': 'demo-data'}}]);
else if (args[0] === 'compose' && args.includes('ps')) out('a'.repeat(64));
else if (args[0] === 'inspect') out([{Config: {Image: 'postgres:18', Labels: {'com.docker.compose.project': 'mtg-commander-demo', 'com.docker.compose.service': 'postgres', 'com.docker.compose.project.working_dir': join(root, 'tools/demo'), 'com.docker.compose.project.config_files': join(root, 'tools/demo/compose.yaml')}, Env: ['POSTGRES_DB=mtg_commander_demo', 'POSTGRES_USER=mtg_commander_demo', 'POSTGRES_PASSWORD=' + scenario.password]}, State: {Running: true, Health: {Status: 'healthy'}}, NetworkSettings: {Ports: {'5432/tcp': [{HostIp: '127.0.0.1', HostPort: '5433'}]}}, Mounts: [{Type: 'volume', Name: 'mtg-commander-demo-data', Destination: '/var/lib/postgresql', RW: true}]}]);
else if (args[0] === 'exec') {
  const sql = args[args.length - 1];
  if (sql.includes('pg_tables')) out(scenario.tables.join('\n'));
  else {
    const table = /FROM public."([a-z0-9_]+)"/.exec(sql)[1];
    appendFileSync(join(__dirname, 'counted.log'), table + '\n');
    out(String(scenario.rows[table] ?? 0));
  }
} else process.exit(1);
`;

function demoCheckEmpty(t, tables, rows = {}) {
  // An isolated copy: root, .demo state and the operation lock are derived from the script location.
  const sandbox = mkdtempSync(join(tmpdir(), 'demo-cli-'));
  t.after(() => rmSync(sandbox, {recursive: true, force: true}));
  cpSync(join(root, 'tools/demo'), join(sandbox, 'tools/demo'), {recursive: true});
  const cards = 'backend/src/test/resources/scryfall/demo-cards.json';
  mkdirSync(dirname(join(sandbox, cards)), {recursive: true});
  cpSync(join(root, cards), join(sandbox, cards));
  const password = 'b'.repeat(64);
  mkdirSync(join(sandbox, '.demo'));
  writeFileSync(join(sandbox, '.demo/credentials.json'), JSON.stringify({databasePassword: password, accountPassword: 'c'.repeat(12)}));
  const bin = join(sandbox, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'scenario.json'), JSON.stringify({root: sandbox, password, tables, rows}));
  writeFileSync(join(bin, 'docker'), FAKE_DOCKER);
  chmodSync(join(bin, 'docker'), 0o755);
  const result = spawnSync(process.execPath, [join(sandbox, 'tools/demo/demo.mjs'), 'check-empty'], {
    env: {PATH: bin + delimiter + dirname(process.execPath)}, encoding: 'utf8', timeout: 30000,
  });
  let counted = [];
  try { counted = readFileSync(join(bin, 'counted.log'), 'utf8').split('\n').filter(Boolean); } catch { /* none counted */ }
  return {...result, counted};
}

const posixOnly = {skip: process.platform === 'win32' && 'the fake Docker CLI is a POSIX script'};
const migrated = ['public.decks', 'public.users', ...SESSION_TABLES];

test('actual demo CLI accepts a freshly migrated empty source that already holds browser sessions', posixOnly, t => {
  const result = demoCheckEmpty(t, migrated, {spring_session: 3});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all isolated source application tables verified empty/);
  assert.deepEqual(result.counted, ['decks', 'users']);
});

test('actual demo CLI still rejects nonempty application tables and unexpected schemas', posixOnly, t => {
  for (const [tables, rows] of [
    [migrated, {users: 1}],
    [[...migrated, 'other.spring_session'], {}],
    [[...migrated, 'session_store.unexpected'], {}],
  ]) {
    const result = demoCheckEmpty(t, tables, rows);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Source application tables are nonempty or unverifiable/);
  }
});
