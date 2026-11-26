import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  manyFiles, playwrightFileFilter, playwrightRepeatCount, playwrightRepeats, playwrightRepeatsForManyFiles,
  selectTestFiles, vitestParallelRuns, vitestRoundSizes, vitestRuns,
} from './burn-in.mjs';

const playwrightCli = fileURLToPath(new URL('../../frontend/node_modules/@playwright/test/cli.js', import.meta.url));

const changed = [
  'frontend/src/DeckManager.test.tsx',
  'frontend/src/playground/edgeScroll.test.ts',
  'frontend/src/DeckManager.tsx',
  'frontend/src/test/setup.ts',
  'frontend/e2e/claims.pw.ts',
  'frontend/e2e/ownershipTransfer.ts',
  'frontend/tools/split-coverage.check.mjs',
  'tools/demo/demo.test.mjs',
  'backend/src/test/java/DeckTest.java',
  'docs/development/testing.md',
];

test('selects only the suite\'s own test files, relative to frontend/', () => {
  assert.deepEqual(selectTestFiles('vitest', changed), ['src/DeckManager.test.tsx', 'src/playground/edgeScroll.test.ts']);
  assert.deepEqual(selectTestFiles('playwright', changed), ['e2e/claims.pw.ts']);
});

test('returns each file once, sorted, and nothing for unrelated changes', () => {
  assert.deepEqual(selectTestFiles('playwright', ['frontend/e2e/b.pw.ts', 'frontend/e2e/a.pw.ts', 'frontend/e2e/b.pw.ts']),
    ['e2e/a.pw.ts', 'e2e/b.pw.ts']);
  assert.deepEqual(selectTestFiles('vitest', ['README.md']), []);
});

test('keeps unusual file names intact instead of interpreting them', () => {
  assert.deepEqual(selectTestFiles('vitest', ['frontend/src/a $(touch x);b.test.tsx']), ['src/a $(touch x);b.test.tsx']);
});

test('rejects an unknown suite', () => {
  assert.throws(() => selectTestFiles('jest', changed), /Unknown suite "jest"/);
});

test('repeats fewer times only when a change touches many browser specs', () => {
  assert.equal(playwrightRepeatCount(1), playwrightRepeats);
  assert.equal(playwrightRepeatCount(manyFiles), playwrightRepeats);
  assert.equal(playwrightRepeatCount(manyFiles + 1), playwrightRepeatsForManyFiles);
});

test('runs every file the documented number of times, whatever the CPU count', () => {
  for (const cpus of [1, 2, 3, vitestParallelRuns, 16]) {
    const rounds = vitestRoundSizes(cpus);
    assert.equal(rounds.reduce((sum, runs) => sum + runs, 0), vitestRuns, `${cpus} CPU(s)`);
    assert.ok(rounds.every(runs => runs >= 1 && runs <= Math.min(cpus, vitestParallelRuns)), `${cpus} CPU(s)`);
  }
  assert.deepEqual(vitestRoundSizes(vitestParallelRuns), [4, 4, 4, 4, 4]);
  assert.deepEqual(vitestRoundSizes(3), [3, 3, 3, 3, 3, 3, 2]);
  assert.equal(vitestRoundSizes(0).length, vitestRuns);
});

test('escapes and anchors a browser spec path so it matches only that file', () => {
  const matches = (file, path) => {
    const [, source, flags] = /^\/(.*)\/([gi]*)$/.exec(playwrightFileFilter(file));
    return new RegExp(source, flags).test(path);
  };
  const file = 'e2e/member (mobile) [a+b].pw.ts';
  assert.ok(matches(file, `/repo/frontend/${file}`));
  assert.ok(matches(file, file));
  assert.ok(!matches(file, '/repo/frontend/e2e/member mobile ab.pw.ts'));
  assert.ok(!matches(file, `/repo/frontend/${file}.orig`));
  assert.ok(!matches(file, '/repo/frontend/e2e/MEMBER (MOBILE) [A+B].pw.ts'));
  assert.ok(!matches('e2e/a.pw.ts', '/repo/frontend/e2e/xa.pw.ts'));
  // No trailing ":<number>", which Playwright would split off as a line filter.
  assert.doesNotMatch(playwrightFileFilter('e2e/a.pw.ts:12'), /:\d+$/);
  assert.throws(() => playwrightFileFilter('e2e/a\n.pw.ts'), /line break/);
});

