import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, inject } from 'vitest'
import { titleSeparator } from './quarantine.ts'

afterEach(cleanup)

// Tests under time-boxed quarantine are reported as skipped (docs/development/testing.md).
// An entry names the full title path: describe titles and test title.
const quarantined = inject('quarantined')
if (quarantined.length > 0) beforeEach(({ task, skip }) => {
  const titles = [task.name]
  for (let suite = task.suite; suite && suite !== task.file; suite = suite.suite) titles.unshift(suite.name)
  const path = titles.join(titleSeparator)
  const entry = quarantined.find(item => task.file.filepath.endsWith(`/${item.file}`) && item.test === path)
  if (entry) skip(`quarantined until ${entry.until}: ${entry.issue}`)
})

// Existing integration tests use a desktop viewport. Responsive tests replace
// this with a controlled MediaQueryList and exercise real change notifications.
Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({
  matches: query.includes('min-width') && Number(query.match(/min-width:\s*([\d.]+)/)?.[1]) <= 1280,
  media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
}) })
