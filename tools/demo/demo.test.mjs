import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {dirname} from 'node:path';
import {users, groups, games, archivedDeck, results} from './fixture.mjs';
import {validateCommand, environment, backendEnvironment, checkContainer, checkVolume, checkDockerHost} from './demo.mjs';
import {Session} from './api.mjs';

test('fixture eligibility, ownership, outcomes, lifecycle and checkable manifest', () => {
  assert.equal(users.length, 6);
  assert.equal(groups.length, 2);
  assert.equal(new Set(users.map(u => u.email)).size, 6);
  assert.equal(games.length, 36);
  assert.equal(games.filter(g => g.result === 'DRAW').length, 4);
  for (const user of users) {
    assert.match(user.email, /@commander\.example$/);
    assert.ok(user.decks.length >= 2 && user.decks.length <= 3);
  }
  for (const game of games) {
    const group = groups.find(g => g.key === game.group);
    assert.ok(group.members.includes(group.owner));
    assert.equal(game.participants.length, 4);
    assert.equal(new Set(game.participants.map(p => p.user)).size, 4);
    for (const p of game.participants) {
      assert.ok(group.members.includes(p.user));
      assert.ok(users.find(u => u.key === p.user).decks.some(d => d.key === p.deck));
    }
    if (game.result === 'DRAW') assert.equal(game.winner, null);
    else assert.ok(game.participants.some(p => p.user === game.winner));
  }
  assert.ok(games.some(g => g.participants.some(p => p.deck === archivedDeck)));
  const expected = JSON.parse(readFileSync(new URL('./expected-results.json', import.meta.url)));
  assert.deepEqual(expected.groups, results());
  const friday = results()[0];
  assert.equal(friday.games, 20);
  assert.equal(friday.rows.find(r => r.deck === 'ada-0').wins, 6);
  assert.equal(friday.rows.find(r => r.deck === 'ada-1').wins, 0);
  assert.equal(friday.rows.find(r => r.user === 'ada' && r.kind === 'player').games, 12);
  for (const group of results()) {
    assert.equal(group.rows.filter(r => r.kind === 'player').reduce((n, r) => n + r.wins, 0), group.games - group.draws);
    for (const user of groups.find(g => g.key === group.group).members) {
      const player = group.rows.find(r => r.kind === 'player' && r.user === user);
      const decks = group.rows.filter(r => r.kind === 'deck' && r.user === user);
      assert.equal(decks.reduce((n, r) => n + r.games, 0), player.games);
      assert.equal(decks.reduce((n, r) => n + r.wins, 0), player.wins);
    }
  }
});

test('commands fail closed before any side effects; no arbitrary URL, port or target', () => {
  for (const args of [[], ['seed'], ['reset'], ['seed', '--allow-demo-seed', 'http://localhost:8080'], ['seed', '--base-url=https://example.com'], ['up', '--port=5432'], ['reset', '--destroy-demo-data', '--project=normal']]) assert.throws(() => validateCommand(args));
  assert.equal(validateCommand(['seed', '--allow-demo-seed']), 'seed');
  assert.equal(validateCommand(['reset', '--destroy-demo-data']), 'reset');
});

test('only local Unix sockets and Windows named pipes are accepted', () => {
  checkDockerHost('unix:///var/run/docker.sock');
  checkDockerHost('npipe:////./pipe/docker_engine');
  checkDockerHost('npipe:////./pipe/dockerDesktopLinuxEngine');
  for (const host of [undefined, 'tcp://127.0.0.1:2375', 'tcp://remote:2375', 'ssh://remote', 'npipe:////remote/pipe/docker_engine']) assert.throws(() => checkDockerHost(host));
});

test('ambient production/dev/Spring/Java/Docker configuration cannot reach children', () => {
  assert.deepEqual(environment({PATH: 'runtime', POSTGRES_PORT: '5432', POSTGRES_PASSWORD: 'secret', SPRING_APPLICATION_JSON: '{}', SPRING_DATASOURCE_URL: 'remote', JAVA_TOOL_OPTIONS: '-Dspring.datasource.url=remote', JDK_JAVA_OPTIONS: 'remote', DOCKER_HOST: 'tcp://remote:2375', COMPOSE_PROJECT_NAME: 'normal'}), {PATH: 'runtime'});
  const env = backendEnvironment({databasePassword: 'generated-local-secret'});
  assert.equal(env.POSTGRES_PORT, '5433');
  assert.equal(env.POSTGRES_DB, 'mtg_commander_demo');
  assert.equal(env.POSTGRES_USER, 'mtg_commander_demo');
});

test('Windows Path is canonicalised without admitting forbidden case variants', () => {
  const path = String.raw`C:\Program Files\Docker\Docker\resources\bin;C:\Java\bin`;
  assert.deepEqual(environment({Path: path, SystemRoot: String.raw`C:\Windows`, ComSpec: String.raw`C:\Windows\System32\cmd.exe`, Spring_Datasource_Url: 'remote', Docker_Host: 'tcp://remote:2375', Postgres_Port: '5432', Java_Tool_Options: 'injected', NODE_OPTIONS: 'injected'}), {
    PATH: path, SYSTEMROOT: String.raw`C:\Windows`, COMSPEC: String.raw`C:\Windows\System32\cmd.exe`,
  });
  assert.deepEqual(environment({PATH: 'same', Path: 'same'}), {PATH: 'same'});
  assert.throws(() => environment({PATH: 'one', Path: 'another'}), /Conflicting case variants/);
});

