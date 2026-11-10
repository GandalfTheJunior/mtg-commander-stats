import { expect, test } from 'vitest'
import { isProtectedPath, isPublicPath, returnDestination } from './appRoutes'

const group = '11111111-1111-4111-8111-111111111111'
const game = '22222222-2222-4222-8222-222222222222'
const member = '33333333-3333-4333-8333-333333333333'
const protectedRoutes = [
  '/dashboard', '/playgroups', '/decks', '/decks/new', `/decks/${game}/edit`,
  `/playgroups/${group}`, `/playgroups/${group}/games`, `/playgroups/${group}/games/new`,
  `/playgroups/${group}/games/${game}`, `/playgroups/${group}/games/${game}/edit`,
  `/playgroups/${group}/statistics`, `/playgroups/${group}/statistics/reports`,
  ...['players', 'decks', 'starting-seats', 'mana-colors'].map(report => `/playgroups/${group}/statistics/reports/${report}`),
  `/playgroups/${group}/members`, `/playgroups/${group}/members/${member}/decks`,
  `/playgroups/${group}/members/${member}/decks/new`,
]
test.each(protectedRoutes)('accepts canonical protected path %s for exact login return', path => {
  expect(isProtectedPath(path)).toBe(true)
  expect(returnDestination(path)).toBe(path)
})
test.each(['/invite/a%2Fb', '/claim/token', '/invite/123'])('matches public path %s outside authentication gate', path => {
  expect(isPublicPath(path)).toBe(true)
  expect(isProtectedPath(path)).toBe(false)
  expect(returnDestination(path)).toBe(path)
})
test.each(['https://evil.example/steal', '//evil.example/steal', '/playgroups/x/invitation-code',
  '/playgroups/x?tab=members', '/claim', '/invite/a/b', '/playgroups/x/statistics/reports/builder',
  '/playgroups/x/games/new/edit'])('rejects unsafe or unsupported return path %s', path => {
  expect(returnDestination(path)).toBe('/dashboard')
})
