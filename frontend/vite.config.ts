import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
import { configDefaults, defineConfig } from 'vitest/config'
import type { Connect, Plugin } from 'vite'

// #200/#247: token-bearing invitation and claim pages must not be cached or leak via Referer.
// Production hosting must send the same headers (docs/development/invitation-cutover.md).
const invitationPageHeaders: Connect.NextHandleFunction = (request, response, next) => {
  if (request.url?.startsWith('/invite/') || request.url?.startsWith('/claim/')) {
    // Vite's HTML middleware later sets its own Cache-Control; keep no-store authoritative.
    const setHeader = response.setHeader.bind(response)
    response.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'cache-control' ? 'no-store' : value)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
  }
  next()
}
const invitationHeaders = (): Plugin => ({
  name: 'invitation-page-headers',
  configureServer: server => { server.middlewares.use(invitationPageHeaders) },
  configurePreviewServer: server => { server.middlewares.use(invitationPageHeaders) },
})

// These full UI flows approach their existing time budgets when competing for
// two CPUs. Keep their App/router integration and give them a worker to themselves.
const interactiveSuites = [
  'src/GroupPage.test.tsx',
  'src/GroupStatistics.test.tsx',
  'src/GameEditor.test.tsx',
  'src/GameSession.test.tsx',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), invitationHeaders()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts', 'src/test/**'],
      reportOnFailure: true,
      reporter: [[fileURLToPath(new URL('./tools/split-coverage.mjs', import.meta.url))]],
    },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Full router flows exceeded the default five seconds on a two-CPU runner.
    testTimeout: availableParallelism() <= 2 ? 15000 : 5000,
    // Two-CPU runners time out when route and editor integration suites compete.
    // Keep file isolation and the default forks pool, but serialize on those runners.
    maxWorkers: availableParallelism() <= 2 ? 1 : '100%',
    projects: availableParallelism() <= 2 ? [
      {
        extends: true,
        test: {
          name: 'parallel',
          exclude: [...configDefaults.exclude, ...interactiveSuites],
        },
      },
      {
        extends: true,
        test: {
          name: 'interactive',
          include: interactiveSuites,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ] : undefined,
  },
})
