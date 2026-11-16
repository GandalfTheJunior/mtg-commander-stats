#!/usr/bin/env node
// Decides whether a change touches only documentation, so CI can skip the
// build and test jobs for it. See docs/development/testing.md.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// No build, test or tooling check reads these paths.
const documentation = [/^docs\//, /\.md$/, /^\.github\/ISSUE_TEMPLATE\//];

/** True only when at least one path changed and every changed path is documentation. */
export function isDocumentationOnly(changedPaths) {
  return changedPaths.length > 0 && changedPaths.every(path => documentation.some(pattern => pattern.test(path)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  if (!base) {
    console.error('Usage: docs-only.mjs <base-ref>');
    process.exitCode = 2;
  } else {
    // --no-renames reports a file moved into docs/ under its old path as well.
    const output = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'],
      {cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8'});
    // GITHUB_OUTPUT format.
    console.log(`code=${!isDocumentationOnly(output.split('\0').filter(Boolean))}`);
  }
}
