import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDocumentationOnly} from './docs-only.mjs';

test('documentation, Markdown and issue templates alone are documentation-only', () => {
  assert.equal(isDocumentationOnly(['docs/development/testing.md', 'docs/product/wireframes/200/mobile.png']), true);
  assert.equal(isDocumentationOnly(['README.md', 'AGENTS.md', 'frontend/README.md', '.github/pull_request_template.md']), true);
  assert.equal(isDocumentationOnly(['.github/ISSUE_TEMPLATE/feature.yml']), true);
});

test('any other path makes the change code', () => {
  for (const path of ['frontend/src/App.tsx', 'backend/pom.xml', '.github/workflows/ci.yaml', 'tools/ci/docs-only.mjs',
    '.devcontainer/start.sh', 'compose.yaml', 'frontend/package-lock.json', 'documents/notes.txt', 'docs.txt']) {
    assert.equal(isDocumentationOnly(['docs/development/testing.md', path]), false, path);
  }
});

test('an empty change is never classified as documentation-only', () => {
  assert.equal(isDocumentationOnly([]), false);
});

test('classifies the difference between a base and HEAD, counting a file moved into docs as code', () => {
  const temp = mkdtempSync(join(tmpdir(), 'docs-only '));
  try {
    const git = (...args) => execFileSync('git', args, {cwd: temp, encoding: 'utf8'});
    const write = (path, content) => {
      mkdirSync(dirname(join(temp, path)), {recursive: true});
      writeFileSync(join(temp, path), content);
    };
    const script = join(temp, 'tools/ci/docs-only.mjs');
    mkdirSync(dirname(script), {recursive: true});
    copyFileSync(fileURLToPath(new URL('./docs-only.mjs', import.meta.url)), script);
    const classify = () => execFileSync(process.execPath, [script, 'HEAD^'], {encoding: 'utf8'});
    const commit = message => { git('add', '.'); git('commit', '-q', '-m', message); };
    write('docs/guide.md', 'guide\n');
    write('frontend/src/notes.ts', 'a source file that is long enough for rename detection\n'.repeat(5));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'user.name', 'CI');
    commit('base');

    write('docs/guide.md', 'changed guide\n');
    write('README.md', 'readme\n');
    commit('documentation');
    assert.equal(classify(), 'code=false\n');

    git('mv', 'frontend/src/notes.ts', 'docs/notes.md');
    commit('move source into docs');
    assert.equal(classify(), 'code=true\n');

    write('docs/guide.md', 'guide again\n');
    write('frontend/src/App.tsx', 'app\n');
    commit('mixed');
    assert.equal(classify(), 'code=true\n');
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
});
