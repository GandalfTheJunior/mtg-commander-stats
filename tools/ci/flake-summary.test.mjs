import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parsePlan, renderMarkdown, summarize} from './flake-summary.mjs';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const failure = '\u001b[31mTypeError: Cannot read properties of undefined\u001b[39m\n    at src/DeckManager.test.tsx:76:82';

/** One Vitest file report; each case is [title, status] or [title, status, ancestorTitles]. */
const vitestReport = (cases, file = 'src/DeckManager.test.tsx', fileStatus = undefined, message = '') => ({
  testResults: [{
    name: `${frontend}${file}`,
    status: fileStatus ?? (cases.some(([, status]) => status === 'failed') ? 'failed' : 'passed'),
    message,
    assertionResults: cases.map(([title, status, ancestorTitles = []]) => ({
      ancestorTitles, title, status, failureMessages: status === 'failed' ? [failure] : [],
    })),
  }],
});

const playwrightSpec = (title, status, projectName = 'webkit') => ({
  title, file: 'claims.pw.ts',
  tests: [{projectName, results: [{status, ...(status === 'passed' ? {} : {error: {message: 'Error: expect(locator).toBeVisible() failed\n\nLocator: getByText'}})}]}],
});
/** A Playwright report with one spec file: top-level specs plus describe suites. */
const playwrightReport = (specs, suites = [], projects = [{name: 'webkit', repeatEach: 1}], errors = []) => ({
  config: {rootDir: `${frontend}e2e`, projects},
  suites: [{title: 'claims.pw.ts', file: 'claims.pw.ts', specs, suites}],
  errors,
});

test('counts executions per test across reports and lists only tests that failed', () => {
  const run = statuses => vitestReport(Object.entries(statuses));
  const summary = summarize([
    run({'loads decks': 'passed', 'pending list': 'failed', 'later': 'skipped'}),
    run({'loads decks': 'passed', 'pending list': 'passed', 'later': 'skipped'}),
    run({'loads decks': 'passed', 'pending list': 'failed', 'later': 'skipped'}),
  ]);
  assert.equal(summary.tests, 2);
  assert.equal(summary.executions, 6);
  assert.deepEqual(summary.failing, [{
    runner: 'vitest', file: 'src/DeckManager.test.tsx', test: 'pending list', case: 1, cases: 1, runs: 3, failures: 2,
    message: 'TypeError: Cannot read properties of undefined',
  }]);
});

test('keeps parametrized Vitest cases with one title apart, so a consistent failure is not diluted', () => {
  // Like the six `rejects invalid eligible-deck summaries` cases in src/GameApi.test.ts.
  const cases = Array.from({length: 6}, (_, index) => ['rejects invalid', index === 2 ? 'failed' : 'passed']);
  const summary = summarize(Array.from({length: 5}, () => vitestReport(cases, 'src/GameApi.test.ts')));
  assert.equal(summary.tests, 6);
  assert.deepEqual(summary.failing.map(row => [row.test, row.case, row.cases, row.failures, row.runs]), [['rejects invalid', 3, 6, 5, 5]]);
  assert.match(renderMarkdown(summary), /› rejects invalid \(case 3 of 6\) \| 5 \/ 5 \|/);
});

test('identifies Vitest and Playwright tests by their full title path', () => {
  const vitest = summarize([vitestReport([['shows', 'failed', ['list']], ['shows', 'passed', ['details']]])]);
  assert.deepEqual(vitest.failing.map(row => row.test), ['list › shows']);

  const playwright = summarize([playwrightReport([playwrightSpec('accepts once', 'passed')], [
    {title: 'Claim dialog', specs: [playwrightSpec('accepts once', 'failed')], suites: [
      {title: 'narrow', specs: [playwrightSpec('accepts once', 'passed')]},
    ]},
  ])]);
  assert.deepEqual(playwright.rows.map(row => [row.test, row.failures]),
    [['accepts once', 0], ['Claim dialog › accepts once', 1], ['Claim dialog › narrow › accepts once', 0]]);
});

test('reads repeated Playwright specs and treats a timeout as a failure', () => {
  const summary = summarize([playwrightReport([
    playwrightSpec('accepts once', 'passed'), playwrightSpec('accepts once', 'timedOut'),
    playwrightSpec('accepts once', 'passed'), playwrightSpec('declines', 'skipped'),
  ])]);
  assert.equal(summary.executions, 3);
  assert.deepEqual(summary.failing, [{
    runner: 'playwright webkit', file: 'e2e/claims.pw.ts', test: 'accepts once', case: 1, cases: 1, runs: 3, failures: 1,
    message: 'Error: expect(locator).toBeVisible() failed',
  }]);
});

