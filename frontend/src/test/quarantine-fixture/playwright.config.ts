// Fixture for src/test/quarantine.test.ts: lists sample tests through the real
// Playwright runner with the quarantine filter from QUARANTINE_ENTRIES applied.
import { defineConfig } from '@playwright/test'
import { playwrightTitlePattern, type QuarantineEntry } from '../quarantine.ts'

const entries: QuarantineEntry[] = JSON.parse(process.env.QUARANTINE_ENTRIES ?? '[]')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  grepInvert: entries.map(playwrightTitlePattern),
  projects: [{ name: 'chromium' }, { name: 'webkit' }],
})
