// Called by OfflineDemoShutdownTest with the real Java 25 test classpath on
// Linux and Windows CI. It deliberately requires Java; it never skips the check.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {trackBackend, FIXTURE_ACK} from './backend-process.mjs';
import {environment} from './demo.mjs';

const [java, classpath] = process.argv.slice(2);
assert.ok(java && classpath);
for (const mode of ['clean', 'unexpected', 'eof']) {
  const child = spawn(java, ['-cp', classpath, 'io.github.gandalfthejunior.mtgcommanderstats.demo.OfflineDemoShutdownProbe', mode], {
    env: environment(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const lifecycle = trackBackend(child, {seed: true});
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.resume();
  let timeout;
  try {
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Java probe startup timed out.')); }, 30000);
      child.stdout.on('data', () => { if (output.includes('Java shutdown probe ready.')) resolve(); });
      lifecycle.exited.then(() => reject(new Error('Java probe exited before readiness.')));
    });
    clearTimeout(timeout);
    if (mode === 'eof') child.stdin.end();
    lifecycle.stop();
    if (mode === 'clean') {
      assert.equal(await lifecycle.finish(), 0);
      assert.ok(output.indexOf('Spring context destroyed.') >= 0);
      assert.ok(output.indexOf(FIXTURE_ACK) > output.indexOf('Spring context destroyed.'));
    } else {
      await assert.rejects(lifecycle.finish());
      assert.ok(output.includes('Spring context destroyed.'));
      assert.ok(!output.includes(FIXTURE_ACK));
    }
  } finally {
    clearTimeout(timeout);
    lifecycle.stop();
    await lifecycle.finish().catch(() => {});
  }
}
console.log(`Real Java stdin shutdown/fixture acknowledgement verified on ${process.platform}.`);
