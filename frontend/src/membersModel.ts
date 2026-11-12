import type { GroupMember, GroupRole } from './api'

export type MemberFilter = 'all' | 'registered' | 'quick'
export type MemberAction = 'promote' | 'demote' | 'transfer' | 'remove' | 'rename' | 'deck' | 'delete'
/** Directory presentation kept only in the Members history entry for Back restoration (#198). */
export type DirectoryMemory = { filter: MemberFilter; search: string; listScroll: number; pageScroll: number }

export const filters: { value: MemberFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'registered', label: 'Nur registrierte Nutzer' },
  { value: 'quick', label: 'Nur Schnellprofile' },
]
export const actionLabels: Record<MemberAction, string> = {
  promote: 'Zum Admin ernennen',
  demote: 'Zum Mitglied zurückstufen',
  transfer: 'Eigentümerschaft übertragen',
  remove: 'Aus Gruppe entfernen',
  rename: 'Schnellprofil umbenennen',
  deck: 'Deck erstellen',
  delete: 'Schnellprofil löschen',
}
/** Rows above which the search appears when layout cannot be measured (e.g. without CSS layout). */
export const fallbackOverflowRows = 8

export const roleLabel = (member: Pick<GroupMember, 'role' | 'quickProfile'>) =>
  member.quickProfile ? 'Schnellprofil' : member.role === 'OWNER' ? 'Owner' : member.role === 'ADMIN' ? 'Admin' : 'Mitglied'

/** The #198 permission matrix. The server stays authoritative; this only decides which affordances are offered. */
export function memberActions(viewerRole: GroupRole, viewerId: string, target: GroupMember, transferPending: boolean): MemberAction[] {
  if (target.quickProfile) return ['rename', 'deck', ...(viewerRole === 'MEMBER' ? [] : ['delete' as const])]
  if (target.userId.toLowerCase() === viewerId.toLowerCase()) return []
  if (viewerRole === 'OWNER') {
    if (target.role === 'MEMBER') return ['promote', 'remove']
    if (target.role === 'ADMIN') return ['demote', ...(transferPending ? [] : ['transfer' as const])]
  }
  if (viewerRole === 'ADMIN' && target.role === 'MEMBER') return ['remove']
  return []
}

export function directoryMemory(state: unknown): DirectoryMemory | null {
  const value = typeof state === 'object' && state !== null ? (state as Record<string, unknown>).membersDirectory : undefined
  if (typeof value !== 'object' || value === null) return null
  const memory = value as Record<string, unknown>
  const number = (field: unknown) => typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : 0
  return {
    filter: filters.some(option => option.value === memory.filter) ? memory.filter as MemberFilter : 'all',
    search: typeof memory.search === 'string' ? memory.search.slice(0, 100) : '',
    listScroll: number(memory.listScroll),
    pageScroll: number(memory.pageScroll),
  }
}

export const matchesFilter = (member: GroupMember, filter: MemberFilter) =>
  filter === 'all' || (filter === 'quick' ? Boolean(member.quickProfile) : !member.quickProfile)
export const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('de').trim()
export const blank = (value: string) => !value.trim()

