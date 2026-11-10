import type { GroupStatistics, ManaStatistics } from './api'

// Shared player selection specified by #197; no additional sample-size gate.
export function spotlightPlayers(players: GroupStatistics['players']) {
  const names = new Intl.Collator('en', { sensitivity: 'accent' })
  return players.toSorted((a, b) => b.games - a.games || names.compare(a.username, b.username) ||
    a.userId.toLowerCase().localeCompare(b.userId.toLowerCase())).slice(0, 3)
}
const colors = ['W', 'U', 'B', 'R', 'G', 'C']
export function rankedColors(rows: ManaStatistics[]) {
  return rows.toSorted((a, b) => {
    if (a.games === 0 || b.games === 0) return (a.games === 0 ? 1 : 0) - (b.games === 0 ? 1 : 0) || colors.indexOf(a.color) - colors.indexOf(b.color)
    // Exact cross-products avoid rounding ties and precision loss for large counts.
    const difference = BigInt(b.wins) * BigInt(a.games) - BigInt(a.wins) * BigInt(b.games)
    return (difference > 0n ? 1 : difference < 0n ? -1 : 0) || b.games - a.games || colors.indexOf(a.color) - colors.indexOf(b.color)
  })
}
