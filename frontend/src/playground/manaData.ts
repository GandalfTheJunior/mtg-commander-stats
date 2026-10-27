import type { ManaStatistics } from '../api'
import { rankedColors } from '../statisticsOrder'

export const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'] as const
export const manaNames = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün', C: 'Farblos' }
export type ManaFilter = 'all' | '2' | '3' | '4' | '5' | '6'
// Local synthetic aggregate snapshots, in WUBRGC order. All is their exact sum.
// Counts are deck/color appearances, not distinct matches (identities overlap).
const counts: Record<Exclude<ManaFilter, 'all'>, [number, number][]> = {
  '2': [[12, 8], [12, 3], [8, 4], [10, 7], [6, 2], [4, 0]],
  '3': [[15, 3], [12, 7], [12, 5], [9, 2], [12, 6], [0, 0]],
  '4': [[20, 7], [16, 9], [18, 4], [12, 3], [20, 8], [6, 1]],
  '5': [[10, 0], [8, 2], [12, 5], [8, 1], [12, 3], [4, 1]],
  '6': [[0, 0], [6, 1], [0, 0], [12, 4], [6, 0], [6, 2]],
}
export function manaDataset(filter: ManaFilter): ManaStatistics[] {
  return rankedColors(manaColors.map((color, i) => {
    const [games, wins] = filter === 'all'
      ? Object.values(counts).reduce(([g, w], rows) => [g + rows[i][0], w + rows[i][1]], [0, 0])
      : counts[filter][i]
    // Integer HALF_UP rounding to hundredths, matching the API for these counts.
    return { color, games, wins, winRatePercent: games ? Math.floor((wins * 10000 + games / 2) / games) / 100 : null }
  }))
}
const percentFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
export const manaPercent = (value: number) => `${percentFormat.format(value)} %`
