import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createCoverageMap } from '@vitest/istanbul-lib-coverage'
import { createContext } from '@vitest/istanbul-lib-report'
import SplitCoverage from './split-coverage.mjs'

test('keeps uncovered files in separate app and playground denominators', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-reporter-'))
  try {
    const map = createCoverageMap({})
    for (const [name, hits] of [['app.ts', 1], ['untested.ts', 0], ['playground/untested.ts', 0]]) {
      const path = join(dir, 'src', name)
      map.addFileCoverage({ path, statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } } },
        fnMap: {}, branchMap: {}, s: { 0: hits }, f: {}, b: {} })
    }
    const summaryPath = join(dir, 'summary.md')
    const previous = process.env.GITHUB_STEP_SUMMARY
    process.env.GITHUB_STEP_SUMMARY = summaryPath
    writeFileSync(summaryPath, '')
    try {
      new SplitCoverage({ projectRoot: dir }).execute(createContext({
        dir: join(dir, 'coverage'), coverageMap: map, sourceFinder: () => 'export const x = 1;',
      }))
    } finally {
      if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY
      else process.env.GITHUB_STEP_SUMMARY = previous
    }
    const app = JSON.parse(readFileSync(join(dir, 'coverage/app/coverage-summary.json')))
    const playground = JSON.parse(readFileSync(join(dir, 'coverage/playground/coverage-summary.json')))
    assert.equal(app.total.lines.total, 2)
    assert.equal(app.total.lines.pct, 50)
    assert.equal(app[join(dir, 'src/untested.ts')].lines.pct, 0)
    assert.equal(playground.total.lines.total, 1)
    assert.equal(playground.total.lines.pct, 0)
    assert.ok(!Object.hasOwn(app, join(dir, 'src/playground/untested.ts')))
    for (const scope of ['app', 'playground']) {
      assert.match(readFileSync(join(dir, 'coverage', scope, 'index.html'), 'utf8'), /<!doctype html>/i)
    }
    assert.match(readFileSync(summaryPath, 'utf8'), /\| playground \| 1 \| 0% \(0\/1\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
