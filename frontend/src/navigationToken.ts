/** Opaque in-memory intent association, never authentication or authorization.
 * getRandomValues is available on LAN HTTP, unlike secure-context-only randomUUID.
 */
export function navigationToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}
