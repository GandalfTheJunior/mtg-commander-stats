import { expect, test } from 'vitest'
import { manaColors, manaDataset, manaPercent, type ManaFilter } from './manaData'
import { rankedColors } from '../statisticsOrder'

test('all is the sum of discrete snapshots, each rate is derived and all categories remain', () => {
  for (const filter of ['all', '2', '3', '4', '5', '6'] as ManaFilter[]) {
    const rows = manaDataset(filter)
    expect(rows.map(r => r.color).sort()).toEqual([...manaColors].sort())
    expect(rows).toEqual(rankedColors(rows))
    for (const row of rows) {
      expect(row.wins).toBeLessThanOrEqual(row.games)
      expect(row.winRatePercent).toBe(row.games ? Math.round(row.wins / row.games * 10000) / 100 : null)
    }
  }
  for (const row of manaDataset('all')) {
    const parts = (['2', '3', '4', '5', '6'] as const).map(f => manaDataset(f).find(r => r.color === row.color)!)
    expect(row.games).toBe(parts.reduce((n, r) => n + r.games, 0))
    expect(row.wins).toBe(parts.reduce((n, r) => n + r.wins, 0))
  }
})
test('exact tied rates use games then canonical colors; measured zero precedes missing', () => {
  expect(manaDataset('6').map(r => r.color)).toEqual(['R', 'C', 'U', 'G', 'W', 'B'])
  expect(manaDataset('5').map(r => r.color)).toEqual(['B', 'G', 'U', 'C', 'R', 'W'])
  expect(manaPercent(16.67)).toBe('16,67 %')
  expect(manaPercent(0)).toBe('0 %')
})
