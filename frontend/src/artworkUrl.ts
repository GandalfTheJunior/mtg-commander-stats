// Keep the saved URL unchanged. Match the provider boundary for image/source hosts.
export function safeArtworkUrl(value: string | null, source = false): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const allowed = source ? url.hostname === 'scryfall.com'
      : url.hostname === 'scryfall.io' || url.hostname.endsWith('.scryfall.io')
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && allowed) return value
  } catch { /* Missing or malformed saved imagery uses the same fallback. */ }
  return undefined
}
