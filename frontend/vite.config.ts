import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
import { configDefaults, defineConfig } from 'vitest/config'

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
  plugins: [react()],
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
    // Vitest reserves one CPU by default, leaving two-CPU runners serial.
    // Keep file isolation and the default forks pool; use the available CPUs.
    maxWorkers: '100%',
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