test('orders by failure rate and marks quarantined tests in the failure table', () => {
  const summary = summarize([
    vitestReport([['a | b', 'failed'], ['often', 'failed']]), vitestReport([['a | b', 'passed'], ['often', 'failed']]),
  ]);
  const quarantine = [{runner: 'vitest', file: 'src/DeckManager.test.tsx', test: 'often', since: '2026-11-16', until: '2026-11-30', issue: 'https://example.test/1'}];
  const markdown = renderMarkdown(summary, quarantine, '2026-11-17');
  const rows = markdown.split('\n').filter(line => line.startsWith('| vitest | `'));
  assert.match(rows[0], /› often \| 2 \/ 2 \| 2026-11-30 \| TypeError/);
  assert.match(rows[1], /› a \\\| b \| 1 \/ 2 \|  \| TypeError/);
  assert.match(markdown, /4 executions of 2 tests; 2 test\(s\) failed at least once\./);
});

const entry = (test, change = {}) => ({
  runner: 'playwright', file: 'e2e/claims.pw.ts', test, issue: `https://example.test/${test}`, since: '2026-11-10', until: '2026-11-20', ...change,
});
const statusRows = markdown => markdown.slice(markdown.indexOf('## Quarantine status')).split('\n').filter(line => /^\| (vitest|playwright)/.test(line));

test('lists every quarantine entry in force with its result tonight, including green and unrun tests', () => {
  const summary = summarize([playwrightReport([
    playwrightSpec('flaky', 'passed', 'chromium'), playwrightSpec('flaky', 'failed', 'chromium'),
    playwrightSpec('fixed', 'passed', 'chromium'), playwrightSpec('fixed', 'passed', 'chromium'),
  ], [], [{name: 'chromium', repeatEach: 2}, {name: 'webkit', repeatEach: 2}])]);
  const markdown = renderMarkdown(summary, [
    entry('flaky'), entry('fixed'), entry('renamed'),
    entry('lapsed', {until: '2026-11-16'}), {...entry('vitest only'), runner: 'vitest', file: 'src/A.test.ts'},
  ], '2026-11-17');
  // Only the project that ran is expected; webkit was filtered out of this job.
  assert.deepEqual(statusRows(markdown), [
    '| playwright chromium | `e2e/claims.pw.ts` › flaky | red | 1 / 2 | 2 of 2 | 2026-11-20 (3 days left) | https://example.test/flaky |',
    '| playwright chromium | `e2e/claims.pw.ts` › fixed | green | 0 / 2 | 2 of 2 | 2026-11-20 (3 days left) | https://example.test/fixed |',
    '| playwright chromium | `e2e/claims.pw.ts` › renamed | not run: check the title path and errors outside tests | 0 / 0 | 0 of 2 | 2026-11-20 (3 days left) | https://example.test/renamed |',
  ]);
  assert.match(markdown, /three consecutive green nights/);
  assert.doesNotMatch(markdown, /lapsed|vitest only/);
});

