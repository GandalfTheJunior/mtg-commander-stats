// Closed vocabulary only. Never forward exception text, child output, URLs,
// account data, tokens, cookies or HTTP bodies across the bootstrap boundary.
export const stages = ['backend-startup', 'source-empty-check', 'accounts-and-decks',
  'playgroups', 'games', 'fixture-verification', 'backend-shutdown'];
const methods = ['GET', 'POST', 'PUT', 'DELETE'];
const resources = ['users', 'csrf', 'session', 'me', 'decks', 'groups'];
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
  return [primary, exit].filter(Boolean).join('; ');
}
