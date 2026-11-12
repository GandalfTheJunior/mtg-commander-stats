import type { GroupMember, GroupRole } from './api'
import { navigationToken } from './navigationToken'

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

/** In-memory directory memories (#198). History state carries only an opaque token; the presentation is bound to
 * the user and group that created it and is forgotten on every session change, so a reload, another tab or another
 * account never restores it. Tokens confer no permission: the roster is always freshly authorized. */
const memories = new Map<string, { userId: string; groupId: string; memory: DirectoryMemory }>()
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
const tokenOf = (state: unknown) => {
  const token = typeof state === 'object' && state !== null ? (state as Record<string, unknown>).membersDirectory : undefined
  return typeof token === 'string' ? token : undefined
}

export function offerDirectoryMemory(userId: string, groupId: string, memory: DirectoryMemory, previousState?: unknown) {
  const previous = tokenOf(previousState)
  if (previous) memories.delete(previous)
  const token = navigationToken()
  memories.set(token, { userId, groupId, memory: { ...memory } })
  return token
}

export function directoryMemory(state: unknown, userId: string, groupId: string): DirectoryMemory | null {
  const token = tokenOf(state)
  const entry = token ? memories.get(token) : undefined
  return entry && same(entry.userId, userId) && same(entry.groupId, groupId) ? { ...entry.memory } : null
}

export function forgetDirectoryMemories() {
  memories.clear()
}

/** Mirrors the server's display-name canonical form (NFC, boundary whitespace and Java controls stripped). */
export function canonicalName(value: string) {
  const characters = Array.from(value.normalize('NFC'))
  const boundary = (character: string) => /\p{White_Space}/u.test(character) ||
    (character.codePointAt(0)! >= 0x1c && character.codePointAt(0)! <= 0x1f)
  while (characters.length && boundary(characters[0])) characters.shift()
  while (characters.length && boundary(characters[characters.length - 1])) characters.pop()
  return characters.join('')
}

export const matchesFilter = (member: GroupMember, filter: MemberFilter) =>
  filter === 'all' || (filter === 'quick' ? Boolean(member.quickProfile) : !member.quickProfile)
export const normalized = (value: string) => value.normalize('NFC').toLocaleLowerCase('de').trim()
export const blank = (value: string) => !value.trim()

