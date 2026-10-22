import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {FIXTURE_ACK, SEED_STOP, trackBackend} from './backend-process.mjs';

function fakeJava() {
  const child = new EventEmitter();
  Object.assign(child, {stdin: new PassThrough(), stdout: new PassThrough(), exitCode: null, signalCode: null});
  child.kill = () => { throw new Error('Graceful path must not signal Java.'); };
  return child;
}

test('seed uses private stdin and awaits delayed/split stdout after exit before accepting completion', async () => {
  const child = fakeJava();
  const lifecycle = trackBackend(child, {seed: true});
  let input = '';
  child.stdin.on('data', data => { input += data; });
  lifecycle.stop(); lifecycle.stop();
  assert.equal(input, `${SEED_STOP}\n`);
  let finished = false;
  const result = lifecycle.finish().then(code => { finished = true; return code; });
  child.exitCode = 0; child.emit('exit', 0, null);
  await lifecycle.exited;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false, 'exit must not complete the seed while stdout is open');
  child.stdout.write(FIXTURE_ACK.slice(0, 20));
  await new Promise(resolve => setImmediate(resolve));
  child.stdout.end(FIXTURE_ACK.slice(20) + '\n');
  await new Promise(resolve => child.stdout.once('end', resolve));
  assert.equal(finished, false, 'stdout acknowledgement alone must not bypass close/status');
  child.emit('close', 0, null);
  assert.equal(await result, 0);
});

test('missing acknowledgement, failed exit and a forced stop cannot complete a seed', async t => {
  for (const mode of ['missing', 'nonzero', 'signal', 'forced', 'input-error']) await t.test(mode, async () => {
    const child = fakeJava();
    const lifecycle = trackBackend(child, {seed: true, stopTimeoutMs: 10});
    let killed;
    child.kill = signal => { killed = signal; child.emit('exit', 0, null); child.emit('close', 0, null); };
    lifecycle.stop();
    if (mode !== 'missing') child.stdout.write(FIXTURE_ACK);
    if (mode === 'input-error') child.stdin.emit('error', new Error('EPIPE'));
    const result = assert.rejects(lifecycle.finish(), /shutdown\/fixture acknowledgement failed/);
    if (mode !== 'forced') {
      child.emit('exit', mode === 'nonzero' ? 1 : 0, mode === 'signal' ? 'SIGTERM' : null);
      child.stdout.end();
      child.emit('close', mode === 'nonzero' ? 1 : 0, mode === 'signal' ? 'SIGTERM' : null);
    }
    await result;
    if (mode === 'forced') assert.equal(killed, 'SIGKILL');
  });
});