test('a Windows-style Path supports native executable lookup for spawned commands', () => {
  // Exercise the same PATH lookup used for Docker/Java without requiring either
  // installation in this dependency-free test (including on Windows CI).
  const source = {Path: dirname(process.execPath)};
  if (process.env.SystemRoot) source.SystemRoot = process.env.SystemRoot;
  const env = environment(source);
  assert.equal(env.PATH, dirname(process.execPath));
  const child = spawnSync('node', ['-p', '21 * 2'], {env, encoding: 'utf8', windowsHide: true});
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0);
  assert.equal(child.stdout.trim(), '42');
});

test('backend IPC shutdown and parent disconnect both permit child cleanup', async t => {
  for (const mode of ['request', 'disconnect']) await t.test(mode, {timeout: 10000}, async () => {
    const code = `
      import {watchBackendShutdown} from ${JSON.stringify(new URL('./demo.mjs', import.meta.url).href)};
      const timer = setInterval(() => {}, 1000);
      const unwatch = watchBackendShutdown(() => {
        clearInterval(timer);
        unwatch();
        process.stdout.write('cleanup-complete');
        if (process.connected) process.disconnect();
      });
      process.send('ready');
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {env: environment(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true});
    const exited = new Promise((resolve, reject) => {child.once('close', (code, signal) => resolve({code, signal})); child.once('error', reject);});
    const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
    let output = '';
    child.stdout.on('data', chunk => {output += chunk;}); child.stderr.resume();
    try {
      await Promise.race([
        new Promise(resolve => child.once('message', value => {assert.equal(value, 'ready'); resolve();})),
        exited.then(() => {throw new Error('IPC child exited before readiness.');}),
      ]);
      if (mode === 'request') child.send({type: 'stop-demo-backend'});
      else child.disconnect();
      assert.deepEqual(await exited, {code: 0, signal: null});
      assert.equal(output, 'cleanup-complete');
    } finally {clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill();}
  });
});

const cfg = {databasePassword: 'local-test-value'};
function container() {
  return {Config: {Image: 'postgres:18', Labels: {'com.docker.compose.project': 'mtg-commander-demo', 'com.docker.compose.service': 'postgres'}, Env: ['POSTGRES_DB=mtg_commander_demo', 'POSTGRES_USER=mtg_commander_demo', `POSTGRES_PASSWORD=${cfg.databasePassword}`]}, State: {Running: true, Health: {Status: 'healthy'}}, NetworkSettings: {Ports: {'5432/tcp': [{HostIp: '127.0.0.1', HostPort: '5433'}]}}, Mounts: [{Type: 'volume', Name: 'mtg-commander-demo-data', Destination: '/var/lib/postgresql'}]};
}
test('container and volume identity checks reject regular, remote-bound and mismatched targets', () => {
  checkContainer(container(), cfg);
  for (const change of [c => c.Config.Labels['com.docker.compose.project'] = 'regular', c => c.Config.Env[0] = 'POSTGRES_DB=mtg_commander_stats', c => c.Config.Env[2] = 'POSTGRES_PASSWORD=wrong', c => c.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0', c => c.NetworkSettings.Ports['5432/tcp'][0].HostPort = '5432', c => c.Mounts[0].Name = 'postgres-data', c => c.State.Running = false, c => c.Config.Image = 'postgres:17']) {
    const value = container(); change(value); assert.throws(() => checkContainer(value, cfg));
  }
  const v = {Name: 'mtg-commander-demo-data', Labels: {'io.mtg-commander.demo': 'true', 'com.docker.compose.project': 'mtg-commander-demo', 'com.docker.compose.volume': 'demo-data'}};
  checkVolume(v);
  assert.throws(() => checkVolume({...v, Name: 'postgres-data'}));
  assert.throws(() => checkVolume({...v, Labels: {}}));
});

test('real HTTP cookie rotation and fresh CSRF, without redirects or response secrets in errors', async () => {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({method: req.method, url: req.url, cookie: req.headers.cookie, csrf: req.headers['x-csrf-token']});
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/csrf') {
      const loggedIn = req.headers.cookie === 'JSESSIONID=rotated';
      if (!loggedIn) res.setHeader('Set-Cookie', 'JSESSIONID=initial; HttpOnly; Path=/');
      res.end(JSON.stringify({headerName: 'X-CSRF-TOKEN', token: loggedIn ? 'fresh' : 'initial-token'}));
    } else if (req.url === '/api/session') {
      assert.equal(req.headers.cookie, 'JSESSIONID=initial');
      assert.equal(req.headers['x-csrf-token'], 'initial-token');
      assert.equal(JSON.parse(body).email, 'ada@commander.example');
      res.setHeader('Set-Cookie', 'JSESSIONID=rotated; HttpOnly; Path=/');
      res.end(JSON.stringify({id: 'ada-id', username: 'Ada'}));
    } else if (req.url === '/api/me') {
      assert.equal(req.headers.cookie, 'JSESSIONID=rotated');
      res.end(JSON.stringify({id: 'ada-id', username: 'Ada'}));
    } else {
      assert.equal(req.headers['x-csrf-token'], 'fresh');
      res.statusCode = 409; res.end(JSON.stringify({detail: 'sensitive-response-value'}));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const session = new Session(`http://127.0.0.1:${server.address().port}`);
    await session.login('ada@commander.example', 'twelve-or-more-test-characters');
    await assert.rejects(session.call('POST', '/decks', {}), error => error.message.includes('409') && !error.message.includes('sensitive-response-value'));
    assert.deepEqual(calls.map(c => c.url), ['/api/csrf', '/api/session', '/api/csrf', '/api/me', '/api/decks']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