test('does not count repetitions whose setup failed as a green night', () => {
  // One clean run and four runs whose beforeAll threw: the file failed, its test was skipped.
  const quarantined = [{...entry('pending list'), runner: 'vitest', file: 'src/DeckManager.test.tsx'}];
  const broken = () => vitestReport([['pending list', 'skipped']], undefined, 'failed', 'Error: setup broke\n    at beforeAll');
  const reports = [vitestReport([['pending list', 'passed']]), broken(), broken(), broken(), broken()];

  const markdown = renderMarkdown(summarize(reports), quarantined, '2026-11-17');
  assert.match(statusRows(markdown)[0], /› pending list \| incomplete: 1 of 5 repetitions ran \| 0 \/ 1 \| 1 of 5 \|/);
  assert.match(markdown, /## Errors outside tests[\s\S]*\| vitest \| `src\/DeckManager.test.tsx` \| 4 \| Error: setup broke \|/);

  // With no executed repetition the runner is still reported, as not run.
  assert.match(statusRows(renderMarkdown(summarize(reports.slice(1)), quarantined, '2026-11-17'))[0], /\| vitest \| .* \| not run: .* \| 0 \/ 0 \| 0 of 4 \|/);
});

test('counts a repetition only when every case an entry matches ran', () => {
  const quarantined = [{...entry('rejects invalid'), runner: 'vitest', file: 'src/DeckManager.test.tsx'}];
  const partial = vitestReport([['rejects invalid', 'passed'], ['rejects invalid', 'skipped']]);
  const full = vitestReport([['rejects invalid', 'passed'], ['rejects invalid', 'passed']]);
  assert.match(statusRows(renderMarkdown(summarize([full, partial]), quarantined, '2026-11-17'))[0], /incomplete: 1 of 2 repetitions ran/);
  assert.match(statusRows(renderMarkdown(summarize([full, full]), quarantined, '2026-11-17'))[0], /\| green \| 0 \/ 2 \| 2 of 2 \|/);
});

test('expects every configured project and reports the error when a Playwright run lists no test', () => {
  const report = playwrightReport([], [], [{name: 'chromium', repeatEach: 3}, {name: 'webkit', repeatEach: 3}],
    [{message: 'Error: Cannot find module ./helper\n    at claims.pw.ts:1', location: {file: `${frontend}e2e/claims.pw.ts`}}]);
  const markdown = renderMarkdown(summarize([report]), [entry('flaky')], '2026-11-17');
  assert.deepEqual(statusRows(markdown).map(line => line.split(' | ').slice(0, 5).join(' | ')), [
    '| playwright chromium | `e2e/claims.pw.ts` › flaky | not run: check the title path and errors outside tests | 0 / 0 | 0 of 3',
    '| playwright webkit | `e2e/claims.pw.ts` › flaky | not run: check the title path and errors outside tests | 0 / 0 | 0 of 3',
  ]);
  assert.match(markdown, /\| playwright \| `e2e\/claims.pw.ts` \| 1 \| Error: Cannot find module .\/helper \|/);
});

test('counts planned repetitions that left no report as not run', () => {
  // Five planned Vitest invocations; the third failed at startup and wrote no JSON.
  const quarantined = [{...entry('pending list'), runner: 'vitest', file: 'src/DeckManager.test.tsx'}];
  const reports = Array.from({length: 4}, () => vitestReport([['pending list', 'passed']]));
  const markdown = renderMarkdown(summarize(reports, new Map([['vitest', 5]])), quarantined, '2026-11-17');
  assert.match(statusRows(markdown)[0], /\| incomplete: 4 of 5 repetitions ran \| 0 \/ 4 \| 4 of 5 \|/);
  assert.match(markdown, /\| vitest \|  \| 1 \| 1 of 5 planned repetitions left no report \|/);

  // Without any report, the planned runner is still listed as not run.
  const none = renderMarkdown(summarize([], new Map([['playwright chromium', 3]])), [entry('flaky')], '2026-11-17');
  assert.match(statusRows(none)[0], /^\| playwright chromium \| .* \| not run: .* \| 0 \/ 0 \| 0 of 3 \|/);
  assert.match(none, /3 of 3 planned repetitions left no report/);
});

test('expects exactly the planned runners when a plan is given', () => {
  const report = playwrightReport([], [], [{name: 'chromium', repeatEach: 3}, {name: 'webkit', repeatEach: 3}],
    [{message: 'Error: Cannot find module ./helper'}]);
  const rows = statusRows(renderMarkdown(summarize([report], new Map([['playwright chromium', 3]])), [entry('flaky')], '2026-11-17'));
  assert.deepEqual(rows.map(row => row.split(' | ')[0]), ['| playwright chromium']);
});

test('parses the run plan from --expect options', () => {
  assert.deepEqual(parsePlan([]), new Map());
  assert.deepEqual(parsePlan(['--expect', 'vitest=5', '--expect', 'playwright/chromium=3']),
    new Map([['vitest', 5], ['playwright chromium', 3]]));
  for (const invalid of [['--expect'], ['--expect', 'vitest=0'], ['--expect', 'jest=5'], ['--other', 'vitest=5']]) {
    assert.equal(parsePlan(invalid), undefined);
  }
});

test('reports a clean soak without tables', () => {
  assert.equal(renderMarkdown(summarize([vitestReport([['loads decks', 'passed']])]), [], '2026-11-17'),
    '## Soak summary\n\n1 executions of 1 tests; 0 test(s) failed at least once.\n');
});
