#!/usr/bin/env node
// Summarizes repeated test runs as Markdown: the tests that failed at least once,
// errors outside tests, and the status of every quarantine entry in force.
// Reads Vitest and Playwright JSON reports. See docs/development/testing.md.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
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
 * Yields {runner, file, test, case, cases, status, message, repetition} for every
 * test in one Vitest JSON report, one report per repetition. `status` is passed,
 * failed or skipped (not executed, for example after a failing beforeAll).
 * `test` is the full title path. Parametrized cases that share a title path are
 * told apart by `case`, their position among those cases in the file; the
 * position is stable across repetitions of the same code.
 */
function* vitestOutcomes(report, repetition) {
  for (const file of report.testResults) {
    const cases = new Map();
    const numbered = file.assertionResults.map(assertion => {
      const test = [...assertion.ancestorTitles, assertion.title].join(titleSeparator);
      cases.set(test, (cases.get(test) ?? 0) + 1);
      return {assertion, test, case: cases.get(test)};
    });
    for (const {assertion, test, case: position} of numbered) {
      yield {
        runner: 'vitest',
        file: relative(frontend, file.name),
        test,
        case: position,
        cases: cases.get(test),
        status: assertion.status === 'passed' || assertion.status === 'failed' ? assertion.status : 'skipped',
        message: firstLine(assertion.failureMessages?.[0]),
        repetition,
      };
    }
  }
}

/** Errors outside any test in one Vitest report: a failed file without a failed test. */
function* vitestErrors(report) {
  for (const file of report.testResults) {
    if (file.status === 'failed' && !file.assertionResults.some(assertion => assertion.status === 'failed')) {
      yield {runner: 'vitest', file: relative(frontend, file.name), message: firstLine(file.message) || 'file failed outside its tests'};
    }
  }
}

/**
 * Yields the same shape for one Playwright JSON report. Playwright rejects duplicate
 * titles within a file, so project, file and title path identify a test; each
 * `--repeat-each` repetition is listed as its own spec with that identity and
 * counts as its own repetition.
 */
function* playwrightOutcomes(report, reportIndex) {
  const directory = relative(frontend, report.config.rootDir);
  let attempt = 0;
  function* walk(suite, titles) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const result = test.results.at(-1);
        const status = !result || result.status === 'skipped' ? 'skipped' : result.status === 'passed' ? 'passed' : 'failed';
        yield {
          runner: `playwright ${test.projectName}`,
          file: join(directory, spec.file),
          test: [...titles, spec.title].join(titleSeparator),
          case: 1,
          cases: 1,
          status,
          message: firstLine(result?.error?.message),
          repetition: `${reportIndex}:${attempt++}`,
        };
      }
    }
    for (const child of suite.suites ?? []) yield* walk(child, [...titles, child.title]);
  }
  // Top-level suites are spec files; their titles are not part of the title path.
  for (const file of report.suites) yield* walk(file, []);
}

/** Errors outside any test in one Playwright report, for example a spec that fails to load. */
function* playwrightErrors(report) {
  for (const error of report.errors ?? []) {
    yield {runner: 'playwright', file: error.location?.file ? relative(frontend, error.location.file) : '', message: firstLine(error.message)};
  }
}

/**
 * Aggregates reports into one row per executed test case (most frequent failures
 * first), the errors outside tests, every attempt including unexecuted ones, and
 * the number of repetitions each runner was expected to run.
 *
 * `planned` maps a runner (`vitest`, `playwright chromium`, ...) to the number of
 * repetitions the workflow started. It is authoritative: exactly the planned
 * runners are expected, a repetition that left no report still counts, and the
 * shortfall is listed as an error outside tests. Without a plan, the expected
 * count comes from the reports themselves.
 */
