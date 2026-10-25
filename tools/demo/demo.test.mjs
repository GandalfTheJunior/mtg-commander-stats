import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {dirname} from 'node:path';
import {users, groups, games, archivedDeck, results, cards, deckRequest, readOutcome, percentage} from './fixture.mjs';
import {validateCommand, environment, backendEnvironment, backendArguments, generateCredentials, validateCredentials, checkContainer, checkVolume, checkDockerHost} from './demo.mjs';
import {Session} from './api.mjs';

test('fixture eligibility, ownership, outcomes, lifecycle and checkable manifest', () => {
  assert.equal(users.length, 7);
  assert.equal(groups.length, 2);
  assert.equal(new Set(users.map(u => u.email)).size, 7);
  assert.equal(games.length, 32);
  assert.equal(games.filter(g => g.result === 'DRAW').length, 8);
  assert.equal(users.flatMap(u => u.decks).length, 21);
  assert.equal(new Set(games.flatMap(g => g.participants.map(p => p.deck))).size, 14);
  for (const user of users) {
    assert.match(user.email, /@commander\.example$/);
    assert.ok(user.decks.length >= 2 && user.decks.length <= 3);
  }
  for (const game of games) {
    const group = groups.find(g => g.key === game.group);
    assert.ok(group.members.includes(group.owner));
    const n = game.participants.length;
    assert.ok(n >= 2 && n <= group.members.length);
    assert.deepEqual(game.participants.map(p => p.startPosition).toSorted((a, b) => a - b), Array.from({length: n}, (_, i) => i + 1));
    assert.notDeepEqual(game.participants.map(p => p.startPosition), Array.from({length: n}, (_, i) => i + 1));
    const facts = game.participants.map(p => readOutcome(game, p));
    if (game.result === 'DRAW') {
      assert.ok(facts.some(p => p.stillInGame) && facts.some(p => !p.stillInGame));
      assert.ok(game.participants.every(p => !Object.hasOwn(p, 'placement') && !Object.hasOwn(p, 'winner')));
    } else {
      const ranks = facts.map(p => p.placement).toSorted((a, b) => a - b);
      assert.equal(ranks.filter(r => r === 1).length, 1);
      ranks.forEach((rank, i) => assert.ok(rank === i + 1 || rank === ranks[i - 1]));
      if (game.alternateWinCon && n >= 3) assert.equal(facts.filter(p => p.placement === 2 && p.stillInGame).length, 2);
      if (!game.alternateWinCon) assert.ok(game.participants.every(p => !Object.hasOwn(p, 'stillInGame') && !Object.hasOwn(p, 'winner')));
    }
    assert.equal(new Set(game.participants.map(p => p.user)).size, n);
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
  assert.deepEqual(friday.rows.filter(r => r.user === 'ada').map(r => [r.games, r.wins, r.winRatePercent]),
    [[20, 5, 25], [5, 5, 100], [15, 0, 0], [0, 0, null]]);
  assert.deepEqual(groups.map(g => g.members.length), [6, 4]);
  assert.ok(!groups[0].members.includes('faye') && !groups[1].members.includes('gideon'));
  assert.ok(games.some(g => g.participants.map(p => readOutcome(g, p).placement).sort().join(',') === '1,2,2,4'));
  assert.deepEqual([...new Set(games.filter(g => g.winner).map(g => g.participants.find(p => p.user === g.winner).startPosition))].sort(), [1, 2, 3, 4, 5, 6]);
  for (const n of [2, 3, 4, 5, 6]) assert.deepEqual(expected.filters[n], results(undefined, n));
  // Independent, hand-counted sentinels: 2-player Friday has four games.
  const two = expected.filters[2][0];
  assert.deepEqual(two.startPositions, [{playerCount: 2, seats: [
    {startPosition: 1, games: 4, wins: 2, winRatePercent: 50},
    {startPosition: 2, games: 4, wins: 1, winRatePercent: 25},
  ]}]);
  assert.deepEqual(Object.fromEntries(two.manaColors.map(r => [r.color, [r.games, r.wins, r.winRatePercent]])),
    {W: [1, 1, 100], U: [1, 1, 100], B: [1, 1, 100], R: [2, 1, 50], G: [4, 3, 75], C: [3, 0, 0]});
  for (const n of [5, 6]) {
    const absent = expected.filters[n][1];
    assert.ok(absent.rows.every(r => r.games === 0 && r.winRatePercent === null));
    assert.ok([...absent.startPositions[0].seats, ...absent.manaColors].every(r => r.games === 0 && r.wins === 0 && r.winRatePercent === null));
  }
  const alternate = games.find(g => g.key === 'friday-6-alternate');
  assert.deepEqual(alternate.participants.map(p => readOutcome(alternate, p)), [
    {placement: 2, stillInGame: true}, {placement: 1, stillInGame: true},
    {placement: 2, stillInGame: true}, {placement: 4, stillInGame: false},
    {placement: 5, stillInGame: false}, {placement: 6, stillInGame: false},
  ]);
  assert.deepEqual(games.find(g => g.key === 'friday-4-draw').participants.map(p => p.stillInGame), [true, false, false, false]);
  assert.equal(percentage(1, 32), 3.13);
  assert.equal(percentage(1, 12), 8.33);
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

test('fresh demo account passwords have exactly 12 random characters; existing 32-character credentials remain valid', () => {
  const generated = Array.from({length: 32}, generateCredentials);
  assert.equal(new Set(generated.map(c => c.accountPassword)).size, generated.length);
  for (const cfg of generated) {
    assert.match(cfg.accountPassword, /^[A-Za-z0-9_-]{12}$/);
    assert.match(cfg.databasePassword, /^[a-f0-9]{64}$/);
    assert.equal(validateCredentials(cfg), cfg);
  }
  const legacy = {...generated[0], accountPassword: 'a'.repeat(32)};
  assert.equal(validateCredentials(legacy), legacy);
  for (const length of [0, 11, 13, 31, 33]) assert.throws(() => validateCredentials({...legacy, accountPassword: 'a'.repeat(length)}));
});

test('interactive backend uses only the normal jar; ambient flags cannot enable fixture seeding', () => {
  const args = backendArguments('/built/backend.jar');
  assert.deepEqual(args.slice(0, 2), ['-jar', '/built/backend.jar']);
  assert.ok(args.includes('--server.port=8080'));
  assert.ok(!args.some(arg => /fixture|classpath.txt|allow-isolated|-cp/.test(arg)));
});

test('demo payloads use pinned real identities and separate display sides; ordinary cards have no chosenColor', () => {
  for (const deck of users.flatMap(u => u.decks)) {
    const request = deckRequest(deck);
    assert.deepEqual(Object.keys(request), ['name', 'commanders']);
    assert.equal(request.commanders.length, deck.commanders.length);
    for (const [index, commander] of deck.commanders.entries()) {
      const metadata = cards[commander.card];
      assert.equal(metadata.object, 'card');
      assert.equal(metadata.legalities.commander, 'legal');
      assert.equal(request.commanders[index].selectionRef.scryfallCardId, metadata.id);
      assert.equal(Object.hasOwn(request.commanders[index], 'chosenColor'), ['The Prismatic Piper', 'Faceless One', 'Clara Oswald'].includes(metadata.name));
      assert.ok(!Object.hasOwn(request.commanders[index], 'artworkFaceIndex'));
      assert.ok(!Object.hasOwn(request.commanders[index], 'colorIdentity'));
    }
  }
  assert.equal(cards['The Ur-Dragon'].oracle_id, cards['The Ur-Dragon (alternate art)'].oracle_id);
  assert.notEqual(cards['The Ur-Dragon'].illustration_id, cards['The Ur-Dragon (alternate art)'].illustration_id);
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

test('Windows ProgramFiles survives sanitisation for Compose plugin discovery', () => {
  const programFiles = String.raw`C:\Program Files`;
  for (const key of ['ProgramFiles', 'PROGRAMFILES', 'programfiles']) {
    assert.deepEqual(environment({[key]: programFiles, Path: 'docker-and-java-path', DOCKER_HOST: 'tcp://remote:2375', DOCKER_CONFIG: 'custom-plugins-and-credentials', Docker_Config: 'case-variant', SPRING_APPLICATION_JSON: '{}', JAVA_TOOL_OPTIONS: 'injected', JDK_JAVA_OPTIONS: 'injected', POSTGRES_PORT: '5432', POSTGRES_PASSWORD: 'regular-secret', COMPOSE_FILE: 'regular-compose.yaml'}), {
      PROGRAMFILES: programFiles, PATH: 'docker-and-java-path',
    });
  }
  assert.deepEqual(environment({ProgramFiles: programFiles, PROGRAMFILES: programFiles}), {PROGRAMFILES: programFiles});
  assert.throws(() => environment({ProgramFiles: programFiles, PROGRAMFILES: 'another-location'}), /Conflicting case variants/);
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
    const exited = new Promise((resolve, reject) => {child.once('exit', (code, signal) => resolve({code, signal})); child.once('error', reject);});
    const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
    // Parent-initiated IPC disconnect may omit ChildProcess 'close'. Check
    // process exit and stdout EOF separately so output is still fully drained.
    const stdoutEnded = new Promise(resolve => child.stdout.once('end', resolve));
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
      await stdoutEnded;
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
