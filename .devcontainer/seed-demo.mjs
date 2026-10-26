// Opt-in Codespaces-only, one-time import of the existing verified offline demo.
// No database reset, schema DDL, or automatic retry of a partially attempted seed.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const postgres = 'mtg_commander_stats';
const demo = 'mtg_commander_demo';
const demoProject = 'mtg-commander-demo';
const demoVolume = 'mtg-commander-demo-data';
const maxBuffer = 32 * 1024 * 1024;
const marker = join(process.env.HOME ?? '', '.local/state/mtg-commander-stats/demo-seed-once.json');

export class SeedError extends Error {}

function requireSafe(ok, message) {
  if (!ok) throw new SeedError(message);
}

// Validate immutable Docker provenance BEFORE any SQL, demo startup, or writes.
export function verifyTarget(config, container, rootDir, id) {
  const volume = config.volumes?.['postgres-data']?.name;
  const service = config.services?.postgres;
  requireSafe(config.name && volume && service?.image === 'postgres:18' &&
    service.volumes?.some(v => v.type === 'volume' && v.source === 'postgres-data' &&
      v.target === '/var/lib/postgresql'), 'Unexpected Codespaces Compose configuration.');
  const labels = container.Labels ?? {};
  requireSafe(container.Id === id && container.Image === 'postgres:18' &&
    container.State?.Running === true && container.State?.Health?.Status === 'healthy' &&
    labels['com.docker.compose.project'] === config.name &&
    labels['com.docker.compose.service'] === 'postgres' &&
    labels['com.docker.compose.project.working_dir'] === rootDir &&
    labels['com.docker.compose.project.config_files'] === join(rootDir, 'compose.yaml'),
  'Refusing a PostgreSQL container outside this Codespace Compose project.');
  const mounts = container.Mounts?.filter(v => v.Destination === '/var/lib/postgresql') ?? [];
  requireSafe(mounts.length === 1 && mounts[0].Type === 'volume' &&
    mounts[0].Name === volume && mounts[0].RW === true,
  'Target database does not use the expected persistent volume.');
}

export function verifySource(container, id) {
  const labels = container.Labels ?? {};
  const mounts = container.Mounts?.filter(v => v.Destination === '/var/lib/postgresql') ?? [];
  requireSafe(container.Id === id && container.Image === 'postgres:18' &&
    container.State?.Running === true && container.State?.Health?.Status === 'healthy' &&
    labels['com.docker.compose.project'] === demoProject &&
    labels['com.docker.compose.service'] === 'postgres' &&
    mounts.length === 1 && mounts[0].Type === 'volume' && mounts[0].Name === demoVolume,
  'Refusing an unrecognized source demo PostgreSQL container.');
}

export function decideSeed(markerStatus, counts) {
  if (markerStatus === 'started') throw new SeedError(
    'Previous Codespaces demo import was interrupted. No automatic retry; use a NEW Codespace or inspect the database.');
  if (markerStatus === 'complete') return 'skip';
  if (markerStatus !== null) throw new SeedError('Unrecognized Codespaces demo import marker.');
  requireSafe(counts.length > 0 && counts.every(row => row.name && Number.isSafeInteger(row.count) && row.count >= 0),
    'Could not inspect every application table.');
  return counts.some(row => row.count > 0) ? 'existing-data' : 'seed';
}

function safeRun(program, args, options = {}) {
  try {
    return execFileSync(program, args, {
      cwd: options.cwd ?? root, encoding: options.encoding === undefined ? 'utf8' : options.encoding,
      maxBuffer, stdio: ['ignore', 'pipe', 'pipe'], input: options.input, env: options.env ?? process.env,
    });
  } catch {
    // Never print database credentials, SQL results, cookies, or arbitrary child output.
    throw new SeedError('Demo initialization command failed: ' + program + ' ' + args[0] + '. Check private Codespace logs.');
  }
}

