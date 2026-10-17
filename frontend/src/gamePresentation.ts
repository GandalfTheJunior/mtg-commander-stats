import type { Game, GroupDetails } from './api'

export const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
export const gameUrl = (groupId: string, gameId: string) => `/playgroups/${encodeURIComponent(groupId)}/games/${encodeURIComponent(gameId)}`
export const recordedTime = (game: Game) => new Date(game.recordedAt).toLocaleString('de-DE')
export const gameUnavailable = 'Dieses Spiel ist nicht verfügbar. Bitte prüfe den aktuellen Spielverlauf.'
export const mayManageGame = (group: GroupDetails, game: Game, actorId: string) => group.role === 'OWNER' || sameId(game.creatorId, actorId)

type Person = { userId: string; username: string }
// Use only response public names; identifiers disambiguate namesakes without emails.
export function publicName(person: Person, people: Person[]) {
  const peers = people.filter(other => other.username === person.username && !sameId(other.userId, person.userId))
  if (!peers.length) return person.username
  let length = 4
  while (length < person.userId.length && peers.some(other => other.userId.slice(-length).toLowerCase() === person.userId.slice(-length).toLowerCase())) length++
  return `${person.username} (…${person.userId.slice(-length)})`
}

export function gameSummary(game: Game) {
  const winner = game.participants.find(person => person.userId === game.winnerUserId)
  return winner ? `WIN — ${publicName(winner, game.participants)} · ${winner.deck.name}` : 'Unentschieden'
}
