import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {snapshotRuntime} from './runtime.mjs';

test('completed private archives retain all SQL bytes when Maven output is replaced', () => {
  const temp = mkdtempSync(join(tmpdir(), 'mtg runtime '));
  try {
    const target = join(temp, 'target');
    const classes = join(temp, 'classes');
    mkdirSync(target);
    mkdirSync(classes);
    cpSync(fileURLToPath(new URL('../../backend/src/main/resources/', import.meta.url)), classes, {recursive: true});
    const original = join(target, 'app.jar.original');
    execFileSync('jar', ['cf', original, '-C', classes, '.']);
    copyFileSync(original, join(target, 'app.jar'));
    copyFileSync(original, join(target, 'app-tests.jar'));
    const dependency = join(temp, 'dependency.jar');
    copyFileSync(original, dependency);
    writeFileSync(join(target, 'demo-classpath.txt'), dependency);
    const normal = snapshotRuntime(target, join(temp, 'normal'));
    const seed = snapshotRuntime(target, join(temp, 'seed'), true);
    assert.deepEqual(normal.args, ['-jar', normal.jar]);
    assert.equal(seed.args[0], '-cp');
    assert.equal(seed.args[1].split(delimiter).length, 3);
    assert.ok(!seed.args[1].includes(target));
    const bytes = readFileSync(normal.jar);
    writeFileSync(join(target, 'app.jar'), 'incomplete Maven output');
    writeFileSync(original, 'incomplete Maven output');
    assert.deepEqual(readFileSync(normal.jar), bytes);
    assert.deepEqual(readFileSync(seed.jar), bytes);
    assert.throws(() => snapshotRuntime(target, join(temp, 'invalid')));
    rmSync(join(classes, 'db/migration/V2__use_email_for_authentication.sql'));
    execFileSync('jar', ['cf', join(target, 'app.jar'), '-C', classes, '.']);
    assert.throws(() => snapshotRuntime(target, join(temp, 'missing-migration')));
  } finally { rmSync(temp, {recursive: true, force: true}); }
});
