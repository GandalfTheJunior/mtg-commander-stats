import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {manyFiles, playwrightRepeatCount, playwrightRepeats, playwrightRepeatsForManyFiles, selectTestFiles} from './burn-in.mjs';

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
