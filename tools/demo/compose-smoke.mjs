// CLI/plugin discovery only. Never start a daemon/container or touch a database.
import {spawnSync} from 'node:child_process';
import {environment} from './demo.mjs';

const args = ['compose', 'version'];
const options = {encoding: 'utf8', windowsHide: true};
const ordinary = spawnSync('docker', args, options);
if (ordinary.error?.code === 'ENOENT' || (ordinary.status !== 0 && /unknown command|is not a docker command/i.test(ordinary.stderr ?? ''))) {
  console.log('SKIP: Docker or Compose is not installed/discoverable in the ordinary environment. No sanitized discovery pass claimed.');
} else if (ordinary.error || ordinary.status !== 0) {
  console.error('Docker Compose version failed in the ordinary environment; smoke check cannot proceed (details suppressed).');
  process.exitCode = 1;
} else {
  const sanitized = spawnSync('docker', args, {...options, env: environment()});
  if (sanitized.error || sanitized.status !== 0) {
    console.error('FAIL: Docker Compose works in the ordinary environment but fails with the demo environment (details suppressed).');
    process.exitCode = 1;
  } else {
    console.log('PASS: Docker Compose plugin discovery works with the sanitized demo environment. No daemon or database used.');
  }
}
