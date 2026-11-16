import { readFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'
import { activeQuarantine, playwrightTitlePattern, utcDay, type QuarantineEntry } from './src/test/quarantine.ts'

// Known flaky tests listed in test-quarantine.json stay out of regular runs until
// their entry lapses; the nightly soak run sets RUN_QUARANTINED to keep observing them.
const registry: QuarantineEntry[] = JSON.parse(readFileSync(new URL('./test-quarantine.json', import.meta.url), 'utf8'))
const quarantined = process.env.RUN_QUARANTINED ? [] : activeQuarantine(registry, 'playwright', utcDay(new Date()))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts', // Separate from Vitest's component/unit file patterns.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  grepInvert: quarantined.map(playwrightTitlePattern),
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 600 },
    isMobile: true, hasTouch: true,
    video: process.env.CI ? 'on' : 'off', trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/dev/lounge.html', reuseExistingServer: !process.env.CI,
  },
})
