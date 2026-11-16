import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {renderMarkdown, summarize} from './flake-summary.mjs';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));

const vitestReport = statuses => ({
  testResults: [{
    name: `${frontend}src/DeckManager.test.tsx`,
    assertionResults: Object.entries(statuses).map(([title, status]) => ({
      title, status, failureMessages: status === 'failed' ? ['\u001b[31mTypeError: Cannot read properties of undefined\u001b[39m\n    at src/DeckManager.test.tsx:76:82'] : [],
    })),
  }],
});

const playwrightSpec = (title, status) => ({
  title, file: 'claims.pw.ts',
  tests: [{projectName: 'webkit', results: [{status, ...(status === 'passed' ? {} : {error: {message: 'Error: expect(locator).toBeVisible() failed\n\nLocator: getByText'}})}]}],
});
const playwrightReport = specs => ({
  config: {rootDir: `${frontend}e2e`},
  suites: [{specs: [], suites: [{specs}]}],
});

test('counts executions per test across reports and lists only tests that failed', () => {
  const summary = summarize([
    vitestReport({'loads decks': 'passed', 'pending list': 'failed', 'later': 'skipped'}),
    vitestReport({'loads decks': 'passed', 'pending list': 'passed', 'later': 'skipped'}),
    vitestReport({'loads decks': 'passed', 'pending list': 'failed', 'later': 'skipped'}),
  ]);
  assert.equal(summary.tests, 2);
  assert.equal(summary.executions, 6);
  assert.deepEqual(summary.failing, [{
    runner: 'vitest', file: 'src/DeckManager.test.tsx', test: 'pending list', runs: 3, failures: 2,
    message: 'TypeError: Cannot read properties of undefined',
  }]);
});

test('reads repeated Playwright specs in nested suites and treats a timeout as a failure', () => {
  const summary = summarize([playwrightReport([
    playwrightSpec('accepts once', 'passed'), playwrightSpec('accepts once', 'timedOut'),
    playwrightSpec('accepts once', 'passed'), playwrightSpec('declines', 'skipped'),
  ])]);
  assert.equal(summary.executions, 3);
  assert.deepEqual(summary.failing, [{
    runner: 'playwright webkit', file: 'e2e/claims.pw.ts', test: 'accepts once', runs: 3, failures: 1,
    message: 'Error: expect(locator).toBeVisible() failed',
  }]);
});

test('orders by failure rate and marks quarantined tests in the table', () => {
  const summary = summarize([
    vitestReport({'a | b': 'failed', 'often': 'failed'}), vitestReport({'a | b': 'passed', 'often': 'failed'}),
  ]);
  const markdown = renderMarkdown(summary, [{runner: 'vitest', file: 'src/DeckManager.test.tsx', test: 'often', until: '2026-11-30'}]);
  const rows = markdown.split('\n').filter(line => line.startsWith('| vitest'));
  assert.match(rows[0], /› often \| 2 \/ 2 \| 2026-11-30 \| TypeError/);
  assert.match(rows[1], /› a \\\| b \| 1 \/ 2 \|  \| TypeError/);
  assert.match(markdown, /4 executions of 2 tests; 2 test\(s\) failed at least once\./);
});

test('reports a clean soak without a table', () => {
  assert.equal(renderMarkdown(summarize([vitestReport({'loads decks': 'passed'})])),
    '## Soak summary\n\n1 executions of 1 tests; 0 test(s) failed at least once.\n');
});
