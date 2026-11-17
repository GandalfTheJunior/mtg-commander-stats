#!/usr/bin/env node
// Summarizes repeated test runs as Markdown: the tests that failed at least once,
// and the status of every quarantine entry in force. Reads Vitest and Playwright
// JSON reports. See docs/development/testing.md.
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));

/** Same separator as an entry's `test` in frontend/test-quarantine.json. */
const titleSeparator = ' › ';

function firstLine(message) {
  // Strip ANSI colors so the line reads cleanly in a job summary.
  return String(message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find(line => line.trim())?.trim() ?? '';
}

/**
 * Yields {runner, file, test, case, cases, failed, message} for every executed test
 * in one Vitest JSON report. `test` is the full title path. Parametrized cases that
 * share a title path are told apart by `case`, their position among those cases in
 * the file; the position is stable across repetitions of the same code.
 */
function* vitestOutcomes(report) {
  for (const file of report.testResults) {
    const cases = new Map();
    const numbered = file.assertionResults.map(assertion => {
      const test = [...assertion.ancestorTitles, assertion.title].join(titleSeparator);
      cases.set(test, (cases.get(test) ?? 0) + 1);
      return {assertion, test, case: cases.get(test)};
    });
    for (const {assertion, test, case: position} of numbered) {
      if (assertion.status !== 'passed' && assertion.status !== 'failed') continue;
      yield {
        runner: 'vitest',
        file: relative(frontend, file.name),
        test,
        case: position,
        cases: cases.get(test),
        failed: assertion.status === 'failed',
        message: firstLine(assertion.failureMessages?.[0]),
      };
    }
  }
}

/**
 * Yields the same shape for one Playwright JSON report. Playwright rejects duplicate
 * titles within a file, so project, file and title path identify a test; each
 * `--repeat-each` repetition is listed as its own spec with that identity.
 */
function* playwrightOutcomes(report) {
  const directory = relative(frontend, report.config.rootDir);
  function* walk(suite, titles) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const result = test.results.at(-1);
        if (!result || result.status === 'skipped') continue;
        yield {
          runner: `playwright ${test.projectName}`,
          file: join(directory, spec.file),
          test: [...titles, spec.title].join(titleSeparator),
          case: 1,
          cases: 1,
          failed: result.status !== 'passed',
          message: firstLine(result.error?.message),
        };
      }
    }
    for (const child of suite.suites ?? []) yield* walk(child, [...titles, child.title]);
  }
  // Top-level suites are spec files; their titles are not part of the title path.
  for (const file of report.suites) yield* walk(file, []);
}

/** Aggregates reports into one row per test case, most frequent failures first. */
export function summarize(reports) {
  const rows = new Map();
  for (const report of reports) {
    const outcomes = report.testResults ? vitestOutcomes(report) : playwrightOutcomes(report);
    for (const {runner, file, test, case: position, cases, failed, message} of outcomes) {
      const key = JSON.stringify([runner, file, test, position]);
      const row = rows.get(key) ?? {runner, file, test, case: position, cases, runs: 0, failures: 0, message: ''};
      row.runs++;
      if (failed) {
        row.failures++;
        row.message ||= message;
      }
      rows.set(key, row);
    }
  }
  const all = [...rows.values()];
  return {
    rows: all,
    tests: all.length,
    executions: all.reduce((sum, row) => sum + row.runs, 0),
    failing: all.filter(row => row.failures > 0)
      .sort((a, b) => b.failures / b.runs - a.failures / a.runs || a.file.localeCompare(b.file)
        || a.test.localeCompare(b.test) || a.case - b.case),
  };
}

const cell = text => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
const caseLabel = row => (row.cases > 1 ? ` (case ${row.case} of ${row.cases})` : '');
const matches = (entry, row) => row.runner.startsWith(entry.runner) && entry.file === row.file && entry.test === row.test;
const daysUntil = (day, today) => Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);

/**
 * `quarantine` is the parsed frontend/test-quarantine.json and `today` a UTC day
 * (YYYY-MM-DD). Failing tests listed in it are marked with their end date. Every
 * entry in force today for a runner present in the reports gets a status row per
 * runner, including entries whose test passed or did not run at all.
 */
export function renderMarkdown({rows, tests, executions, failing}, quarantine = [], today = new Date().toISOString().slice(0, 10)) {
  const lines = ['## Soak summary', '', `${executions} executions of ${tests} tests; ${failing.length} test(s) failed at least once.`];
  if (failing.length > 0) {
    lines.push('', '| Runner | Test | Failed / runs | Quarantined until | First failure |', '| --- | --- | --- | --- | --- |');
    for (const row of failing) {
      const entry = quarantine.find(item => matches(item, row));
      lines.push(`| ${row.runner} | \`${cell(row.file)}\` › ${cell(row.test)}${caseLabel(row)} | ${row.failures} / ${row.runs} | ${entry?.until ?? ''} | ${cell(row.message)} |`);
    }
  }

  const runners = [...new Set(rows.map(row => row.runner))].sort();
  const status = quarantine
    .filter(entry => entry.since <= today && today <= entry.until)
    .flatMap(entry => runners.filter(runner => runner.startsWith(entry.runner)).map(runner => {
      const matched = rows.filter(row => row.runner === runner && matches(entry, row));
      const runs = matched.reduce((sum, row) => sum + row.runs, 0);
      const failures = matched.reduce((sum, row) => sum + row.failures, 0);
      const result = runs === 0 ? 'not run: check the title path' : failures === 0 ? 'green' : 'red';
      return `| ${runner} | \`${cell(entry.file)}\` › ${cell(entry.test)} | ${result} | ${failures} / ${runs} | ${entry.until} (${daysUntil(entry.until, today)} days left) | ${entry.issue} |`;
    }));
  if (status.length > 0) {
    lines.push('', '## Quarantine status', '',
      'A quarantined test returns to the PR checks after three consecutive green nights in every soak job that runs it.', '',
      '| Runner | Test | Tonight | Failed / runs | Quarantined until | Issue |', '| --- | --- | --- | --- | --- | --- |', ...status);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('Usage: flake-summary.mjs <directory with Vitest/Playwright JSON reports>');
    process.exitCode = 2;
  } else {
    const reports = readdirSync(directory).filter(name => name.endsWith('.json')).sort()
      .map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')));
    const quarantine = JSON.parse(readFileSync(join(frontend, 'test-quarantine.json'), 'utf8'));
    process.stdout.write(renderMarkdown(summarize(reports), quarantine));
  }
}
