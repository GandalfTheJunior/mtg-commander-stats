import test from 'node:test';
import {Session} from './api.mjs';
import assert from 'node:assert/strict';
import {DemoApiError, DemoRequestError, failureLine, processLine, summarizeDiagnostics, startupDiagnostics} from './diagnostics.mjs';

const secret = 'sensitive-sentinel-never-print';
test('Java startup preserves sanitized causes and distinguishes the two Flyway symptoms across chunks', () => {
  for (const [text, expected] of [
    ['Successfully validated 0 migrations\nNo migrations found. ' + secret, 'flyway-empty'],
    ['Successfully validated 8 migrations\nCaused by: org.flywaydb.core.api.FlywayException: Unable to obtain inputstream for resource: db/migration/V2__use_email_for_authentication.sql ' + secret, 'flyway-resource'],
    ['Exception in thread "main" java.lang.NoClassDefFoundError: ' + secret, 'classpath'],
    ['Caused by: java.lang.UnsupportedClassVersionError: ' + secret, 'java-version'],
    ['Caused by: org.postgresql.util.PSQLException: ' + secret, 'database'],
  ]) {
    const lines = [];
    const diagnostics = startupDiagnostics(line => lines.push(line));
    for (let i = 0; i < text.length; i += 7) diagnostics.feed(text.slice(i, i + 7));
    diagnostics.finish();
    assert.equal(diagnostics.kind, expected);
    assert.ok(lines.includes('java-startup: kind=' + expected));
    assert.doesNotMatch(lines.join('\n'), new RegExp(secret));
    assert.equal(summarizeDiagnostics('', lines.join('\n')), lines.join('; '));
  }
  assert.equal(summarizeDiagnostics('', 'java-cause: type=' + secret + '\njava-startup: kind=flyway ' + secret), '');
  const normal = [];
  const healthy = startupDiagnostics(line => normal.push(line));
  healthy.feed('INFO org.flywaydb.core.FlywayExecutor : Database ready\nSuccessfully validated 8 migrations\n');
  healthy.finish();
  assert.deepEqual(normal, ['java-migrations: validated=8']);
});
test('safe HTTP diagnostics contain only method, resource and numeric status', () => {
  const error = new DemoApiError('POST', '/users/' + secret, 403, 201);
  error.message = secret; error.body = secret;
  assert.equal(failureLine('accounts-and-decks', error), 'demo-failure: accounts-and-decks method=POST resource=users status=403 expected=201');
  assert.ok(!JSON.stringify(failureLine('accounts-and-decks', error)).includes(secret));
  assert.equal(failureLine('games', new DemoApiError(secret, '/' + secret, secret, secret)),
    'demo-failure: games method=GET resource=unknown status=0 expected=0');
});
test('timeouts, transport, verification and shutdown are classified without exception bodies', () => {
  for (const [error, kind] of [[new DemoRequestError('timeout'), 'timeout'], [new DemoRequestError('transport'), 'transport'], [new TypeError(secret), 'unknown'],
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

test('only actual fetch failures become transport/timeout diagnostics; child details stay private', async () => {
  for (const [error, kind] of [[{name: 'TimeoutError', message: secret}, 'timeout'], [new TypeError(secret), 'transport']]) {
    const session = new Session('http://127.0.0.1:1', async () => { throw error; });
    await assert.rejects(session.call('GET', '/csrf'), failure => {
      assert.equal(failureLine('accounts-and-decks', failure), 'demo-failure: accounts-and-decks kind=' + kind);
      assert.ok(!failure.message.includes(secret));
      return true;
    });
  }
});
