// The seed-only Java launcher owns this private stdin protocol. The ordinary jar
// never gains a shutdown endpoint, fixture switch or stdin command handler.
export const SEED_STOP = 'stop-offline-demo-seed';
export const FIXTURE_ACK = 'Offline demo fixtures: no unexpected Scryfall requests.';

export function trackBackend(child, {seed = false, stopTimeoutMs = 10000} = {}) {
  let acknowledged = false, stopping = false, forced = false, inputFailed = false;
  let tail = '', killTimer;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    tail += chunk;
    if (tail.includes(FIXTURE_ACK)) acknowledged = true;
    tail = tail.slice(-FIXTURE_ACK.length);
  });
  // A child can close stdin before the stop request. Never expose stream errors
  // or let an EPIPE crash the wrapper; failed handshakes cannot complete a seed.
  child.stdin?.on('error', () => { inputFailed = true; });
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({code, signal}));
    child.once('error', () => resolve({code: -1, signal: null}));
  });
  // Unlike exit, close is delivered after stdout/stderr have finished draining.
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    clearTimeout(killTimer);
    resolve({code, signal});
  }));
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode !== null || child.signalCode !== null) return;
    killTimer = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, stopTimeoutMs);
    if (seed) {
      if (!child.stdin || child.stdin.destroyed) inputFailed = true;
      else child.stdin.end(`${SEED_STOP}\n`);
    } else child.kill();
  };
  const finish = async () => {
    const {code, signal} = await closed;
    if (seed && (!stopping || forced || inputFailed || code !== 0 || signal !== null || !acknowledged)) {
      throw new Error('Offline seed shutdown/fixture acknowledgement failed.');
    }
    return code;
  };
  return {exited, stop, finish, get stopping() { return stopping; }};
}