function docker(args, options) { return safeRun('docker', args, options); }
function textDocker(args) { return docker(args).trim(); }
function inspect(id) {
  return JSON.parse(textDocker(['inspect', '--format',
    '{"Id":{{json .Id}},"State":{{json .State}},"Labels":{{json .Config.Labels}},' +
    '"Image":{{json .Config.Image}},"Mounts":{{json .Mounts}}}', id]));
}
function sql(id, db, query) {
  return textDocker(['exec', id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', db, '-d', db, '-Atc', query]);
}
function tables(id) {
  const tableList = sql(id, postgres,
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'flyway_schema_history' ORDER BY tablename");
  const names = tableList.split('\n').filter(Boolean);
  requireSafe(names.includes('users') && names.includes('decks') &&
    names.includes('play_groups') && names.includes('games'),
  'The target database has not completed expected Flyway migrations.');
  return names.map(name => {
    requireSafe(/^[a-z][a-z0-9_]*$/.test(name), 'Unsafe/unexpected application table name.');
    const value = sql(id, postgres, 'SELECT count(*) FROM public."' + name + '"');
    requireSafe(/^\d+$/.test(value), 'Unable to verify empty target table.');
    return {name, count: Number(value)};
  });
}
function fingerprint(id, db) {
  return sql(id, db, "SELECT coalesce(string_agg(version || ':' || coalesce(checksum::text, 'null'), ',' ORDER BY installed_rank), '') FROM public.flyway_schema_history WHERE success");
}

function markerStatus() {
  if (!existsSync(marker)) return null;
  try { return JSON.parse(readFileSync(marker, 'utf8')).status; }
  catch { throw new SeedError('Unreadable demo import marker; refusing to retry.'); }
}
function record(status) {
  mkdirSync(dirname(marker), {recursive: true, mode: 0o700});
  writeFileSync(marker, JSON.stringify({status}) + '\n', {
    mode: 0o600, flag: status === 'started' ? 'wx' : 'w',
  });
}
function runtimeEnv() {
  // Do not pass regular DB passwords / Spring / Docker remote overrides to Maven or demo processes.
  return Object.fromEntries(['PATH', 'HOME', 'JAVA_HOME', 'USER', 'TMPDIR'].filter(k => process.env[k])
    .map(k => [k, process.env[k]]));
}
function nodeDemo(action, extra = []) {
  safeRun(process.execPath, [join(root, 'tools/demo/demo.mjs'), action, ...extra], {env: runtimeEnv()});
}
function demoId() {
  const ids = textDocker(['ps', '--no-trunc', '-q',
    '--filter', 'label=com.docker.compose.project=' + demoProject,
    '--filter', 'label=com.docker.compose.service=postgres']);
  requireSafe(/^[a-f0-9]{64}$/.test(ids), 'Expected exactly one running isolated demo database.');
  verifySource(inspect(ids), ids);
  return ids;
}

export function main() {
  requireSafe(process.env.MTG_CODESPACE_DEMO_DATA === '1' && /^[a-z0-9-]+$/.test(process.env.CODESPACE_NAME ?? ''),
    'Codespaces-only demo seed is not enabled.');
  requireSafe(process.env.HOME && resolve(root) === process.cwd(),
    'Run only from the Codespace repository root.');
  const config = JSON.parse(textDocker(['compose', 'config', '--format', 'json', '--no-interpolate']));
  const targetId = textDocker(['compose', 'ps', '--quiet', 'postgres']);
  requireSafe(/^[a-f0-9]{64}$/.test(targetId), 'Expected one PostgreSQL target.');
  verifyTarget(config, inspect(targetId), resolve(root), targetId);

  const status = markerStatus();
  if (status === 'complete') {
    console.log('demo: earlier import completed; preserved existing data.');
    return;
  }
  // A DB with any application data MUST NOT be overwritten or seeded again.
  const decision = decideSeed(status, tables(targetId));
  if (decision === 'existing-data') {
    console.log('demo: existing application data found; leaving database untouched.');
    return;
  }

  record('started'); // Deliberately fail closed after interruption, including during build.
  let sourceStarted = false;
  try {
    console.log('demo: creating a fresh isolated verified fixture, no existing app data touched.');
    safeRun(join(root, 'backend/mvnw'), ['-B', '-Pdemo-seed', '-DskipTests', 'package'], {
      cwd: join(root, 'backend'), env: runtimeEnv(),
    });
    nodeDemo('up');
    sourceStarted = true;
    nodeDemo('seed', ['--allow-demo-seed']);
    const sourceId = demoId();
    requireSafe(sql(sourceId, demo, 'SELECT count(*) FROM public.users') === '7',
      'Demo source is not the expected seven-account fixture.');
    requireSafe(fingerprint(sourceId, demo) === fingerprint(targetId, postgres),
      'Source and target Flyway versions/checksums do not match; refusing import.');
    requireSafe(decideSeed(null, tables(targetId)) === 'seed',
      'Application data appeared during demo preparation; refusing import.');
    // pg_restore single transaction: failure rolls back COPYs, without dropping schema.
    // Do NOT copy Flyway history; both databases were migrated independently.
    const archive = docker(['exec', sourceId, 'pg_dump', '-U', demo, '-d', demo,
      '--format=custom', '--data-only', '--no-owner', '--no-acl',
      '--exclude-table=public.flyway_schema_history'], {encoding: null});
    requireSafe(archive.length > 0, 'Empty demo PostgreSQL data archive.');
    docker(['exec', '-i', targetId, 'pg_restore', '-U', postgres, '-d', postgres,
      '--data-only', '--single-transaction', '--exit-on-error', '--no-owner',
      '--no-acl'], {input: archive, encoding: null});
    record('complete');
    console.log('demo: imported 7 accounts, 21 decks, 2 groups, 32 games once. Credentials in private .demo/credentials.json.');
  } finally {
    if (sourceStarted) {
      try { nodeDemo('stop'); }
      catch { console.error('demo: source database could not be stopped; no volumes were removed.'); }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (err) {
    console.error(err instanceof SeedError ? err.message : 'Demo initialization refused; see private Codespaces logs.');
    process.exitCode = 1;
  }
}
