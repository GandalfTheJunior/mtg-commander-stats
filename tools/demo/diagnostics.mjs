// Closed vocabulary only. Never forward exception text, child output, URLs,
// account data, tokens, cookies or HTTP bodies across the bootstrap boundary.
export const stages = ['backend-startup', 'source-empty-check', 'accounts-and-decks',
  'playgroups', 'games', 'fixture-verification', 'backend-shutdown'];
const methods = ['GET', 'POST', 'PUT', 'DELETE'];
const resources = ['users', 'csrf', 'session', 'me', 'decks', 'groups'];
const startupKinds = ['flyway-empty', 'flyway-resource', 'flyway', 'classpath', 'java-version', 'database', 'schema-validation'];
const causeTypes = ['org.springframework.beans.factory.BeanCreationException',
  'org.springframework.beans.factory.UnsatisfiedDependencyException',
  'org.flywaydb.core.api.FlywayException', 'org.flywaydb.core.api.FlywayValidateException',
  'org.flywaydb.core.internal.exception.FlywaySqlException',
  'org.flywaydb.core.internal.exception.FlywayMigrateException',
  'org.flywaydb.core.internal.sqlscript.FlywaySqlScriptException',
  'org.springframework.jdbc.CannotGetJdbcConnectionException',
  'org.hibernate.tool.schema.spi.SchemaManagementException', 'org.postgresql.util.PSQLException',
  'org.hibernate.exception.JDBCConnectionException',
  'com.zaxxer.hikari.pool.HikariPool$PoolInitializationException',
  'java.lang.ClassNotFoundException', 'java.lang.NoClassDefFoundError',
  'java.lang.UnsupportedClassVersionError', 'java.lang.IllegalArgumentException',
  'java.lang.IllegalStateException', 'java.io.FileNotFoundException', 'java.io.IOException',
  'java.nio.file.NoSuchFileException', 'java.util.zip.ZipException'];

// Incremental parser: no raw line, exception message, URL, path or SQL is emitted.
// Preserve each cause in order, including unknown causes as a fixed token.
export function startupDiagnostics(emit) {
  const pending = {stdout: '', stderr: ''};
  let kind = 'unknown';
  const line = value => {
    const cause = value.match(/^\s*(?:(?:Caused by: |Suppressed: |Exception in thread "main" ))?([\w.$]+)(?::|$)/);
    if (cause) emit('java-cause: type=' + (causeTypes.includes(cause[1]) ? cause[1] : 'other'));
    const validated = value.match(/Successfully validated (\d{1,4}) migrations/);
    if (validated) emit('java-migrations: validated=' + Number(validated[1]));
    let detected;
    if (value.includes('No migrations found')) detected = 'flyway-empty';
    else if (value.includes('Unable to obtain inputstream for resource:')) {
      detected = 'flyway-resource';
      const resource = value.match(/db\/migration\/V(\d{1,4})__/);
      if (resource) emit('java-resource: version=' + Number(resource[1]));
    } else if (/ClassNotFoundException|NoClassDefFoundError/.test(value)) detected = 'classpath';
    else if (value.includes('UnsupportedClassVersionError')) detected = 'java-version';
    else if (value.includes('Schema-validation:') || value.includes('Schema validation:')) detected = 'schema-validation';
    else if (value.includes('org.postgresql.util.PSQLException')) detected = 'database';
    else if (/org\.flywaydb\.[\w.$]*(?:Exception|Error)/.test(value)) detected = 'flyway';
    if (detected) {
      kind = detected;
      emit('java-startup: kind=' + kind);
    }
  };
  return {
    feed(chunk, stream = 'stdout') {
      if (!Object.hasOwn(pending, stream)) return;
      pending[stream] += chunk.toString();
      const lines = pending[stream].split(/\r?\n/);
      pending[stream] = lines.pop().slice(-16000);
      lines.forEach(line);
    },
    finish() {
      for (const stream of Object.keys(pending)) {
        if (pending[stream]) line(pending[stream]);
        pending[stream] = '';
      }
    },
    get kind() { return kind; },
  };
}
export class DemoApiError extends Error {
  constructor(method, path, status, expected) {
    super('Demo API request did not return the expected status. No automatic retry.');
    this.method = methods.includes(method) ? method : 'GET';
    this.resource = resources.includes(path.split('/')[1]) ? path.split('/')[1] : 'unknown';
    this.status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    this.expected = Number.isInteger(expected) && expected >= 100 && expected <= 599 ? expected : 0;
    this.message = `Demo API ${this.method} ${this.resource} returned ${this.status}; expected ${this.expected}. No automatic retry.`;
  }
}
export class DemoRequestError extends Error {
  constructor(kind) {
    super('Demo HTTP request failed; details suppressed. No automatic retry.');
    this.kind = kind === 'timeout' ? 'timeout' : 'transport';
  }
}
export function failureLine(stage, error) {
  if (!stages.includes(stage)) return 'demo-failure: backend-startup kind=unknown';
  if (error instanceof DemoApiError) return `demo-failure: ${stage} method=${error.method} resource=${error.resource} status=${error.status} expected=${error.expected}`;
  const kind = stage === 'backend-shutdown' ? 'shutdown' : error instanceof DemoRequestError ? error.kind : error?.code === 'ERR_ASSERTION' ? 'verification' : 'unknown';
  return `demo-failure: ${stage} kind=${kind}`;
}
export function processLine(code, signal) {
  const safeCode = Number.isInteger(code) && code >= -1 && code <= 255 ? code : 'none';
  const safeSignal = ['SIGKILL', 'SIGTERM', 'SIGINT', 'SIGABRT', 'SIGSEGV'].includes(signal) ? signal : 'none';
  return `demo-exit: code=${safeCode} signal=${safeSignal}`;
}
export function summarizeDiagnostics(stdout, stderr) {
  const stage = '(?:' + stages.join('|') + ')';
  const detail = '(?:kind=(?:shutdown|timeout|transport|verification|unknown)|method=(?:GET|POST|PUT|DELETE) resource=(?:' + resources.join('|') + '|unknown) status=(?:0|[1-5][0-9]{2}) expected=(?:0|[1-5][0-9]{2}))';
  const failure = new RegExp('^demo-failure: ' + stage + ' ' + detail + '$');
  const progress = new RegExp('^demo-stage: ' + stage + '$');
  const lines = value => String(value ?? '').split(/\r?\n/);
  const primary = lines(stderr).find(line => failure.test(line)) ?? lines(stdout).filter(line => progress.test(line)).at(-1) ?? '';
  const exit = lines(stderr).find(line => /^demo-exit: code=(?:none|-1|[0-9]{1,3}) signal=(?:none|SIGKILL|SIGTERM|SIGINT|SIGABRT|SIGSEGV)$/.test(line));
  const java = lines(stderr).filter(line =>
    new RegExp('^java-startup: kind=(?:' + startupKinds.join('|') + ')$').test(line) ||
    /^java-migrations: validated=\d{1,4}$/.test(line) ||
    /^java-resource: version=\d{1,4}$/.test(line) ||
    line === 'java-cause: type=other' || causeTypes.some(type => line === 'java-cause: type=' + type));
  const runtime = [...lines(stdout), ...lines(stderr)].filter(line =>
    /^runtime-resources: readable=\d{1,4} sha256=[a-f0-9]{64}$/.test(line) ||
    line === 'runtime-classpath: private-demo-archives-and-dependency-jars' ||
    line === 'runtime-resources: verification-failed');
  return [primary, ...runtime, ...java.slice(-40), exit].filter(Boolean).join('; ');
}
