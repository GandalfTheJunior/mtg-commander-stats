import type { ManaStatistics } from './api'
const colors = ['W', 'U', 'B', 'R', 'G', 'C']
export function rankedColors(rows: ManaStatistics[]) {
  return rows.toSorted((a, b) => {
    if (a.games === 0 || b.games === 0) return (a.games === 0 ? 1 : 0) - (b.games === 0 ? 1 : 0) || colors.indexOf(a.color) - colors.indexOf(b.color)
    // Exact cross-products avoid rounding ties and precision loss for large counts.
    const difference = BigInt(b.wins) * BigInt(a.games) - BigInt(a.wins) * BigInt(b.games)
    return (difference > 0n ? 1 : difference < 0n ? -1 : 0) || b.games - a.games || colors.indexOf(a.color) - colors.indexOf(b.color)
  })
}
