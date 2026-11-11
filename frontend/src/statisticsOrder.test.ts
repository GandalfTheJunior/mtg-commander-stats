import { expect, test } from 'vitest'
import { defaultDecks, defaultPlayers, rankedColors, sectionGames, spotlightPlayers, teaserSection } from './statisticsOrder'
import type { ManaStatistics } from './api'

test('ranks exact rates before participation ties and canonical order, with missing data last', () => {
  const rows: ManaStatistics[] = [
    { color: 'W', games: 30001, wins: 10000, winRatePercent: 33.33 },
    { color: 'U', games: 3, wins: 1, winRatePercent: 33.33 },
    { color: 'B', games: 6, wins: 2, winRatePercent: 33.33 },
    { color: 'R', games: 6, wins: 2, winRatePercent: 33.33 },
    { color: 'G', games: 0, wins: 0, winRatePercent: null },
    { color: 'C', games: 1, wins: 0, winRatePercent: 0 },
  ]
  expect(rankedColors(rows).map(row => row.color)).toEqual(['B', 'R', 'U', 'W', 'C', 'G'])
  expect(rows[0].color).toBe('W')
})

const seat = (startPosition: number, games: number, wins = 0) => ({ startPosition, games, wins, winRatePercent: games ? 100 * wins / games : null })

test('teaser table size is the most observed one, preferring the larger size on ties and never inventing a section', () => {
  const section = (playerCount: 2 | 3 | 4 | 5 | 6, games: number) => ({ playerCount, seats: Array.from({ length: playerCount }, (_, i) => seat(i + 1, games)) })
  expect(teaserSection([section(2, 0), section(3, 7), section(4, 7), section(5, 2), section(6, 0)])?.playerCount).toBe(4)
  expect(teaserSection([section(3, 9), section(4, 7)])?.playerCount).toBe(3)
  expect(teaserSection([section(2, 0), section(3, 0)])).toBeNull()
  expect(sectionGames({ playerCount: 4, seats: [seat(1, 5), seat(2, 5), seat(3, 5), seat(4, 0)] })).toBe(5)
})

test('deck default order uses exact win ratios, then more games, then stable IDs without a sample gate', () => {
  const deck = (id: number, games: number, wins: number) => ({ deckId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, ownerUserId: '', ownerUsername: 'A', name: 'D',
    commanders: [], archived: false, games, wins, winRatePercent: Math.round(10000 * wins / games) / 100 })
  const ordered = defaultDecks([deck(3, 3, 1), deck(2, 30001, 10000), deck(1, 1, 1), deck(5, 6, 2), deck(4, 6, 2)])
  expect(ordered.map(row => Number(row.deckId.slice(-3)))).toEqual([1, 4, 5, 3, 2])
})

test('player default order ranks most games, then localized display name, then UUID', () => {
  const player = (id: number, username: string, games: number, deleted?: number) => ({ userId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, username, games, wins: 0, winRatePercent: 0,
    ...(deleted ? { deleted: true, deletedNumber: deleted } : {}) })
  const ordered = spotlightPlayers([player(4, 'Zed', 9), player(3, 'Deleted profile', 9, 1), player(2, 'Bea', 9), player(1, 'Bea', 9), player(5, 'Ada', 20)])
  expect(ordered.map(row => Number(row.userId.slice(-1)))).toEqual([5, 1, 2])
  expect(defaultPlayers([player(3, 'Deleted profile', 9, 1), player(4, 'Zed', 9)]).map(row => row.userId.slice(-1))).toEqual(['3', '4'])
})
