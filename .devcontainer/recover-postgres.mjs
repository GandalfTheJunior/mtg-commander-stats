// Called once, only after compose up failed. Never force-remove or delete data.
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

function docker(args) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    // Do not dump Compose config/inspect output, which may contain credentials.
    throw new Error(`docker ${args[0]} failed (exit=${error.status ?? 'unknown'})`)
  }
}

function requireMatch(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const root = realpathSync(process.cwd())
  // No interpolation: obtain resolved project/volume names without DB secrets.
  const config = JSON.parse(docker(['compose', 'config', '--format', 'json', '--no-interpolate']))
  const volume = config.volumes?.['postgres-data']?.name
  requireMatch(config.name && volume && config.services?.postgres?.image === 'postgres:18' &&
    config.services.postgres.volumes?.some(mount => mount.type === 'volume' &&
      mount.source === 'postgres-data' && mount.target === '/var/lib/postgresql'),
  'unexpected PostgreSQL Compose configuration')

  const id = docker(['compose', 'ps', '--all', '--quiet', 'postgres'])
  requireMatch(/^[a-f0-9]{64}$/.test(id), 'expected exactly one PostgreSQL container ID')
  const format = '{"Id":{{json .Id}},"State":{{json .State}},"Labels":{{json .Config.Labels}},' +
    '"Image":{{json .Config.Image}},"Mounts":{{json .Mounts}}}'
  const container = JSON.parse(docker(['inspect', '--format', format, id]))
  const state = container.State
  const labels = container.Labels ?? {}
  requireMatch(container.Id === id && container.Image === 'postgres:18' &&
    labels['com.docker.compose.project'] === config.name &&
    labels['com.docker.compose.service'] === 'postgres' &&
    labels['com.docker.compose.project.working_dir'] === root &&
    labels['com.docker.compose.project.config_files'] === join(root, 'compose.yaml'),
  'container does not belong to this repository/project PostgreSQL service')
  requireMatch(state?.Status === 'exited' && state.Running === false &&
    state.ExitCode === 128 && state.Dead === false &&
    /OCI runtime create failed: runc create failed:.*container with given ID already exists/s.test(state.Error),
  'container is not stopped with the specific OCI/runc ID collision')
  const dataMounts = container.Mounts?.filter(mount => mount.Destination === '/var/lib/postgresql') ?? []
  requireMatch(dataMounts.length === 1 && dataMounts[0].Type === 'volume' &&
    dataMounts[0].Name === volume && dataMounts[0].RW === true,
  'expected persistent PostgreSQL named volume is not mounted')
  requireMatch(JSON.parse(docker(['volume', 'inspect', '--format', '{{json .Name}}', volume])) === volume,
    'PostgreSQL data volume is unavailable')

  console.log(`postgres: recovering OCI ID collision; container=${id}; preserving volume=${volume}`)
  // Immutable ID, no -f/-v: a concurrent start causes refusal, not forced removal.
  docker(['rm', id])
  console.log('postgres: stopped container removed; retrying Compose once with the same named volume')
} catch (error) {
  console.error(`postgres: automatic recovery refused/failed: ${error.message}`)
  process.exitCode = 1
}
