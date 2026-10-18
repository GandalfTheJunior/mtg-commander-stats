import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// Existing integration tests use a desktop viewport. Responsive tests replace
// this with a controlled MediaQueryList and exercise real change notifications.
Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({
  matches: query.includes('min-width') && Number(query.match(/min-width:\s*([\d.]+)/)?.[1]) <= 1280,
  media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
}) })
