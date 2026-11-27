/** Opaque in-memory intent association, never authentication or authorization.
 * getRandomValues is available on LAN HTTP, unlike secure-context-only randomUUID.
 */
export function navigationToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** RFC 4122 version 4 UUID from getRandomValues, e.g. for Idempotency-Key on LAN HTTP. */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
