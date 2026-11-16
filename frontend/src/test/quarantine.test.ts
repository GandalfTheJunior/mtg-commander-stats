import { expect, test } from 'vitest'
import { activeQuarantine, playwrightTitlePattern, utcDay, type QuarantineEntry } from './quarantine.ts'

const entry: QuarantineEntry = {
  runner: 'playwright', file: 'e2e/claims.pw.ts', test: 'accepts (once) at 320px',
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

test('the Playwright pattern matches exactly the quarantined test in its spec, in every project', () => {
  const pattern = playwrightTitlePattern(entry)
  expect(pattern.test('chromium claims.pw.ts accepts (once) at 320px')).toBe(true)
  expect(pattern.test('webkit claims.pw.ts Claim dialog accepts (once) at 320px @slow')).toBe(true)
  expect(pattern.test('chromium claims.pw.ts accepts (once) at 320px and again')).toBe(false)
  expect(pattern.test('chromium claims.pw.ts accepts xoncex at 320px')).toBe(false)
  expect(pattern.test('chromium invitations.pw.ts accepts (once) at 320px')).toBe(false)
  expect(pattern.test('chromium other-claims.pw.ts accepts (once) at 320px')).toBe(false)
})
