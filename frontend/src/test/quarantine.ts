// Time-boxed quarantine for known flaky tests; rules in docs/development/testing.md.
// Pure functions only: Vitest and Playwright configuration both load this module.
import type {} from 'vitest'

export type QuarantineEntry = {
  runner: 'vitest' | 'playwright'
  /** Path relative to frontend/, for example src/DeckManager.test.tsx or e2e/claims.pw.ts. */
  file: string
  /** Exact test title. */
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

export const utcDay = (date: Date) => date.toISOString().slice(0, 10)

/** Entries in force on `day`. A lapsed entry stops applying, so its test gates pull requests again. */
export function activeQuarantine(entries: QuarantineEntry[], runner: QuarantineEntry['runner'], day: string) {
  return entries.filter(entry => entry.runner === runner && entry.since <= day && day <= entry.until)
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Matches the string Playwright filters on: project name, spec path relative
 * to the e2e test directory, describe titles, test title and tags, space-separated.
 */
export function playwrightTitlePattern(entry: QuarantineEntry) {
  const spec = entry.file.replace(/^e2e\//, '')
  return new RegExp(` ${escapeRegExp(spec)} (?:.* )?${escapeRegExp(entry.test)}(?: @\\S+)*$`)
}