test('makes Playwright select exactly the changed specs, including names with regex characters',
  {skip: !existsSync(playwrightCli) && 'frontend dependencies are not installed (run npm ci in frontend/)'}, () => {
    const temp = mkdtempSync(join(tmpdir(), 'burn-in playwright '));
    try {
      // The specs live outside frontend/, so they import the installed runner by its absolute path.
      const runner = JSON.stringify(dirname(playwrightCli));
      const spec = title => `import {test} from ${runner};\ntest(${JSON.stringify(title)}, () => {});\n`;
      const specs = {
        'e2e/smoke.pw.ts': 'smoke',
        'e2e/member (mobile).pw.ts': 'member with parentheses',
        // An unescaped "member (mobile)" filter matches this decoy instead of the file above.
        'e2e/member mobile.pw.ts': 'decoy without parentheses',
        'e2e/other.pw.ts': 'unchanged',
      };
      for (const [path, title] of Object.entries(specs)) {
        mkdirSync(dirname(join(temp, path)), {recursive: true});
        writeFileSync(join(temp, path), spec(title));
      }
      const config = join(temp, 'playwright.config.mjs');
      writeFileSync(config, "export default {testDir: './e2e', testMatch: '**/*.pw.ts'};\n");
      const listed = filters => execFileSync(process.execPath, [playwrightCli, 'test', '--list', '--config', config, ...filters],
        {cwd: fileURLToPath(new URL('../../frontend/', import.meta.url)), encoding: 'utf8'});
      const selected = ['e2e/member (mobile).pw.ts', 'e2e/smoke.pw.ts'];

      const fixed = listed(selected.map(playwrightFileFilter));
      assert.match(fixed, /member with parentheses/);
      assert.match(fixed, /› smoke$/m);
      assert.doesNotMatch(fixed, /decoy without parentheses|unchanged/);
      assert.match(fixed, /Total: 2 tests in 2 files/);

      // The raw names show the defect this guards against: the parenthesized spec is silently not selected.
      assert.doesNotMatch(listed(selected), /member with parentheses/);
    } finally {
      rmSync(temp, {recursive: true, force: true});
    }
  });

test('counts added, modified and renamed test files since the base, ignoring deletions', () => {
  const temp = mkdtempSync(join(tmpdir(), 'burn-in '));
  try {
    const git = (...args) => execFileSync('git', args, {cwd: temp, encoding: 'utf8'});
    const write = (path, content) => {
      mkdirSync(dirname(join(temp, path)), {recursive: true});
      writeFileSync(join(temp, path), content);
    };
    const script = join(temp, 'tools/ci/burn-in.mjs');
    mkdirSync(dirname(script), {recursive: true});
    copyFileSync(fileURLToPath(new URL('./burn-in.mjs', import.meta.url)), script);
    write('frontend/src/Kept.test.tsx', 'kept');
    write('frontend/src/Removed.test.tsx', 'removed');
    write('frontend/src/Renamed.test.tsx', 'a test file that is long enough for rename detection\n'.repeat(5));
    write('frontend/e2e/kept.pw.ts', 'kept');
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'user.name', 'CI');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'change');
    write('frontend/src/Added.test.tsx', 'added');
    write('frontend/src/Kept.test.tsx', 'modified');
    git('rm', '-q', 'frontend/src/Removed.test.tsx');
    git('mv', 'frontend/src/Renamed.test.tsx', 'frontend/src/Moved.test.tsx');
    write('frontend/e2e/added.pw.ts', 'added');
    git('add', '.');
    git('commit', '-q', '-m', 'change');

    assert.equal(execFileSync(process.execPath, [script, 'count', 'main'], {encoding: 'utf8'}), 'vitest=3\nplaywright=1\n');
    git('checkout', '-q', 'main');
    assert.equal(execFileSync(process.execPath, [script, 'count', 'main'], {encoding: 'utf8'}), 'vitest=0\nplaywright=0\n');
    assert.match(execFileSync(process.execPath, [script, 'vitest', 'main'], {encoding: 'utf8'}), /nothing to burn in/);
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
});
