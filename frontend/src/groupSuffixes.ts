import type { GroupSummary } from './api'

// All identical display names use the same shortest distinguishing UUID prefix.
// Full IDs remain the keys and navigation targets; list order is never changed.
export function groupSuffixes(groups: GroupSummary[]) {
  const names = new Map<string, GroupSummary[]>()
  for (const group of groups) names.set(group.name, [...(names.get(group.name) ?? []), group])
  const suffixes = new Map<string, string>()
  for (const peers of names.values()) {
    if (peers.length < 2) continue
    const ids = peers.map(group => group.id.replaceAll('-', ''))
    let length = 8
    while (length < 32 && new Set(ids.map(id => id.slice(0, length))).size < peers.length) length++
    peers.forEach((group, index) => suffixes.set(group.id, ids[index].slice(0, length)))
  }
  return suffixes
}

