import { navigationToken } from './navigationToken'
import { sameId } from './gamePresentation'

/** In-memory, single-tab handoffs after an acknowledged game save (#196) or invitation join (#200).
 * History state carries only an opaque token; nothing is persisted, so a reload
 * or another tab never restores a panel or repeats participants. Tokens confer
 * no permission: every destination still authorizes the group afresh. */
type Handoff = { kind: 'saved' | 'repeat' | 'joined'; userId: string; groupId: string; memberIds: string[] }
const handoffs = new Map<string, Handoff>()

export function offerHandoff(handoff: Handoff) {
  const token = navigationToken()
  handoffs.set(token, { ...handoff, memberIds: [...handoff.memberIds] })
  return token
}

export function readHandoff(token: unknown, kind: Handoff['kind'], userId: string, groupId: string) {
  const handoff = typeof token === 'string' ? handoffs.get(token) : undefined
  return handoff && handoff.kind === kind && sameId(handoff.userId, userId) && sameId(handoff.groupId, groupId) ? handoff.memberIds : undefined
}

export function forgetHandoff(token: unknown) {
  if (typeof token === 'string') handoffs.delete(token)
}

export function forgetAllHandoffs() {
  handoffs.clear()
}

export const handoffToken = (state: unknown, key: 'gameSaved' | 'repeatGame' | 'groupJoined') =>
  typeof state === 'object' && state !== null && key in state ? (state as Record<string, unknown>)[key] : undefined
