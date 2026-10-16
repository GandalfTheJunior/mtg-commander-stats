// Explicit destructive integration check, never included in ordinary tests/startup.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {fork, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {BACKEND_STOP, environment, root} from './demo.mjs';
import {Session} from './api.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--destroy-demo-data') {
  console.error('WARNING: deletes all demo data before and after the check. Use verify.mjs --destroy-demo-data explicitly.');
  process.exit(1);
}
function docker(args) {
  const r = spawnSync('docker', args, {env: environment(), encoding: 'utf8'});
  assert.equal(r.status, 0, 'Docker check failed (details suppressed).');
  return r.stdout.trim();
}
function volumes() {
  return docker(['volume', 'ls', '--format', '{{.Name}}']).split('\n').filter(Boolean);
}
function others() {
  return volumes().filter(name => name !== 'mtg-commander-demo-data').sort().map(name => [name, createHash('sha256').update(docker(['volume', 'inspect', name])).digest('hex')]);
}
function command(args, status = 0) {
  const r = spawnSync(process.execPath, ['tools/demo/demo.mjs', ...args], {cwd: root, env: environment(), encoding: 'utf8'});
  assert.equal(r.status, status, `Demo ${args[0]} failed (details suppressed).`);
}
function counts() {
  const id = docker(['ps', '-q', '--filter', 'label=com.docker.compose.project=mtg-commander-demo', '--filter', 'label=com.docker.compose.service=postgres']);
  return docker(['exec', id, 'psql', '-U', 'mtg_commander_demo', '-d', 'mtg_commander_demo', '-Atc', 'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM decks), (SELECT count(*) FROM play_groups), (SELECT count(*) FROM games)']);
}
async function interactiveSignIn() {
  const child = fork(resolve(root, 'tools/demo/demo.mjs'), ['backend'], {cwd: root, env: environment(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true});
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', () => resolve(-1)); });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Interactive demo backend startup timed out.')), 120000);
      let output = '';
      child.stdout.on('data', chunk => {
        output = (output + chunk.toString()).slice(-1000);
        if (output.includes('Demo backend ready')) resolve();
      });
      child.stderr.resume();
      exited.then(() => reject(new Error('Interactive demo backend failed to start.')));
    });
    clearTimeout(timer);
    const {accountPassword} = JSON.parse(readFileSync(resolve(root, '.demo/credentials.json')));
    const session = new Session('http://127.0.0.1:8080');
    assert.equal((await session.login('ada@commander.example', accountPassword)).username, 'Ada');
    assert.equal((await session.call('GET', '/decks')).length, 2);
    assert.equal((await session.call('GET', '/groups')).length, 1);
    await session.call('DELETE', '/session', undefined, 204);
  } finally {
    clearTimeout(timer);
    // Use IPC on every OS so the wrapper can stop/await Java and release its lock.
    let shutdownError = null;
    if (child.connected) child.send({type: BACKEND_STOP}, error => { shutdownError = error; });
    const kill = setTimeout(() => child.kill('SIGKILL'), 20000);
    const status = await exited;
    clearTimeout(kill);
    assert.equal(shutdownError, null, 'Interactive backend shutdown request failed.');
    assert.equal(status, 0, 'Interactive backend did not stop cleanly.');
  }
}
const before = others();
// up validates the local socket context before any demo database operation.
command(['up']);
command(['reset', '--destroy-demo-data']);
assert.deepEqual(others(), before);
command(['up']);
command(['seed', '--allow-demo-seed']);
assert.equal(counts(), '6|12|2|36');
await interactiveSignIn();
for (const args of [['seed', '--allow-demo-seed'], ['seed'], ['reset'], ['seed', '--allow-demo-seed', '--base-url=http://localhost:8080'], ['seed', '--allow-demo-seed', '--base-url=https://example.com'], ['up', '--port=5432']]) {
  command(args, 1);
  assert.equal(counts(), '6|12|2|36');
}
// Missing local status must still refuse an already populated database.
const statusPath = resolve(root, '.demo/seed-status.json');
const status = readFileSync(statusPath);
unlinkSync(statusPath);
try {
  command(['seed', '--allow-demo-seed'], 1);
  assert.equal(counts(), '6|12|2|36');
} finally { writeFileSync(statusPath, status, {mode: 0o600}); }
// Interrupted/partial runs are also explicitly refused, with no cleanup.
writeFileSync(statusPath, JSON.stringify({status: 'started'}), {mode: 0o600});
try {
  command(['seed', '--allow-demo-seed'], 1);
  assert.equal(counts(), '6|12|2|36');
} finally { writeFileSync(statusPath, status, {mode: 0o600}); }
command(['stop']); command(['up']);
assert.equal(counts(), '6|12|2|36');
assert.deepEqual(others(), before);
command(['reset', '--destroy-demo-data']);
assert.ok(!volumes().includes('mtg-commander-demo-data'));
assert.deepEqual(others(), before);
console.log('Real demo API, reseed refusal, bad-target refusal, persistence and demo-only reset verified. Other volume identities unchanged (this does not inspect their data contents).');
