import { expect, vi } from 'vitest'

/** Model LAN HTTP capabilities while retaining the real Web Crypto PRNG. */
export function stubLanHttpCrypto() {
  const getRandomValues = crypto.getRandomValues.bind(crypto)
  vi.stubGlobal('crypto', { getRandomValues })
  vi.stubGlobal('isSecureContext', false)
  expect(crypto.randomUUID).toBeUndefined()
  expect(crypto.getRandomValues).toBeTypeOf('function')
}
