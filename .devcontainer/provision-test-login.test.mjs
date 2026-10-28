import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync, copyFileSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
import {spawn} from 'node:child_process';
import {provision, verifyContext, email} from './provision-test-login.mjs';
import {Session} from '../tools/demo/api.mjs';

const password = '🔐'.repeat(12);
const env = {CODESPACES: 'true', CODESPACE_NAME: 'test-space', GITHUB_REPOSITORY: 'GandalfTheJunior/mtg-commander-stats', MTG_CODESPACE_DEMO_DATA: '1'};
const space = {name: env.CODESPACE_NAME, state: 'Available', repository: {full_name: env.GITHUB_REPOSITORY}};
const ports = [5173, 5174].map(port_number => ({port_number, visibility: 'private'}));
test('GitHub context, repository and actual private ports fail closed', () => {
  verifyContext(env, space, ports);
  for (const patch of [{CODESPACES: ''}, {CODESPACE_NAME: '../other'}, {GITHUB_REPOSITORY: 'other/repo'}, {MTG_CODESPACE_DEMO_DATA: '0'}]) {
    assert.throws(() => verifyContext({...env, ...patch}, space, ports));
  }
  for (const bad of [[], ports.slice(1), ports.map(p => ({...p, visibility: 'public'})), [...ports, {port_number: 8080}], [...ports, {port_number: 5432}]]) {
    assert.throws(() => verifyContext(env, space, bad));
  }
  assert.throws(() => verifyContext(env, {...space, repository: {full_name: 'other/repo'}}, ports));
});
function fixture() {
  const f = {marker: null, id: '', posts: 0, logins: 0, provenance: {volume: 'one'}};
  f.session = {
    async call(method, path, body) {
      if (path === '/users') { f.posts++; f.id = 'user-1'; assert.equal(body.email, email); assert.equal(body.username, 'Codespace Tester'); return {id: f.id}; }
      return {};
    },
    async login(address, value) { f.logins++; assert.equal(address, email); assert.equal(value, password); return {id: f.id}; },
  };
  f.options = {password, provenance: f.provenance, readMarker: () => f.marker,
    writeMarker: (value, first) => { if (first) assert.equal(f.marker, null); f.marker = value; },
    accountId: () => f.id, session: f.session};
  return f;
}
test('first creation and restart verify real login without changing account or provenance', async () => {
  const f = fixture();
  await provision(f.options);
  assert.equal(f.marker.status, 'complete'); assert.equal(f.marker.accountId, f.id);
  await provision(f.options);
  assert.equal(f.posts, 1); assert.equal(f.logins, 2);
});
test('invalid passwords never register (Unicode code points, blank)', async () => {
  for (const value of ['', '🔐'.repeat(11), ' '.repeat(20), '\u0085'.repeat(12)]) {
    const f = fixture(); await assert.rejects(provision({...f.options, password: value}));
    assert.equal(f.posts, 0); assert.equal(f.marker, null);
  }
});
test('conflict, interrupted/stale/partial marker and wrong account never write', async () => {
  for (const marker of [null, {status: 'started'}, {}, {status: 'complete', provenance: {volume: 'other'}, accountId: 'user-1'}, {status: 'complete', provenance: {volume: 'one'}, accountId: 'other'}]) {
    const f = fixture(); f.id = 'user-1'; f.marker = marker;
    await assert.rejects(provision(f.options)); assert.equal(f.posts, 0);
  }
});
test('changed secret or unavailable backend cannot overwrite a completed account', async () => {
  const f = fixture(); await provision(f.options);
  f.session.login = async () => { throw Error('not logged'); };
  await assert.rejects(provision(f.options)); assert.equal(f.posts, 1); assert.equal(f.marker.status, 'complete');
});
test('failure before readiness leaves no marker; uncertain registration is never replayed', async () => {
  const f = fixture(); f.session.call = async () => { throw Error('offline'); };
  await assert.rejects(provision(f.options)); assert.equal(f.marker, null);
  f.session.call = async (method, path) => { if (path === '/users') { f.posts++; f.id = 'user-1'; throw Error('response lost'); } return {}; };
  await assert.rejects(provision(f.options)); assert.equal(f.marker.status, 'started');
  await assert.rejects(provision(f.options)); assert.equal(f.posts, 1);
});
test('failed verification preserves started provenance and blocks retry', async () => {
  const f = fixture(); f.session.login = async () => ({id: 'wrong'});
  await assert.rejects(provision(f.options)); assert.equal(f.marker.status, 'started');
  await assert.rejects(provision(f.options)); assert.equal(f.posts, 1);
});
test('simulated HTTP registration, CSRF/session, /me and logout on first run/restart', async t => {
  let account, authenticated = false, registrations = 0;
  const server = createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const body = parts.length ? JSON.parse(Buffer.concat(parts)) : undefined;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/csrf') return res.end(JSON.stringify({headerName: 'X-CSRF', token: 'token'}));
    if (req.method === 'POST' && req.url === '/api/users') {
      assert.equal(body.password, password); registrations++; account = {id: 'user-1', username: body.username};
      res.writeHead(201); return res.end(JSON.stringify(account));
    }
    assert.equal(req.headers.cookie, 'SESSION=valid');
    if (req.method !== 'GET') assert.equal(req.headers['x-csrf'], 'token');
    if (req.url === '/api/session' && req.method === 'POST') {
      assert.equal(body.email, email); assert.equal(body.password, password); authenticated = true; return res.end(JSON.stringify(account));
    }
    if (req.url === '/api/me') { assert.ok(authenticated); return res.end(JSON.stringify(account)); }
    if (req.method === 'DELETE') { authenticated = false; return res.writeHead(204).end(); }
    res.writeHead(404).end();
  });
  // Set a cookie on CSRF to model the normal pre-login session.
  server.on('request', (_req, res) => { if (!res.headersSent) res.setHeader('Set-Cookie', 'SESSION=valid; HttpOnly'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const f = fixture(); f.options.accountId = () => account?.id ?? '';
  f.options.session = new Session(`http://127.0.0.1:${server.address().port}`);
  await provision(f.options);
  f.options.session = new Session(`http://127.0.0.1:${server.address().port}`);
  await provision(f.options);
  assert.equal(registrations, 1); assert.equal(authenticated, false);
});
const execute = (args, environment, cwd = repositoryRoot) => new Promise(resolve => {
  const child = spawn(process.execPath, args, {cwd, env: {...process.env, ...environment}});
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  child.on('exit', code => resolve({code, output}));
});
test('missing/empty secret works without any Codespaces or Docker access', async () => {
  const result = await execute(['.devcontainer/provision-test-login.mjs'], {MTG_CODESPACE_TEST_PASSWORD: ''});
  assert.equal(result.code, 0); assert.match(result.output, /not configured/);
});
test('concurrent CLI starts serialize; private error output never leaks child bodies/secret', async () => {
  const home = mkdtempSync(join(tmpdir(), 'test-login-'));
  const bin = join(home, 'bin'); mkdirSync(bin);
  const fake = join(bin, 'gh');
  writeFileSync(fake, `#!/bin/sh\nif [ -e '${home}/active' ]; then touch '${home}/race'; fi\ntouch '${home}/active'\nsleep 0.1\nrm '${home}/active'\necho "$MTG_CODESPACE_TEST_PASSWORD" >&2\necho unfiltered-body >&2\nexit 1\n`); chmodSync(fake, 0o700);
  const options = {...env, HOME: home, PATH: bin + ':' + process.env.PATH, MTG_CODESPACE_TEST_PASSWORD: password};
  const results = await Promise.all([execute(['.devcontainer/provision-test-login.mjs'], options), execute(['.devcontainer/provision-test-login.mjs'], options)]);
  assert.throws(() => readFileSync(join(home, 'race')));
  for (const result of results) { assert.equal(result.code, 1); assert.ok(!result.output.includes(password)); assert.doesNotMatch(result.output, /RACE|unfiltered-body/); }
});
test('startup scopes secret away from long-lived services and provisions after seed before ready', () => {
  const source = readFileSync(new URL('./start.sh', import.meta.url), 'utf8');
  assert.ok(source.indexOf('unset MTG_CODESPACE_TEST_PASSWORD') < source.indexOf('start_service status-server'));
  assert.ok(source.indexOf('provision-test-login.mjs') > source.indexOf('node "$repo_root/.devcontainer/seed-demo.mjs"'));
  assert.ok(source.indexOf('provision-test-login.mjs') < source.indexOf('report "Vorschau bereit"'));
});
test('real CLI refuses absent/partial seed markers and wrong Docker targets before HTTP/account writes', async () => {
  for (const status of [null, 'started', 'invalid', 'complete']) {
    const home = mkdtempSync(join(tmpdir(), 'seed-guard-'));
    const bin = join(home, 'bin'); mkdirSync(bin);
    const state = join(home, '.local/state/mtg-commander-stats'); mkdirSync(state, {recursive: true, mode: 0o700});
    if (status) writeFileSync(join(state, 'demo-seed-once.json'), JSON.stringify({status}), {mode: 0o600});
    const gh = join(bin, 'gh');
    writeFileSync(gh, '#!/bin/sh\nif [ "$1" = api ]; then\ncat <<\'JSON\'\n' + JSON.stringify(space) + '\nJSON\nelse\ncat <<\'JSON\'\n' + JSON.stringify(ports.map(p => ({sourcePort: p.port_number, visibility: p.visibility}))) + '\nJSON\nfi\n'); chmodSync(gh, 0o700);
    const docker = join(bin, 'docker');
    writeFileSync(docker, `#!/bin/sh\necho call >> '${home}/docker-called'\necho '[{"Endpoints":{"docker":{"Host":"tcp://remote:2375"}}}]'\n`); chmodSync(docker, 0o700);
    const result = await execute(['.devcontainer/provision-test-login.mjs'], {...env, HOME: home, PATH: bin + ':' + process.env.PATH, MTG_CODESPACE_TEST_PASSWORD: password});
    assert.equal(result.code, 1); assert.ok(!result.output.includes(password));
    assert.equal(readFileSync(join(state, 'test-login.lock')).length, 0);
    assert.throws(() => readFileSync(join(state, 'test-login.json')));
    if (status === 'complete') assert.match(result.output, /local Codespaces Docker socket/);
    else assert.throws(() => readFileSync(join(home, 'docker-called')));
  }
});
test('full CLI simulated private Codespace: concurrent creation, restart, changed secret and unchanged demo credentials', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'private-preview-'));
  const repoRoot = join(directory, 'repo');
  const home = join(directory, 'home');
  const bin = join(home, 'bin');
  const state = join(home, '.local/state/mtg-commander-stats');
  for (const path of [bin, state, join(repoRoot, '.devcontainer'), join(repoRoot, '.demo')]) mkdirSync(path, {recursive: true, mode: 0o700});
  for (const file of ['provision-test-login.mjs', 'seed-demo.mjs']) copyFileSync(new URL(file, import.meta.url), join(repoRoot, '.devcontainer', file));
  symlinkSync(new URL('../tools', import.meta.url).pathname, join(repoRoot, 'tools'));
  const credentials = join(repoRoot, '.demo/credentials.json');
  writeFileSync(credentials, JSON.stringify({accountPassword: 'original-demo-password'}), {mode: 0o600});
  const original = readFileSync(credentials);
  writeFileSync(join(state, 'demo-seed-once.json'), '{"status":"complete"}', {mode: 0o600});
  const config = {name: 'preview', volumes: {'postgres-data': {name: 'preview-data'}}, services: {postgres: {image: 'postgres:18', volumes: [{type: 'volume', source: 'postgres-data', target: '/var/lib/postgresql'}]}}};
  const id = 'a'.repeat(64);
  const container = {Id: id, Image: 'postgres:18', State: {Running: true, Health: {Status: 'healthy'}},
    Labels: {'com.docker.compose.project': 'preview', 'com.docker.compose.service': 'postgres', 'com.docker.compose.project.working_dir': repoRoot, 'com.docker.compose.project.config_files': join(repoRoot, 'compose.yaml')},
    Mounts: [{Type: 'volume', Name: 'preview-data', Destination: '/var/lib/postgresql', RW: true}],
    Ports: {'5432/tcp': [{HostIp: '127.0.0.1', HostPort: '5432'}]}};
  const fake = (file, source) => { writeFileSync(join(bin, file), '#!' + process.execPath + '\n' + source); chmodSync(join(bin, file), 0o700); };
  fake('gh', `console.log(JSON.stringify(process.argv[2] === 'api' ? ${JSON.stringify(space)} : ${JSON.stringify(ports.map(p => ({sourcePort: p.port_number, visibility: p.visibility})))}));`);
  fake('docker', `import {existsSync} from 'node:fs';
    const a=process.argv.slice(2);
    if(process.env.MTG_CODESPACE_TEST_PASSWORD) process.exit(88);
    if(a[0]==='context') console.log('[{"Endpoints":{"docker":{"Host":"unix:///var/run/docker.sock"}}}]');
    else if(a[0]==='compose') console.log(a[1]==='config' ? JSON.stringify(${JSON.stringify(config)}) : '${id}');
    else if(a[0]==='inspect') console.log(JSON.stringify(${JSON.stringify(container)}));
    else if(a[0]==='volume') console.log('[{"Name":"preview-data","CreatedAt":"fixed"}]');
    else {const q=a.at(-1); console.log(q.includes('count(*)') ? '7' : q.includes('ada@') ? 'ada-id' : existsSync('${directory}/created') ? 'test-id' : '');}`);
  let registrations = 0;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Set-Cookie', 'SESSION=valid; HttpOnly');
    const user = req.headers.cookie?.includes('identity=test') ? {id: 'test-id', username: 'Codespace Tester'} : {id: 'ada-id', username: 'Ada'};
    if (req.url === '/api/csrf') return res.end('{"headerName":"X-CSRF","token":"token"}');
    if (req.method === 'POST' && req.url === '/api/users') {
      assert.equal(body.password, password); assert.equal(body.email, email); registrations++;
      writeFileSync(join(directory, 'created'), 'yes'); res.writeHead(201); return res.end('{"id":"test-id","username":"Codespace Tester"}');
    }
    if (req.url === '/api/session' && req.method === 'POST') {
      assert.equal(req.headers['x-csrf'], 'token');
      if (body.password !== (body.email === email ? password : 'original-demo-password')) return res.writeHead(401).end('{"secret":"must not leak"}');
      const identity = body.email === email ? 'test' : 'ada';
      res.setHeader('Set-Cookie', `identity=${identity}; HttpOnly`);
      return res.end(JSON.stringify(identity === 'test' ? {id: 'test-id', username: 'Codespace Tester'} : {id: 'ada-id', username: 'Ada'}));
    }
    if (req.url === '/api/me') return res.end(JSON.stringify(user));
    if (req.method === 'DELETE') return res.writeHead(204).end();
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(8080, '127.0.0.1', resolve)); t.after(() => server.close());
  const environment = {...env, HOME: home, PATH: bin + ':' + process.env.PATH, MTG_CODESPACE_TEST_PASSWORD: password};
  const calls = await Promise.all([execute(['.devcontainer/provision-test-login.mjs'], environment, repoRoot), execute(['.devcontainer/provision-test-login.mjs'], environment, repoRoot)]);
  for (const call of calls) assert.equal(call.code, 0, call.output);
  assert.equal(registrations, 1);
  const marker = readFileSync(join(state, 'test-login.json'));
  assert.equal(JSON.parse(marker).accountId, 'test-id');
  const changed = await execute(['.devcontainer/provision-test-login.mjs'], {...environment, MTG_CODESPACE_TEST_PASSWORD: 'a-changed-password'}, repoRoot);
  assert.equal(changed.code, 1); assert.doesNotMatch(changed.output, /must not leak|a-changed-password/);
  assert.equal(registrations, 1); assert.deepEqual(readFileSync(join(state, 'test-login.json')), marker);
  assert.deepEqual(readFileSync(credentials), original);
});