export function summarize(reports, planned = new Map()) {
  const rows = new Map();
  const attempts = [];
  const errors = [];
  const expected = new Map();
  const expect = (runner, count) => expected.set(runner, (expected.get(runner) ?? 0) + count);
  reports.forEach((report, index) => {
    if (report.testResults) {
      expect('vitest', 1);
      attempts.push(...vitestOutcomes(report, `${index}`));
      errors.push(...vitestErrors(report));
      return;
    }
    const outcomes = [...playwrightOutcomes(report, index)];
    attempts.push(...outcomes);
    errors.push(...playwrightErrors(report));
    // Projects that ran; with no test listed at all (a load error), every configured project.
    const ran = new Set(outcomes.map(outcome => outcome.runner.slice('playwright '.length)));
    for (const project of report.config.projects ?? []) {
      if (ran.size === 0 || ran.has(project.name)) expect(`playwright ${project.name}`, project.repeatEach ?? 1);
    }
  });
  // With a plan, exactly the planned runners are expected.
  if (planned.size > 0) for (const runner of expected.keys()) if (!planned.has(runner)) expected.delete(runner);
  for (const [runner, count] of planned) {
    const reported = expected.get(runner) ?? 0;
    if (reported < count) {
      errors.push({runner, file: '', message: `${count - reported} of ${count} planned repetitions left no report`});
    }
    expected.set(runner, count);
  }
  for (const {runner, file, test, case: position, cases, status, message} of attempts) {
    if (status === 'skipped') continue;
    const key = JSON.stringify([runner, file, test, position]);
    const row = rows.get(key) ?? {runner, file, test, case: position, cases, runs: 0, failures: 0, message: ''};
    row.runs++;
    if (status === 'failed') {
      row.failures++;
      row.message ||= message;
    }
    rows.set(key, row);
  }
  const all = [...rows.values()];
  return {
    rows: all,
    attempts,
    errors,
    expected,
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
 * Result of one quarantine entry for one runner. A repetition counts as run only
 * when every case the entry matches executed in it, and as failed when any of
 * them failed. The night is green only when every expected repetition ran and
 * none failed.
 */
function quarantineResult(entry, runner, {attempts, expected}) {
  const repetitions = new Map();
  for (const attempt of attempts) {
    if (attempt.runner !== runner || !matches(entry, attempt)) continue;
    const statuses = repetitions.get(attempt.repetition) ?? [];
    statuses.push(attempt.status);
    repetitions.set(attempt.repetition, statuses);
  }
  const results = [...repetitions.values()].map(statuses =>
    statuses.includes('failed') ? 'failed' : statuses.every(status => status === 'passed') ? 'passed' : 'not run');
  const failed = results.filter(result => result === 'failed').length;
  const ran = results.filter(result => result !== 'not run').length;
  const total = expected.get(runner) ?? 0;
  const result = failed > 0 ? 'red'
    : ran === 0 ? 'not run: check the title path and errors outside tests'
    : ran < total ? `incomplete: ${ran} of ${total} repetitions ran`
    : 'green';
  return {result, failed, ran, total};
}

/**
 * `quarantine` is the parsed frontend/test-quarantine.json and `today` a UTC day
 * (YYYY-MM-DD). Failing tests listed in it are marked with their end date. Every
 * entry in force today gets a status row per runner present in the reports,
 * including entries whose test passed, ran incompletely or did not run at all.
 */
export function renderMarkdown(summary, quarantine = [], today = new Date().toISOString().slice(0, 10)) {
  const {tests, executions, failing, errors, expected} = summary;
  const lines = ['## Soak summary', '', `${executions} executions of ${tests} tests; ${failing.length} test(s) failed at least once.`];
  if (failing.length > 0) {
    lines.push('', '| Runner | Test | Failed / runs | Quarantined until | First failure |', '| --- | --- | --- | --- | --- |');
    for (const row of failing) {
      const entry = quarantine.find(item => matches(item, row));
      lines.push(`| ${row.runner} | \`${cell(row.file)}\` › ${cell(row.test)}${caseLabel(row)} | ${row.failures} / ${row.runs} | ${entry?.until ?? ''} | ${cell(row.message)} |`);
    }
  }

  if (errors.length > 0) {
    const counted = new Map();
    for (const error of errors) {
      const key = JSON.stringify([error.runner, error.file, error.message]);
      counted.set(key, {...error, count: (counted.get(key)?.count ?? 0) + 1});
    }
    lines.push('', '## Errors outside tests', '',
      'Tests of an affected file may not have run in these repetitions.', '',
      '| Runner | File | Occurrences | Error |', '| --- | --- | --- | --- |');
    for (const error of counted.values()) {
      lines.push(`| ${error.runner} | ${error.file ? `\`${cell(error.file)}\`` : ''} | ${error.count} | ${cell(error.message)} |`);
    }
  }

  const runners = [...expected.keys()].sort();
  const status = quarantine
    .filter(entry => entry.since <= today && today <= entry.until)
    .flatMap(entry => runners.filter(runner => runner.startsWith(entry.runner)).map(runner => {
      const {result, failed, ran, total} = quarantineResult(entry, runner, summary);
      return `| ${runner} | \`${cell(entry.file)}\` › ${cell(entry.test)} | ${result} | ${failed} / ${ran} | ${ran} of ${total} | ${entry.until} (${daysUntil(entry.until, today)} days left) | ${entry.issue} |`;
    }));
  if (status.length > 0) {
    lines.push('', '## Quarantine status', '',
      'A night counts as green only when every expected repetition ran and passed. A quarantined test returns to the PR checks after three consecutive green nights in every soak job that runs it.', '',
      '| Runner | Test | Tonight | Failed / run repetitions | Repetitions run | Quarantined until | Issue |',
      '| --- | --- | --- | --- | --- | --- | --- |', ...status);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Parses `--expect <runner>=<count>` options; `playwright/chromium` names the
 * runner `playwright chromium`. Returns undefined for invalid arguments.
 */
export function parsePlan(args) {
  const planned = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const match = args[index] === '--expect' && /^(vitest|playwright\/[\w-]+)=([1-9]\d*)$/.exec(args[index + 1] ?? '');
    if (!match) return undefined;
    planned.set(match[1].replace('/', ' '), Number(match[2]));
  }
  return planned;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [directory, ...options] = process.argv.slice(2);
  const planned = parsePlan(options);
  if (!directory || !planned) {
    console.error('Usage: flake-summary.mjs <directory with Vitest/Playwright JSON reports> [--expect vitest=<runs> | --expect playwright/<project>=<repeats>]...');
    process.exitCode = 2;
  } else {
    // A run that wrote no report at all leaves no directory; the plan still counts it.
    const names = existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith('.json')).sort() : [];
    const reports = names.map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')));
    const quarantine = JSON.parse(readFileSync(join(frontend, 'test-quarantine.json'), 'utf8'));
    process.stdout.write(renderMarkdown(summarize(reports, planned), quarantine));
  }
}
