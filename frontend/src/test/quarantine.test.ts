import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { activeQuarantine, utcDay, type QuarantineEntry } from './quarantine.ts'

const entry: QuarantineEntry = {
  runner: 'playwright', file: 'e2e/sample.pw.ts', test: 'target',
  issue: 'https://github.com/GandalfTheJunior/mtg-commander-stats/issues/1', since: '2026-11-10', until: '2026-11-20',
}

test('an entry applies from its first through its last day and only to its own runner', () => {
  for (const day of ['2026-11-10', '2026-11-15', '2026-11-20']) expect(activeQuarantine([entry], 'playwright', day)).toEqual([entry])
  for (const day of ['2026-11-09', '2026-11-21']) expect(activeQuarantine([entry], 'playwright', day)).toEqual([])
  expect(activeQuarantine([entry], 'vitest', '2026-11-15')).toEqual([])
})

test('days are compared in UTC', () => {
  expect(utcDay(new Date('2026-11-20T23:59:59Z'))).toBe('2026-11-20')
  expect(utcDay(new Date('2026-11-21T00:00:00+02:00'))).toBe('2026-11-20')
})

// The real Playwright runner lists the fixture specs with the quarantine filter applied.
// Paths resolve from frontend/, the Vitest root, because jsdom replaces file URLs.
const playwrightCli = createRequire(resolve('package.json')).resolve('@playwright/test/cli')
const fixtureConfig = resolve('src/test/quarantine-fixture/playwright.config.ts')

type ListedSuite = { title: string, specs?: { title: string, tests: { projectName: string }[] }[], suites?: ListedSuite[] }

function listed(entries: QuarantineEntry[]) {
  const output = execFileSync(process.execPath, [playwrightCli, 'test', '--list', '--reporter=json', '--config', fixtureConfig], {
    encoding: 'utf8', env: { ...process.env, QUARANTINE_ENTRIES: JSON.stringify(entries) },
  })
  const tests: string[] = []
  const collect = (suite: ListedSuite, titles: string[]) => {
    for (const spec of suite.specs ?? []) for (const run of spec.tests) tests.push([run.projectName, ...titles, spec.title].join(' › '))
    for (const child of suite.suites ?? []) collect(child, [...titles, child.title])
  }
  for (const file of (JSON.parse(output) as { suites: ListedSuite[] }).suites) collect(file, [file.title])
  return tests.sort()
}

const all = ['target', 'unrelated prefix target', 'target and more', 'control', 'tagged target @slow', 'target @slow', 'group › target', 'group › inner group › target']
  .map(title => `sample.pw.ts › ${title}`).concat('other.pw.ts › target')
const everywhere = (titles: string[]) => ['chromium', 'webkit'].flatMap(project => titles.map(title => `${project} › ${title}`)).sort()

test('the real Playwright runner excludes exactly the quarantined test in both projects', { timeout: 60_000 }, () => {
  expect(listed([])).toEqual(everywhere(all))
  const except = (excluded: string) => everywhere(all.filter(title => title !== excluded))
  // A title that ends, starts or nests the quarantined title, or adds an inline
  // tag to it, stays listed, in the same spec or another one.
  expect(listed([entry])).toEqual(except('sample.pw.ts › target'))
  expect(listed([{ ...entry, test: 'target @slow' }])).toEqual(except('sample.pw.ts › target @slow'))
  expect(listed([{ ...entry, test: 'group › target' }])).toEqual(except('sample.pw.ts › group › target'))
  expect(listed([{ ...entry, test: 'group › inner group › target' }])).toEqual(except('sample.pw.ts › group › inner group › target'))
  expect(listed([{ ...entry, test: 'tagged target @slow' }])).toEqual(except('sample.pw.ts › tagged target @slow'))
  // An entry that names no existing title path excludes nothing.
  expect(listed([{ ...entry, test: 'inner group › target' }])).toEqual(everywhere(all))
})
