import type { GroupSummary } from './api'

// All identical display names use the same shortest distinguishing UUID prefix
// (#192): eight hex characters without hyphens, extended until unique. Unique
// names get no suffix. Full IDs remain the keys and navigation targets; list
// order is never changed.
export function displaySuffixes(items: { id: string; name: string }[]) {
  const names = new Map<string, { id: string; name: string }[]>()
  for (const item of items) names.set(item.name, [...(names.get(item.name) ?? []), item])
  const suffixes = new Map<string, string>()
  for (const peers of names.values()) {
    if (peers.length < 2) continue
    const ids = peers.map(item => item.id.replaceAll('-', ''))
    let length = 8
    while (length < 32 && new Set(ids.map(id => id.slice(0, length))).size < peers.length) length++
    peers.forEach((item, index) => suffixes.set(item.id, ids[index].slice(0, length)))
  }
  return suffixes
}

export const groupSuffixes = (groups: GroupSummary[]) => displaySuffixes(groups)
