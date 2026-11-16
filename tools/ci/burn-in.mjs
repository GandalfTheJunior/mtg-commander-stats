#!/usr/bin/env node
// Repeats the test files a change added or modified so a timing-sensitive test
// fails in the pull request that introduces it. See docs/development/testing.md.
import {spawn, execFileSync} from 'node:child_process';
import {availableParallelism} from 'node:os';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));

const suites = {
  vitest: /^frontend\/(src\/.+\.(?:test|spec)\.tsx?)$/,
  playwright: /^frontend\/(e2e\/.+\.pw\.ts)$/,
};

// Vitest runs test files side by side in CI, so each round starts as many
// single-worker runs as CI has workers: 5 rounds of 4 runs execute a file 20 times.
export const vitestRounds = 5;
export const vitestParallelRuns = 4;
// CI runs Playwright with one worker, so repeats are sequential there too.
export const playwrightRepeats = 10;
export const playwrightRepeatsForManyFiles = 3;
export const manyFiles = 3;

/** Returns the suite's test files among repository-relative paths, relative to frontend/. */
export function selectTestFiles(suite, changedPaths) {
  const pattern = suites[suite];
  if (!pattern) throw new Error(`Unknown suite "${suite}"; expected ${Object.keys(suites).join(' or ')}.`);
  return [...new Set(changedPaths.map(path => pattern.exec(path)?.[1]).filter(Boolean))].sort();
}

export function playwrightRepeatCount(fileCount) {
  return fileCount > manyFiles ? playwrightRepeatsForManyFiles : playwrightRepeats;
}

/** Paths added, modified or renamed on HEAD since it diverged from base. Deleted files have nothing to run. */
function changedPaths(base) {
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=AMR', '-z', `${base}...HEAD`],
    {cwd: repository, encoding: 'utf8'});
  return output.split('\0').filter(Boolean);
}

// Runner entry points are started directly, never through a shell: file names come from the change under test.
const vitestCli = fileURLToPath(new URL('../../frontend/node_modules/vitest/vitest.mjs', import.meta.url));
const playwrightCli = fileURLToPath(new URL('../../frontend/node_modules/@playwright/test/cli.js', import.meta.url));

function run(args, {capture}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: frontend, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'});
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    child.stderr?.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({code, output}));
  });
}

async function burnInVitest(files) {
  const parallelRuns = Math.min(vitestParallelRuns, availableParallelism());
  let failedRuns = 0;
  for (let round = 1; round <= vitestRounds; round++) {
    const runs = await Promise.all(Array.from({length: parallelRuns}, () =>
      run([vitestCli, 'run', '--maxWorkers=1', ...files], {capture: true})));
    const failed = runs.filter(({code}) => code !== 0);
    failedRuns += failed.length;
    console.log(`Round ${round}/${vitestRounds}: ${parallelRuns - failed.length}/${parallelRuns} runs passed.`);
    for (const {output} of failed) console.log(output);
  }
  const totalRuns = vitestRounds * parallelRuns;
  console.log(`Vitest burn-in: ${totalRuns - failedRuns}/${totalRuns} runs passed.`);
  return failedRuns === 0 ? 0 : 1;
}

async function burnInPlaywright(files, extraArgs) {
  const repeats = playwrightRepeatCount(files.length);
  const {code} = await run([playwrightCli, 'test', `--repeat-each=${repeats}`, ...extraArgs, ...files], {capture: false});
  return code === 0 ? 0 : 1;
}

async function main([mode, base, ...rest]) {
  if (!mode || !base) {
    console.error('Usage: burn-in.mjs <count|vitest|playwright> <base-ref> [-- <extra runner arguments>]');
    return 2;
  }
  const paths = changedPaths(base);
  if (mode === 'count') {
    // GITHUB_OUTPUT format; counts only, so no file name reaches a workflow expression.
    for (const suite of Object.keys(suites)) console.log(`${suite}=${selectTestFiles(suite, paths).length}`);
    return 0;
  }
  const files = selectTestFiles(mode, paths);
  if (files.length === 0) {
    console.log(`No added or changed ${mode} test files since ${base}; nothing to burn in.`);
    return 0;
  }
  console.log(`Burning in ${files.length} ${mode} test file(s) changed since ${base}:\n${files.map(file => `  ${file}`).join('\n')}`);
  const extraArgs = rest[0] === '--' ? rest.slice(1) : rest;
  return mode === 'vitest' ? burnInVitest(files) : burnInPlaywright(files, extraArgs);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
