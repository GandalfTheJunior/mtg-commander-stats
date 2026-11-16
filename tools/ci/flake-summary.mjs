#!/usr/bin/env node
// Summarizes repeated test runs as a Markdown table of the tests that failed at
// least once. Reads Vitest and Playwright JSON reports. See docs/development/testing.md.
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));

function firstLine(message) {
  // Strip ANSI colors so the line reads cleanly in a job summary.
  return String(message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').find(line => line.trim())?.trim() ?? '';
}

/** Yields {runner, file, test, failed, message} for every executed test in one Vitest JSON report. */
function* vitestOutcomes(report) {
  for (const file of report.testResults) {
    for (const assertion of file.assertionResults) {
      if (assertion.status !== 'passed' && assertion.status !== 'failed') continue;
      yield {
        runner: 'vitest',
        file: relative(frontend, file.name),
        test: assertion.title,
        failed: assertion.status === 'failed',
        message: firstLine(assertion.failureMessages?.[0]),
      };
    }
  }
}

/** Yields the same shape for one Playwright JSON report; `--repeat-each` lists each repetition as its own spec. */
function* playwrightOutcomes(report, suites = report.suites, directory = relative(frontend, report.config.rootDir)) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const result = test.results.at(-1);
        if (!result || result.status === 'skipped') continue;
        yield {
          runner: `playwright ${test.projectName}`,
          file: join(directory, spec.file),
          test: spec.title,
          failed: result.status !== 'passed',
          message: firstLine(result.error?.message),
        };
      }
    }
    yield* playwrightOutcomes(report, suite.suites ?? [], directory);
  }
}

/** Aggregates reports into one row per test, most frequent failures first. */
export function summarize(reports) {
  const rows = new Map();
  for (const report of reports) {
    const outcomes = report.testResults ? vitestOutcomes(report) : playwrightOutcomes(report);
    for (const {runner, file, test, failed, message} of outcomes) {
      const key = JSON.stringify([runner, file, test]);
      const row = rows.get(key) ?? {runner, file, test, runs: 0, failures: 0, message: ''};
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
    tests: all.length,
    executions: all.reduce((sum, row) => sum + row.runs, 0),
    failing: all.filter(row => row.failures > 0)
      .sort((a, b) => b.failures / b.runs - a.failures / a.runs || a.file.localeCompare(b.file) || a.test.localeCompare(b.test)),
  };
}

const cell = text => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ');

/** `quarantine` is the parsed frontend/test-quarantine.json; listed tests are marked with their end date. */
export function renderMarkdown({tests, executions, failing}, quarantine = []) {
  const lines = ['## Soak summary', '', `${executions} executions of ${tests} tests; ${failing.length} test(s) failed at least once.`];
  if (failing.length === 0) return `${lines.join('\n')}\n`;
  lines.push('', '| Runner | Test | Failed / runs | Quarantined until | First failure |', '| --- | --- | --- | --- | --- |');
  for (const row of failing) {
    const entry = quarantine.find(item => row.runner.startsWith(item.runner) && item.file === row.file && item.test === row.test);
    lines.push(`| ${row.runner} | \`${cell(row.file)}\` › ${cell(row.test)} | ${row.failures} / ${row.runs} | ${entry?.until ?? ''} | ${cell(row.message)} |`);
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
