// Validate the raw spelling too: URL alone repairs whitespace, backslashes and dot segments.
// Return the original value so external navigation never rewrites a saved share link.
export function safeManaBoxUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value !== value.trim()
    || !/^https:\/\/manabox\.app(?::443)?\/decks\/[A-Za-z0-9_-]+\/?$/i.test(value)) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && url.hostname === 'manabox.app' && !url.port
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/decks\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return value
  } catch { /* Unexpected saved values must never become external links. */ }
  return undefined
}
