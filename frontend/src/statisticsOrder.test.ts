import { expect, test } from 'vitest'
import { rankedColors } from './statisticsOrder'
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
