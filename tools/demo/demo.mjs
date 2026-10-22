import {spawn, spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {delimiter, resolve} from 'node:path';
import {seed} from './api.mjs';
import {trackBackend} from './backend-process.mjs';

export class DemoError extends Error {}

export const root = fileURLToPath(new URL('../../', import.meta.url));
const stateDir = resolve(root, '.demo');
const configPath = resolve(stateDir, 'credentials.json');
const marker = resolve(stateDir, 'seed-status.json');
const volume = 'mtg-commander-demo-data';
const project = 'mtg-commander-demo';
const db = 'mtg_commander_demo';
const label = 'io.mtg-commander.demo';

// Do not inherit Spring, JDBC, Java option injection, Compose, Docker remote,
// Maven, or regular POSTGRES settings. Keep only OS/runtime discovery variables,
// including ProgramFiles for Docker Compose CLI plugin discovery on Windows.
export function environment(source = process.env) {
  const allowed = new Set(['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'JAVA_HOME', 'PROGRAMFILES']);
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = key.toUpperCase();
    if (!allowed.has(normalized)) continue;
    // Windows names are case-insensitive. Pass exactly one canonical spelling,
    // rejecting conflicting duplicates rather than choosing an arbitrary path.
    if (Object.hasOwn(env, normalized) && env[normalized] !== value) throw new DemoError('Conflicting case variants of an allowed environment variable.');
    env[normalized] = value;
  }
  return env;
}
export function validateCommand(args) {
  const [command, ...flags] = args;
  const expected = {up: [], stop: [], backend: [], seed: ['--allow-demo-seed'], reset: ['--destroy-demo-data']}[command];
  if (!expected || JSON.stringify(flags) !== JSON.stringify(expected)) throw new DemoError('Use: demo.mjs up | stop | backend | seed --allow-demo-seed | reset --destroy-demo-data. No URL/target overrides are accepted.');
  return command;
}
function run(args, env = environment()) {
  const result = spawnSync('docker', args, {cwd: root, env, encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new DemoError('Docker operation failed. Check the local engine, demo port 5433 and demo credentials; output suppressed to protect secrets.');
  return result.stdout.trim();
}
export function checkDockerHost(host) {
  if (typeof host !== 'string' || !(host.startsWith('unix:///') || /^npipe:\/{2,4}\.\/pipe\/[^/]+$/.test(host))) throw new DemoError('Demo requires a local Docker socket context; remote/TCP contexts are rejected.');
}
function localDocker() {
  const contexts = JSON.parse(run(['context', 'inspect']));
  const host = contexts[0]?.Endpoints?.docker?.Host;
  checkDockerHost(host);
}
export function generateCredentials() {
  return {databasePassword: randomBytes(32).toString('hex'), accountPassword: randomBytes(9).toString('base64url')};
}
export function validateCredentials(cfg) {
  if (!/^[a-f0-9]{64}$/.test(cfg.databasePassword) || !/^(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{32})$/.test(cfg.accountPassword)) throw new DemoError('Invalid demo credentials file. Preserve it for the existing demo volume.');
  return cfg;
}
function config(create = false) {
  if (!existsSync(configPath)) {
    if (!create) throw new DemoError('Run demo.mjs up first.');
    mkdirSync(stateDir, {recursive: true, mode: 0o700});
    writeFileSync(configPath, JSON.stringify(generateCredentials(), null, 2) + '\n', {flag: 'wx', mode: 0o600});
  }
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  return validateCredentials(cfg);
}
function compose(args, cfg) {
  return run(['compose', '--env-file', resolve(root, 'tools/demo/compose.env'), '-f', resolve(root, 'tools/demo/compose.yaml'), '-p', project, ...args], {...environment(), DEMO_POSTGRES_PASSWORD: cfg.databasePassword});
}
export function checkVolume(v) {
  if (v.Name !== volume || v.Labels?.[label] !== 'true' || v.Labels?.['com.docker.compose.project'] !== project || v.Labels?.['com.docker.compose.volume'] !== 'demo-data') throw new DemoError('Refusing an unrecognized demo volume.');
}
function inspectVolume() { checkVolume(JSON.parse(run(['volume', 'inspect', volume]))[0]); }
export function checkContainer(c, cfg) {
  const env = Object.fromEntries(c.Config.Env.map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
  const ports = c.NetworkSettings.Ports['5432/tcp'];
  if (c.Config.Labels['com.docker.compose.project'] !== project || c.Config.Labels['com.docker.compose.service'] !== 'postgres' || c.Config.Image !== 'postgres:18'
    || !c.State.Running || c.State.Health?.Status !== 'healthy'
    || ports?.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '5433'
    || !c.Mounts.some(m => m.Type === 'volume' && m.Name === volume && m.Destination === '/var/lib/postgresql')
    || env.POSTGRES_DB !== db || env.POSTGRES_USER !== db || env.POSTGRES_PASSWORD !== cfg.databasePassword) throw new DemoError('Refusing a backend/database target that is not the isolated local demo.');
}
function target(cfg) {
  inspectVolume();
  const id = compose(['ps', '-q', 'postgres'], cfg);
  if (!id || id.includes('\n')) throw new DemoError('Exactly one healthy demo database is required.');
  checkContainer(JSON.parse(run(['inspect', id]))[0], cfg);
  return id;
}
export function backendEnvironment(cfg) {
  return {...environment(), POSTGRES_PORT: '5433', POSTGRES_DB: db, POSTGRES_USER: db, POSTGRES_PASSWORD: cfg.databasePassword};
}
export const BACKEND_STOP = 'stop-demo-backend';

export function backendArguments(jar, context = '') {
  const settings = ['--spring.config.location=classpath:/application.yaml', '--server.address=127.0.0.1', `--server.port=${context ? 0 : 8080}`, `--server.servlet.context-path=${context || '/'}`, '--spring.datasource.url=jdbc:postgresql://127.0.0.1:5433/mtg_commander_demo', '--spring.datasource.username=mtg_commander_demo'];
  if (!context) return ['-jar', jar, ...settings];
  const classpathFile = resolve(root, 'backend/target/demo-classpath.txt');
  const launcher = 'io.github.gandalfthejunior.mtgcommanderstats.demo.OfflineDemoSeedApplication';
  if (!existsSync(classpathFile) || !existsSync(resolve(root, 'backend/target/test-classes', launcher.replaceAll('.', '/') + '.class'))) throw new DemoError('Build the offline seed launcher first: ./mvnw -Pdemo-seed -DskipTests package from backend/ (mvnw.cmd on Windows).');
  const classpath = [resolve(root, 'backend/target/test-classes'), resolve(root, 'backend/target/classes'), readFileSync(classpathFile, 'utf8').trim()].join(delimiter);
  return ['-cp', classpath, launcher, '--allow-isolated-demo-seed', ...settings];
}

// IPC requests let the verifier stop the wrapper cooperatively on Windows too;
// child.kill('SIGINT') would terminate it before it can clean up its Java child.
export function watchBackendShutdown(stop) {
  const message = value => { if (value?.type === BACKEND_STOP) stop(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  process.on('message', message); process.once('disconnect', stop);
  return () => {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    process.removeListener('message', message); process.removeListener('disconnect', stop);
  };
}
async function backend(cfg, action) {
  if (!existsSync(resolve(root, 'backend/target'))) throw new DemoError('Build the existing backend jar first; see demo documentation.');
  const jars = readdirSync(resolve(root, 'backend/target')).filter(f => f.endsWith('.jar'));
  if (jars.length !== 1) throw new DemoError('Build the existing backend jar first; see demo documentation.');
  const context = action ? `/demo-${randomBytes(16).toString('hex')}` : '';
  const args = backendArguments(resolve(root, 'backend/target', jars[0]), context);
  const child = spawn('java', args, {cwd: root, env: backendEnvironment(cfg), stdio: [action ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true});
  const lifecycle = trackBackend(child, {seed: Boolean(action)});
  const unwatch = watchBackendShutdown(lifecycle.stop);
  let timer;
  try {
    const port = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new DemoError('Demo backend startup timed out; verify the jar, Java 25, Docker and credentials.')), 120000);
      let tail = '';
      child.stdout.on('data', chunk => {
        tail = (tail + chunk.toString()).slice(-16000);
        const match = tail.match(/Tomcat started on port (\d+)/);
        if (match) resolve(Number(match[1]));
      });
      // Drain stderr without exposing credentials or authentication material.
      child.stderr.resume();
      lifecycle.exited.then(() => reject(new DemoError('Demo backend exited before startup; rebuild the jar and check the demo database.')));
    });
    clearTimeout(timer);
    if (action) await action(`http://127.0.0.1:${port}${context}`);
    else {
      console.log('Demo backend ready on http://localhost:8080; PostgreSQL is 127.0.0.1:5433/mtg_commander_demo. Ctrl+C stops it.');
      const {code} = await lifecycle.exited;
      if (code !== 0 && !lifecycle.stopping) throw new DemoError('Demo backend stopped unexpectedly.');
    }
  } finally {
    clearTimeout(timer); lifecycle.stop();
    try {
      await lifecycle.finish();
    } catch {
      throw new DemoError('Offline seed shutdown/fixture acknowledgement failed; no completed marker written. Use explicit demo reset before retrying.');
    } finally {
      unwatch();
      if (process.connected) process.disconnect();
    }
  }
}

export async function main(args) {
  const command = validateCommand(args); // Reject before Docker, credentials, or writes.
  localDocker();
  const cfg = config(command === 'up');
  const lock = resolve(stateDir, 'operation.lock');
  try { writeFileSync(lock, '', {flag: 'wx', mode: 0o600}); }
  catch { throw new DemoError('Another demo operation is active, or was interrupted. Stop it before removing .demo/operation.lock manually.'); }
  try {
    if (command === 'up') {
      const volumes = run(['volume', 'ls', '--format', '{{.Name}}']).split('\n');
      if (volumes.includes(volume)) inspectVolume();
      compose(['up', '-d', '--wait'], cfg); target(cfg);
      console.log('Demo PostgreSQL ready at 127.0.0.1:5433. Local credentials: .demo/credentials.json (do not share).');
    } else if (command === 'reset') {
      inspectVolume(); // Never down -v; remove only this exact validated volume.
      compose(['down'], cfg);
      run(['volume', 'rm', volume]);
      if (existsSync(marker)) unlinkSync(marker);
      console.log('Deleted ONLY mtg-commander-demo-data. Credentials retained. Run up, then seed explicitly.');
    } else if (command === 'stop') {
      inspectVolume(); compose(['stop'], cfg); console.log('Demo database stopped; data retained.');
    } else if (command === 'backend') {
      target(cfg);
      await backend(cfg);
    } else {
      target(cfg);
      if (existsSync(marker)) throw new DemoError('Seed already attempted/completed. No writes performed. For partial recovery use the explicit demo-only reset in the documentation.');
      console.log('Starting temporary demo backend; seeding and verifying through the real APIs.');
      await backend(cfg, async base => {
        const id = target(cfg);
        // Read-only safety check: reject ANY existing accounts, even if local status was lost.
        const table = run(['exec', id, 'psql', '-U', db, '-d', db, '-Atc', "SELECT to_regclass('public.users')"]);
        if (table !== 'users' || run(['exec', id, 'psql', '-U', db, '-d', db, '-Atc', 'SELECT count(*) FROM public.users']) !== '0') throw new DemoError('Demo database is not empty; refusing to seed or clean up existing data.');
        writeFileSync(marker, JSON.stringify({status: 'started'}), {flag: 'wx', mode: 0o600});
        await seed(base, cfg.accountPassword);
      });
      writeFileSync(marker, JSON.stringify({status: 'complete'}), {mode: 0o600});
      console.log('Demo verified offline: 6 accounts, 2 groups, 12 played + 6 unused decks, 36 games. Login: ada@commander.example; password is accountPassword in .demo/credentials.json. Expected results: tools/demo/expected-results.json.');
    }
  } finally { unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    // Intentionally omit arbitrary exception details: HTTP/process/assert errors can contain secrets.
    console.error(error instanceof DemoError ? error.message : 'Demo operation failed. Check command opt-in, local Docker context, .demo/operation.lock, seed-status.json, jar and database target. No automatic cleanup/retry. See docs/development/demo.md.');
    process.exitCode = 1;
  });
}
