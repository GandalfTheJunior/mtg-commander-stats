import type { DeckStatistics, GroupStatistics, ManaStatistics, PlayerStatistics, StatisticsCounts } from './api'

export type SortDirection = 'ascending' | 'descending'
export type PlayerColumn = 'name' | 'games' | 'wins' | 'winRate'
export type DeckColumn = 'name' | 'owner' | 'games' | 'wins' | 'winRate'
export type ReportSort<Column extends string> = { column: Column; direction: SortDirection }

const names = new Intl.Collator('en', { sensitivity: 'accent' })
const ids = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase())
const deletedLabel = (number: number | null | undefined) => `Gelöschtes Profil ${number ?? ''}`.trim()

/** Localized display name; anonymized profiles use the API's stable per-group number. */
export const playerLabel = (player: PlayerStatistics) => player.deleted ? deletedLabel(player.deletedNumber) : player.username
export const ownerLabel = (deck: DeckStatistics) => deck.ownerDeleted ? deletedLabel(deck.ownerDeletedNumber) : deck.ownerUsername

/** Ascending comparison of actual unrounded win ratios; exact for large counts. */
function compareRate(a: { games: number; wins: number }, b: { games: number; wins: number }) {
  const difference = BigInt(a.wins) * BigInt(b.games) - BigInt(b.wins) * BigInt(a.games)
  return difference > 0n ? 1 : difference < 0n ? -1 : 0
}

// #197 default player order: most games, then display name, then stable UUID.
export function defaultPlayers(players: PlayerStatistics[]) {
  return players.toSorted((a, b) => b.games - a.games || names.compare(playerLabel(a), playerLabel(b)) || ids(a.userId, b.userId))
}
// Shared player selection for the #197 teaser and #193 spotlight; no sample-size gate.
export const spotlightPlayers = (players: GroupStatistics['players']) => defaultPlayers(players).slice(0, 3)

// #197 default deck order: highest win rate, then more games, then stable deck UUID.
export function defaultDecks(decks: DeckStatistics[]) {
  return decks.toSorted((a, b) => compareRate(b, a) || b.games - a.games || ids(a.deckId, b.deckId))
}
export const teaserDecks = (decks: DeckStatistics[]) => defaultDecks(decks).slice(0, 3)

const counts = {
  games: (a: StatisticsCounts, b: StatisticsCounts) => a.games - b.games,
  wins: (a: StatisticsCounts, b: StatisticsCounts) => a.wins - b.wins,
  winRate: (a: { games: number; wins: number }, b: { games: number; wins: number }) => compareRate(a, b),
}
/** Stable sort over the default order, so ties keep the default ranking in both directions. */
function sortBy<Row>(rows: Row[], compare: (a: Row, b: Row) => number, direction: SortDirection) {
  return rows.toSorted((a, b) => direction === 'ascending' ? compare(a, b) : compare(b, a))
}
export function sortPlayers(players: PlayerStatistics[], sort: ReportSort<PlayerColumn>) {
  const compare = sort.column === 'name' ? (a: PlayerStatistics, b: PlayerStatistics) => names.compare(playerLabel(a), playerLabel(b)) : counts[sort.column]
  return sortBy(defaultPlayers(players), compare, sort.direction)
}
export function sortDecks(decks: DeckStatistics[], sort: ReportSort<DeckColumn>) {
  // Deck-name sorting uses the saved deck name even though Commanders are the visual title.
  const compare = sort.column === 'name' ? (a: DeckStatistics, b: DeckStatistics) => names.compare(a.name, b.name)
    : sort.column === 'owner' ? (a: DeckStatistics, b: DeckStatistics) => names.compare(ownerLabel(a), ownerLabel(b)) : counts[sort.column]
  return sortBy(defaultDecks(decks), compare, sort.direction)
}

/** IDs of visible rows whose displayed identity collides with another visible row. */
function collisions<Row>(rows: Row[], id: (row: Row) => string, identity: (row: Row) => string) {
  const seen = new Map<string, number>()
  for (const row of rows) seen.set(identity(row), (seen.get(identity(row)) ?? 0) + 1)
  return new Set(rows.filter(row => seen.get(identity(row))! > 1).map(id))
}
export const ambiguousPlayers = (players: PlayerStatistics[]) => collisions(players, row => row.userId, playerLabel)
export const deckIdentity = (deck: DeckStatistics) => JSON.stringify([deck.commanders.map(commander => commander.name), deck.name, ownerLabel(deck)])
/** Shortest UUID tail distinguishing an ID from colliding peers (at least four characters). */
export function distinctSuffix(id: string, peers: string[]) {
  const others = peers.filter(peer => peer.toLowerCase() !== id.toLowerCase())
  let length = 4
  while (length < id.length && others.some(peer => peer.slice(-length).toLowerCase() === id.slice(-length).toLowerCase())) length++
  return id.slice(-length)
}
export const ambiguousDecks = (decks: DeckStatistics[]) => collisions(decks, row => row.deckId, deckIdentity)

type Section = GroupStatistics['startPositions'][number]
/** Games of one table size with recorded starting seats; every such game contains seat 1…N. */
export const sectionGames = (section: Section) => Math.max(0, ...section.seats.map(seat => seat.games))
export const observedSections = (sections: Section[]) => sections.filter(section => sectionGames(section) > 0)
/** Most frequent observed table size; ties prefer the larger table. Never pools sizes. */
export function teaserSection(sections: Section[]) {
  return observedSections(sections).toSorted((a, b) => sectionGames(b) - sectionGames(a) || b.playerCount - a.playerCount)[0] ?? null
}

const colors = ['W', 'U', 'B', 'R', 'G', 'C']
export function rankedColors(rows: ManaStatistics[]) {
  return rows.toSorted((a, b) => {
    if (a.games === 0 || b.games === 0) return (a.games === 0 ? 1 : 0) - (b.games === 0 ? 1 : 0) || colors.indexOf(a.color) - colors.indexOf(b.color)
    return compareRate(b, a) || b.games - a.games || colors.indexOf(a.color) - colors.indexOf(b.color)
  })
}
