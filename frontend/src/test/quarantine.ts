// Time-boxed quarantine for known flaky tests; rules in docs/development/testing.md.
// Pure functions only: Vitest and Playwright configuration both load this module.
import type {} from 'vitest'

export type QuarantineEntry = {
  runner: 'vitest' | 'playwright'
  /** Path relative to frontend/, for example src/DeckManager.test.tsx or e2e/claims.pw.ts. */
  file: string
  /** Full title path below the file: describe titles and the test title, joined by ` › `. */
  test: string
  /** Issue that tracks the root-cause fix. */
  issue: string
  /** First and last quarantined day, YYYY-MM-DD (UTC). */
  since: string
  until: string
}

declare module 'vitest' {
  // vite.config.ts provides the entries in force to src/test/setup.ts.
  export interface ProvidedContext { quarantined: QuarantineEntry[] }
}

/** Separator between describe titles and the test title in an entry's `test`. */
export const titleSeparator = ' › '

export const utcDay = (date: Date) => date.toISOString().slice(0, 10)

/** Entries in force on `day`. A lapsed entry stops applying, so its test gates pull requests again. */
export function activeQuarantine(entries: QuarantineEntry[], runner: QuarantineEntry['runner'], day: string) {
  return entries.filter(entry => entry.runner === runner && entry.since <= day && day <= entry.until)
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Matches exactly the string Playwright filters on for the entry's test:
 * project name, spec path relative to the e2e directory, describe titles and
 * test title, each followed by its tags, space-separated.
 * Anchored at both ends, so a title that merely ends or starts with the
 * quarantined title is never excluded.
 */
export function playwrightTitlePattern(entry: QuarantineEntry) {
  const tags = '(?: @\\S+)*'
  const spec = entry.file.replace(/^e2e\//, '')
  const titles = entry.test.split(titleSeparator).map(title => escapeRegExp(title) + tags).join(' ')
  return new RegExp(`^[^ ]+${tags} ${escapeRegExp(spec)}${tags} ${titles}$`)
}
