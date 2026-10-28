// Private Codespaces runtime tooling only. Never print caught errors or API bodies.
import {execFileSync} from 'node:child_process';
import {closeSync, existsSync, fsyncSync, lstatSync, openSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Session} from '../tools/demo/api.mjs';
import {verifyTarget} from './seed-demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'GandalfTheJunior/mtg-commander-stats';
export const email = 'tester@commander.example';
const username = 'Codespace Tester';
const base = 'http://127.0.0.1:8080';
const guidance = ' Existing accounts are never overwritten. See docs/development/codespaces.md#test-login-recovery; preserve markers and use a new trusted private Codespace if necessary.';
export class ProvisionError extends Error {}
const requireSafe = (ok, message) => { if (!ok) throw new ProvisionError(message + guidance); };

export function verifyContext(env, space, ports) {
  requireSafe(env.CODESPACES === 'true' && /^[a-z0-9-]+$/.test(env.CODESPACE_NAME ?? '') &&
    env.GITHUB_REPOSITORY === repo && env.MTG_CODESPACE_DEMO_DATA === '1', 'Not the opted-in repository Codespace.');
  requireSafe(space.name === env.CODESPACE_NAME && space.repository?.full_name === repo &&
    space.state === 'Available', 'GitHub Codespace identity could not be verified.');
  requireSafe([5173, 5174].every(port => ports.some(p => p.port_number === port && p.visibility === 'private')) &&
    !ports.some(p => [5432, 8080].includes(p.port_number)), 'Expected private preview ports only; backend/database forwarding is forbidden.');
}

// A durable started marker is written BEFORE the one and only registration POST.
// Any uncertain outcome stays blocked, even when a subsequent login would work.
export async function provision({password, provenance, readMarker, writeMarker, accountId, session}) {
  requireSafe([...password].length >= 12 && /[^\p{White_Space}\u001c-\u001f]/u.test(password),
    'Optional test password must satisfy normal registration requirements (12 Unicode code points).');
  const marker = readMarker();
  const currentId = accountId();
  if (marker) {
    requireSafe(marker.status === 'complete' && JSON.stringify(marker.provenance) === JSON.stringify(provenance) &&
      typeof marker.accountId === 'string' && currentId === marker.accountId, 'Test login marker is incomplete, stale or belongs to another target.');
    let user;
    try { user = await session.login(email, password); }
    catch { throw new ProvisionError('Existing test login could not be verified. Check backend readiness or restore the previous secret; changing the GitHub secret never rotates this account.' + guidance); }
    requireSafe(user.id === currentId, 'Current test login identity does not match its provenance.');
    await session.call('DELETE', '/session', undefined, 204);
    return 'verified existing test login';
  }
  requireSafe(currentId === '', 'Test email already exists without verified provisioning provenance.');
  // Readiness/CSRF failure before this point leaves no started marker or write.
  session.csrf = await session.call('GET', '/csrf');
  writeMarker({status: 'started', provenance}, true);
  const registered = await session.call('POST', '/users', {email, username, password}, 201);
  const user = await session.login(email, password);
  requireSafe(typeof registered.id === 'string' && user.id === registered.id &&
    accountId() === user.id, 'Registration/login/current database identity verification failed.');
  await session.call('DELETE', '/session', undefined, 204);
  writeMarker({status: 'complete', provenance, accountId: user.id}, false);
  return 'created and verified test login';
}

