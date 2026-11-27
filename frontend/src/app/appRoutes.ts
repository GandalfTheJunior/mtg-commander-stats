// This allowlist also bounds destinations retained across authentication.
const id = '[^/?#]+'
const gameId = '(?!new(?:/|$))[^/?#]+'
const protectedPaths = [
  /^\/dashboard$/,
  /^\/playgroups$/,
  new RegExp(`^/decks(?:/new|/${id}/edit)?$`, 'i'),
  new RegExp(`^/playgroups/${id}(?:/(?:games(?:/new|/${gameId}(?:/edit)?)?|statistics(?:/reports(?:/(?:players|decks|starting-seats|mana-colors))?)?|members(?:/${id}/decks(?:/new)?)?))?$`, 'i'),
]
export const isProtectedPath = (path: string) => protectedPaths.some(pattern => pattern.test(path))
export const isPublicPath = (path: string) => /^\/(?:invite|claim)\/[^/?#]+$/.test(path)
export const returnDestination = (path: string) => isProtectedPath(path) || isPublicPath(path) ? path : '/dashboard'
