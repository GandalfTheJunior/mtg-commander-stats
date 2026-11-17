import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {renderMarkdown, summarize} from './flake-summary.mjs';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const failure = '\u001b[31mTypeError: Cannot read properties of undefined\u001b[39m\n    at src/DeckManager.test.tsx:76:82';

/** One Vitest file report; each case is [title, status] or [title, status, ancestorTitles]. */
const vitestReport = (cases, file = 'src/DeckManager.test.tsx') => ({
  testResults: [{
    name: `${frontend}${file}`,
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
const playwrightReport = (specs, suites = []) => ({
  config: {rootDir: `${frontend}e2e`},
  suites: [{title: 'claims.pw.ts', file: 'claims.pw.ts', specs, suites}],
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

test('lists every quarantine entry in force with its result tonight, including green and unrun tests', () => {
  const entry = (test, change = {}) => ({
    runner: 'playwright', file: 'e2e/claims.pw.ts', test, issue: `https://example.test/${test}`, since: '2026-11-10', until: '2026-11-20', ...change,
  });
  const summary = summarize([playwrightReport([
    playwrightSpec('flaky', 'passed', 'chromium'), playwrightSpec('flaky', 'failed', 'chromium'),
    playwrightSpec('fixed', 'passed', 'chromium'), playwrightSpec('fixed', 'passed', 'chromium'),
  ])]);
  const markdown = renderMarkdown(summary, [
    entry('flaky'), entry('fixed'), entry('renamed'),
    entry('lapsed', {until: '2026-11-16'}), {...entry('vitest only'), runner: 'vitest', file: 'src/A.test.ts'},
  ], '2026-11-17');
  const status = markdown.slice(markdown.indexOf('## Quarantine status')).split('\n').filter(line => line.startsWith('| playwright'));
  assert.deepEqual(status, [
    '| playwright chromium | `e2e/claims.pw.ts` › flaky | red | 1 / 2 | 2026-11-20 (3 days left) | https://example.test/flaky |',
    '| playwright chromium | `e2e/claims.pw.ts` › fixed | green | 0 / 2 | 2026-11-20 (3 days left) | https://example.test/fixed |',
    '| playwright chromium | `e2e/claims.pw.ts` › renamed | not run: check the title path | 0 / 0 | 2026-11-20 (3 days left) | https://example.test/renamed |',
  ]);
  assert.match(markdown, /three consecutive green nights/);
  assert.doesNotMatch(markdown, /lapsed|vitest only/);
});

test('reports a clean soak without tables', () => {
  assert.equal(renderMarkdown(summarize([vitestReport([['loads decks', 'passed']])]), [], '2026-11-17'),
    '## Soak summary\n\n1 executions of 1 tests; 0 test(s) failed at least once.\n');
});