function run(command, args) {
  try {
    // No test password (or arbitrary inherited credentials) to Docker/GitHub CLI.
    const env = Object.fromEntries(['PATH', 'HOME', 'GH_TOKEN', 'GITHUB_TOKEN',
      'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
      'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'POSTGRES_PASSWORD'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    if (command === 'gh') { env.GH_HOST = 'github.com'; delete env.POSTGRES_PASSWORD; }
    else { delete env.GH_TOKEN; delete env.GITHUB_TOKEN; }
    return execFileSync(command, args, {cwd: root, env, encoding: 'utf8', timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024}).trim();
  } catch { throw new ProvisionError('Private preview verification failed; check GitHub CLI access, Docker and backend readiness.' + guidance); }
}
function protectedJson(path) {
  const stat = lstatSync(path);
  requireSafe(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0,
    'Expected a protected local provenance file.');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function main() {
  const password = process.env.MTG_CODESPACE_TEST_PASSWORD;
  delete process.env.MTG_CODESPACE_TEST_PASSWORD;
  if (!password) { console.log('test-login: optional test login not configured.'); return; }
  requireSafe(process.env.HOME && process.cwd() === root, 'Run from the repository root.');
  const name = process.env.CODESPACE_NAME;
  // Validate before interpolating the non-secret Codespace name into CLI arguments.
  requireSafe(process.env.CODESPACES === 'true' && /^[a-z0-9-]+$/.test(name ?? '') &&
    process.env.GITHUB_REPOSITORY === repo && process.env.MTG_CODESPACE_DEMO_DATA === '1', 'Not the opted-in repository Codespace.');
  const space = JSON.parse(run('gh', ['api', '/user/codespaces/' + name]));
  const ports = JSON.parse(run('gh', ['codespace', 'ports', '--codespace', name, '--json', 'sourcePort,visibility']));
  verifyContext(process.env, space, ports.map(p => ({port_number: p.sourcePort, visibility: p.visibility})));
  const state = join(process.env.HOME, '.local/state/mtg-commander-stats');
  requireSafe(protectedJson(join(state, 'demo-seed-once.json')).status === 'complete', 'Demo import is not verified complete.');
  const contexts = JSON.parse(run('docker', ['context', 'inspect']));
  requireSafe(contexts.length === 1 && contexts[0].Endpoints?.docker?.Host === 'unix:///var/run/docker.sock', 'Only the local Codespaces Docker socket is allowed.');
  const config = JSON.parse(run('docker', ['compose', 'config', '--format', 'json', '--no-interpolate']));
  const id = run('docker', ['compose', 'ps', '--quiet', 'postgres']);
  requireSafe(/^[a-f0-9]{64}$/.test(id), 'Expected one local PostgreSQL target.');
  const container = JSON.parse(run('docker', ['inspect', '--format',
    '{"Id":{{json .Id}},"State":{{json .State}},"Labels":{{json .Config.Labels}},"Image":{{json .Config.Image}},"Mounts":{{json .Mounts}},"Ports":{{json .NetworkSettings.Ports}}}', id]));
  verifyTarget(config, container, root, id);
  const bindings = container.Ports?.['5432/tcp'];
  requireSafe(bindings?.length === 1 && bindings[0].HostIp === '127.0.0.1' && bindings[0].HostPort === '5432',
    'PostgreSQL must use only the expected loopback port.');
  const db = 'mtg_commander_stats';
  const sql = query => run('docker', ['exec', id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', db, '-d', db, '-Atc', query]);
  const volume = config.volumes['postgres-data'].name;
  const volumeInfo = JSON.parse(run('docker', ['volume', 'inspect', volume]));
  requireSafe(volumeInfo.length === 1 && volumeInfo[0].Name === volume && volumeInfo[0].CreatedAt, 'Volume identity unavailable.');
  // Check real seeded account state and bind the loopback application to this DB
  // using the unchanged per-Codespace demo password, never the optional secret.
  requireSafe(sql("SELECT count(*) FROM public.users WHERE email IN ('ada@commander.example','bruno@commander.example','cleo@commander.example','dara@commander.example','emil@commander.example','gideon@commander.example','faye@commander.example')") === '7', 'Original demo accounts are missing.');
  const adaId = sql("SELECT id FROM public.users WHERE email = 'ada@commander.example'");
  const ada = new Session(base);
  const demoPassword = protectedJson(join(root, '.demo/credentials.json')).accountPassword;
  requireSafe((await ada.login('ada@commander.example', demoPassword)).id === adaId, 'Loopback backend does not match the verified fixture database.');
  await ada.call('DELETE', '/session', undefined, 204);
  const provenance = {codespace: name, repository: repo, root, project: config.name, volume,
    volumeCreatedAt: volumeInfo[0].CreatedAt, adaId};
  const path = join(state, 'test-login.json');
  const result = await provision({password, provenance,
    readMarker: () => existsSync(path) ? protectedJson(path) : null,
    writeMarker: (value, first) => {
      mkdirSync(state, {recursive: true, mode: 0o700});
      if (first) writeFileSync(path, JSON.stringify(value) + '\n', {mode: 0o600, flag: 'wx', flush: true});
      else {
        const temporary = path + '.tmp';
        writeFileSync(temporary, JSON.stringify(value) + '\n', {mode: 0o600, flag: 'wx', flush: true});
        renameSync(temporary, path);
      }
      const directory = openSync(state, 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
    },
    accountId: () => sql("SELECT id FROM public.users WHERE email = 'tester@commander.example'"),
    session: new Session(base)});
  console.log('test-login: ' + result + '.');
}

export async function runSafe() {
  try { await main(); }
  catch (error) {
    console.error(error instanceof ProvisionError ? 'test-login: ' + error.message :
      'test-login: provisioning unresolved; no automatic retry or password reset.' + guidance);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // No CLI lock-bypass/recovery/target options. The worker imports the same main
  // under a kernel lock held for its entire lifetime, including every API call.
  if (process.argv.length !== 2) {
    console.error('test-login: no arguments accepted.');
    process.exitCode = 1;
  } else if (!process.env.MTG_CODESPACE_TEST_PASSWORD) {
    await runSafe();
  } else {
    try {
      const state = join(process.env.HOME, '.local/state/mtg-commander-stats');
      mkdirSync(state, {recursive: true, mode: 0o700});
      execFileSync('flock', ['-x', join(state, 'test-login.lock'), process.execPath,
        '--input-type=module', '--eval',
        'import {runSafe} from ' + JSON.stringify(import.meta.url) + '; await runSafe();'], {stdio: 'inherit'});
    } catch { process.exitCode = 1; }
  }
}
