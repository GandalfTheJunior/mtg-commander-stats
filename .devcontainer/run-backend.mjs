import {spawn, spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {snapshotRuntime} from '../tools/demo/runtime.mjs';
import {startupDiagnostics} from '../tools/demo/diagnostics.mjs';

// start.sh supplies service lifetime FD 8. This launcher holds it throughout
// Maven's build, then also passes it to Java. A warming backend stays locked.
const build = spawnSync('./mvnw', ['-B', '-DskipTests', 'package'], {stdio: 'inherit'});
if (build.status !== 0) process.exit(1);
try {
  const runtime = snapshotRuntime('target', join(process.env.HOME, '.local/state/mtg-commander-stats'));
  console.log('runtime-classpath: private-application-archive');
  const child = spawn('java', runtime.args, {stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 8]});
  const diagnostics = startupDiagnostics(line => console.error(line));
  child.stdout.on('data', chunk => { process.stdout.write(chunk); diagnostics.feed(chunk); });
  child.stderr.on('data', chunk => { process.stderr.write(chunk); diagnostics.feed(chunk); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('java-startup: kind=classpath'); process.exitCode = 1; });
  child.on('close', code => { diagnostics.finish(); process.exitCode = code ?? 1; });
} catch {
  console.error('java-startup: kind=classpath');
  process.exitCode = 1;
}
