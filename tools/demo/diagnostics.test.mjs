import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoApiError, failureLine, processLine, summarizeDiagnostics} from './diagnostics.mjs';

const secret = 'sensitive-sentinel-never-print';
test('safe HTTP diagnostics contain only method, resource and numeric status', () => {
  const error = new DemoApiError('POST', '/users/' + secret, 403, 201);
  error.message = secret; error.body = secret;
  assert.equal(failureLine('accounts-and-decks', error), 'demo-failure: accounts-and-decks method=POST resource=users status=403 expected=201');
  assert.ok(!JSON.stringify(failureLine('accounts-and-decks', error)).includes(secret));
  assert.equal(failureLine('games', new DemoApiError(secret, '/' + secret, secret, secret)),
    'demo-failure: games method=GET resource=unknown status=0 expected=0');
});
test('timeouts, transport, verification and shutdown are classified without exception bodies', () => {
  for (const [error, kind] of [[{name: 'TimeoutError', message: secret}, 'timeout'], [new TypeError(secret), 'transport'],
    [{code: 'ERR_ASSERTION', actual: secret, expected: secret}, 'verification'], [new Error(secret), 'unknown']]) {
    assert.equal(failureLine('fixture-verification', error), 'demo-failure: fixture-verification kind=' + kind);
  }
  assert.equal(failureLine('backend-shutdown', Error(secret)), 'demo-failure: backend-shutdown kind=shutdown');
  assert.ok(!failureLine(secret, Error(secret)).includes(secret));
});
test('outer wrapper preserves the primary API failure ahead of secondary shutdown failure', () => {
  const primary = failureLine('accounts-and-decks', new DemoApiError('POST', '/users', 503, 201));
  const shutdown = failureLine('backend-shutdown', Error(secret));
  assert.equal(summarizeDiagnostics('demo-stage: backend-startup\ndemo-stage: accounts-and-decks\n' + secret,
    secret + '\n' + primary + '\n' + shutdown + '\n' + processLine(null, 'SIGKILL')),
    primary + '; demo-exit: code=none signal=SIGKILL');
});
test('child text, malformed protocols, paths and extra fields never cross the boundary', () => {
  for (const untrusted of [secret, 'demo-failure: ' + secret, 'demo-stage: ' + secret,
    'demo-failure: games kind=unknown ' + secret, 'demo-exit: code=1 signal=' + secret]) {
    assert.equal(summarizeDiagnostics(untrusted, untrusted), '');
  }
  assert.equal(summarizeDiagnostics('demo-stage: backend-startup\ndemo-stage: games', ''), 'demo-stage: games');
  assert.equal(processLine(secret, secret), 'demo-exit: code=none signal=none');
});
