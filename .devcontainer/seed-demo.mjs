// Opt-in Codespaces-only, one-time import of the existing verified offline demo.
// No database reset, schema DDL, or automatic retry of a partially attempted seed.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {summarizeDiagnostics} from '../tools/demo/diagnostics.mjs';

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

export function safeRun(program, args, options = {}) {
  try {
    return execFileSync(program, args, {
      cwd: options.cwd ?? root, encoding: options.encoding === undefined ? 'utf8' : options.encoding,
      maxBuffer, stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      input: options.input, env: options.env ?? process.env,
    });
  } catch (error) {
    // Never print database credentials, SQL results, cookies, or arbitrary child output.
    const diagnostic = options.demoDiagnostics ? summarizeDiagnostics(error.stdout, error.stderr) : '';
    throw new SeedError('Demo initialization failed during ' + (options.stage ?? 'setup') +
      (diagnostic ? ' [' + diagnostic + ']' : '') + '. No automatic retry; preserve initialization markers.');
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

// Explicit recovery is permitted only when the *entire* app database is empty
// and the independently verified demo source was completed on this Codespace.
export function decideRecovery(status, counts, sourceStatus) {
  requireSafe(status === 'started', 'Recovery requires an interrupted Codespaces import marker.');
  requireSafe(sourceStatus === 'complete', 'Recovery requires a verified completed demo seed.');
  requireSafe(decideSeed(null, counts) === 'seed',
    'Recovery refused: application data already exists. No destructive cleanup is allowed.');
  return 'recover';
}

function sourceSeedStatus() {
  const path = join(root, '.demo/seed-status.json');
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')).status; }
  catch { throw new SeedError('Unreadable isolated demo seed status.'); }
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
  safeRun(process.execPath, [join(root, 'tools/demo/demo.mjs'), action, ...extra], {env: runtimeEnv(), stage: 'isolated demo ' + action, demoDiagnostics: true});
}
function demoId() {
  const ids = textDocker(['ps', '--no-trunc', '-q',
    '--filter', 'label=com.docker.compose.project=' + demoProject,
    '--filter', 'label=com.docker.compose.service=postgres']);
  requireSafe(/^[a-f0-9]{64}$/.test(ids), 'Expected exactly one running isolated demo database.');
  verifySource(inspect(ids), ids);
  return ids;
}

// Keep the source fixture untouched; import only rows into an already migrated
// schema. pg_restore deliberately sets search_path to empty. The deferred group
// owner trigger uses unqualified table names: restore public search_path BEFORE
// checking deferred constraints, while still inside the same transaction.
export function restorationSql(plainDump, names) {
  requireSafe(typeof plainDump === 'string' && plainDump.length > 0 &&
    Array.isArray(names) && names.length > 0 &&
    names.every(name => /^[a-z][a-z0-9_]*$/.test(name)),
  'Invalid data-only restore input or application table list.');
  const qualified = names.map(name => 'public."' + name + '"');
  const existing = qualified.map(name => 'EXISTS (SELECT 1 FROM ' + name + ')').join(' OR ');
  return [
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    'LOCK TABLE ' + qualified.join(', ') + ' IN ACCESS EXCLUSIVE MODE;',
    'DO $codespace_data_guard$ BEGIN',
    "IF " + existing + " THEN RAISE EXCEPTION 'Refusing to restore into nonempty application database'; END IF;",
    'END $codespace_data_guard$;',
    plainDump,
    'SET search_path TO public;',
    'SET CONSTRAINTS ALL IMMEDIATE;',
    'COMMIT;',
    '',
  ].join('\n');
}

function importData(sourceId, targetId, names) {
  const archive = docker(['exec', sourceId, 'pg_dump', '-U', demo, '-d', demo,
    '--format=custom', '--data-only', '--no-owner', '--no-acl',
    '--exclude-table=public.flyway_schema_history'], {
    encoding: null, stage: 'isolated demo export',
  });
  requireSafe(archive.length > 0, 'Empty demo PostgreSQL data archive.');
  const sqlScript = docker(['exec', '-i', sourceId, 'pg_restore',
    '--data-only', '--no-owner', '--no-acl', '--file=-'], {
    input: archive, stage: 'rendering data-only archive',
  });
  // ON_ERROR_STOP terminates the psql session on the first error. PostgreSQL
  // rolls back the open transaction automatically if it does not reach COMMIT.
  docker(['exec', '-i', targetId, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', postgres, '-d', postgres], {
    input: restorationSql(sqlScript, names), stage: 'transactional data restore',
  });
}

export function main(args = []) {
  const recovery = args.length === 1 && args[0] === '--resume-existing-demo';
  requireSafe(args.length === 0 || recovery, 'Usage: seed-demo.mjs [--resume-existing-demo].');
  requireSafe(process.env.MTG_CODESPACE_DEMO_DATA === '1' && /^[a-z0-9-]+$/.test(process.env.CODESPACE_NAME ?? ''),
    'Codespaces-only demo seed is not enabled.');
  requireSafe(process.env.HOME && resolve(root) === process.cwd(),
    'Run only from the Codespace repository root.');
  const config = JSON.parse(textDocker(['compose', 'config', '--format', 'json', '--no-interpolate']));
  const targetId = textDocker(['compose', 'ps', '--quiet', 'postgres']);
  requireSafe(/^[a-f0-9]{64}$/.test(targetId), 'Expected one PostgreSQL target.');
  verifyTarget(config, inspect(targetId), resolve(root), targetId);

  const status = markerStatus();
  if (status === 'complete' && !recovery) {
    console.log('demo: earlier import completed; preserved existing data.');
    return;
  }
  const checkedTables = tables(targetId);
  if (recovery) {
    decideRecovery(status, checkedTables, sourceSeedStatus());
    console.log('demo: explicitly recovering a previously interrupted import into an empty database.');
  } else {
    const decision = decideSeed(status, checkedTables);
    if (decision === 'existing-data') {
      console.log('demo: existing application data found; leaving database untouched.');
      return;
    }
    // Deliberately fail closed after interruption, including during build.
    record('started');
  }

  let sourceStarted = false;
  try {
    if (!recovery) {
      console.log('demo: creating a fresh isolated verified fixture, no existing app data touched.');
      safeRun(join(root, 'backend/mvnw'), ['-B', '-Pdemo-seed', '-DskipTests', 'package'], {
        cwd: join(root, 'backend'), env: runtimeEnv(), stage: 'demo Maven build',
      });
    }
    nodeDemo('up');
    sourceStarted = true;
    if (!recovery) nodeDemo('seed', ['--allow-demo-seed']);
    requireSafe(sourceSeedStatus() === 'complete', 'Demo fixture seed is not verified complete.');
    const sourceId = demoId();
    for (const [table, expected] of [['users', '7'], ['decks', '21'],
      ['play_groups', '2'], ['games', '32']]) {
      requireSafe(sql(sourceId, demo, 'SELECT count(*) FROM public."' + table + '"') === expected,
        'Demo source content differs from verified fixture.');
    }
    requireSafe(fingerprint(sourceId, demo) === fingerprint(targetId, postgres),
      'Source and target Flyway versions/checksums do not match; refusing import.');
    requireSafe(decideSeed(null, tables(targetId)) === 'seed',
      'Application data appeared during demo preparation; refusing import.');
    importData(sourceId, targetId, checkedTables.map(row => row.name));
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
  try { main(process.argv.slice(2)); }
  catch (err) {
    console.error(err instanceof SeedError ? err.message : 'Demo initialization refused; see private Codespaces logs.');
    process.exitCode = 1;
  }
}
