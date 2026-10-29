// Launch only completed archives copied out of Maven's mutable output directory.
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {delimiter, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function snapshotRuntime(target, state, seed = false, {log = console.log, env = process.env} = {}) {
  const jars = readdirSync(target).filter(name => name.endsWith('.jar') && !name.endsWith('-tests.jar'));
  if (jars.length !== 1) throw new Error('Expected exactly one packaged application.');
  mkdirSync(state, {recursive: true, mode: 0o700});
  const runtime = mkdtempSync(join(state, 'runtime-'));
  const jar = join(runtime, 'application.jar');
  copyFileSync(join(target, jars[0]) + (seed ? '.original' : ''), jar);
  // This Java source-file check opens every SQL stream from the actual snapshot,
  // compares its bytes to source, and logs only counts and a SHA-256 fingerprint.
  try {
    const output = execFileSync('java', [resolve(root, 'tools/demo/CheckRuntimeResources.java'), jar,
      resolve(root, 'backend/src/main/resources/db/migration')], {env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    if (!/^runtime-resources: readable=\d{1,4} sha256=[a-f0-9]{64}\r?\n$/.test(output)) throw new Error();
    log(output.trim());
  } catch {
    console.error('runtime-resources: verification-failed');
    throw new Error('Packaged migration resources could not be verified.');
  }
  if (!seed) {
    writeFileSync(join(runtime, 'classpath.json'), JSON.stringify({applicationArchive: jar}) + '\n', {mode: 0o600});
    return {jar, args: ['-jar', jar]};
  }
  const tests = join(runtime, 'tests.jar');
  copyFileSync(join(target, jars[0].replace(/\.jar$/, '-tests.jar')), tests);
  const dependencies = readFileSync(join(target, 'demo-classpath.txt'), 'utf8').trim();
  if (!dependencies || dependencies.split(delimiter).some(path => !path.endsWith('.jar') || !existsSync(path))) {
    throw new Error('Incomplete demo dependency classpath.');
  }
  // Dependency cache jars are immutable; classes/resources always come from the
  // two private archive copies, never target/classes or target/test-classes.
  const classpath = [tests, jar, ...dependencies.split(delimiter)];
  // Keep the effective classpath with this launch's evidence, even if another
  // Maven invocation later changes target/demo-classpath.txt. Never log paths.
  writeFileSync(join(runtime, 'classpath.json'), JSON.stringify({classpath}) + '\n', {mode: 0o600});
  return {jar, args: ['-cp', classpath.join(delimiter),
    'io.github.gandalfthejunior.mtgcommanderstats.demo.OfflineDemoSeedApplication']};
}
