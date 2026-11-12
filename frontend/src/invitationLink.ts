import qrcode from 'qrcode-generator'
import { invitationCodePattern } from './api'

/** Same-origin deep link that opens the public preview; it never joins by itself (#200). */
export const invitePath = (code: string) => `/invite/${encodeURIComponent(code)}`

/** The raw route segment of an invitation deep link, or null for any other path. */
export function inviteSegment(pathname: string): string | null {
  return /^\/invite\/([^/?#]+)$/.exec(pathname)?.[1] ?? null
}

/** Decoded invitation code when well-formed; malformed tokens are never sent to the API. */
export function inviteCode(segment: string): string | null {
  try {
    const code = decodeURIComponent(segment)
    return invitationCodePattern.test(code) ? code : null
  } catch {
    return null
  }
}

/** Origin of the optionally configured public application URL, else the current origin. */
export function publicOrigin(configured: unknown = import.meta.env.VITE_PUBLIC_APP_URL, current = window.location.origin): string {
  if (typeof configured === 'string' && configured.trim()) {
    try {
      const url = new URL(configured.trim())
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
    } catch {
      // An unusable value falls back to the origin serving this application.
    }
  }
  return current
}

/** The single complete URL used for share, copy and QR alike. */
export const invitationUrl = (code: string, origin = publicOrigin()) => new URL(invitePath(code), origin).href

const expiryFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
/** Server-authoritative expiry in the device's local time zone, e.g. `08.11., 19:40 Uhr`. */
export const formatExpiry = (expiresAt: string) => `${expiryFormat.format(new Date(expiresAt))} Uhr`

/** Quiet zone in modules; the QR specification requires at least four. */
export const quietZone = 4

/** Locally computed QR geometry: one SVG path of dark modules, offset by the quiet zone. */
export function qrGeometry(text: string): { size: number; path: string } {
  const code = qrcode(0, 'M')
  code.addData(text, 'Byte')
  code.make()
  const count = code.getModuleCount()
  const parts: string[] = []
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) parts.push(`M${col + quietZone} ${row + quietZone}h1v1h-1z`)
    }
  }
  return { size: count + 2 * quietZone, path: parts.join('') }
}

export type InviteAuthIntent = 'login' | 'register'
/** History-state key that shows the existing auth screen while keeping the invitation URL (#200 §3). */
export const inviteAuthKey = 'inviteAuth'
export const inviteAuthIntent = (state: unknown): InviteAuthIntent | null => {
  const value = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[inviteAuthKey] : undefined
  return value === 'login' || value === 'register' ? value : null
}
