import { checkedResponse, isRecord, isUuid, requestDefaults, unsafeRequest, uuidPattern } from '../../shared/http/client'
import { type Deck, deckFrom, type DeckInput, deckResponse } from '../decks/api'

export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type GroupSummary = { id: string; name: string; role: GroupRole }
export type GroupMember = { userId: string; username: string; role: GroupRole; quickProfile?: boolean }
export type GroupDetails = GroupSummary & { members: GroupMember[] }

function isRole(value: unknown): value is GroupRole {
  return value === 'OWNER' || value === 'ADMIN' || value === 'MEMBER'
}

function groupFrom(value: unknown): GroupSummary {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuidPattern.test(value.id) ||
    typeof value.name !== 'string' || !value.name || !isRole(value.role)) {
    throw new Error('The server returned an invalid group response.')
  }
  return { id: value.id, name: value.name, role: value.role }
}

async function groupResponse(response: Response, status: number, fallback: string) {
  return groupFrom(await (await checkedResponse(response, status, fallback)).json())
}

export async function listGroups(signal?: AbortSignal): Promise<GroupSummary[]> {
  const response = await checkedResponse(
    await fetch('/api/groups', { ...requestDefaults, ...(signal ? { signal } : {}) }), 200, 'Could not load your groups.',
  )
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned an invalid group list.')
  // Stable group IDs also make repeated joins idempotent in the browser.
  return [...new Map(body.map((value) => {
    const group = groupFrom(value)
    return [group.id, group] as const
  })).values()]
}

export async function createGroup(name: string, signal?: AbortSignal): Promise<GroupSummary> {
  return groupResponse(await unsafeRequest('POST', '/api/groups', { name }, signal), 201, 'Could not create the group.')
}

/** Explicit, authenticated, CSRF-protected redemption; the body is strictly `{ code }`. */
export async function joinGroup(code: string, signal?: AbortSignal): Promise<GroupSummary> {
  return groupResponse(await unsafeRequest('POST', '/api/groups/join', { code }, signal), 200, 'Could not join. Check that the invitation code is current and valid.')
}

/** Single-use invitation secrets (#187): exactly 22 URL-safe Base64 characters. */
export const invitationCodePattern = /^[A-Za-z0-9_-]{22}$/
export type Invitation = { code: string; expiresAt: string }

/** Issues a fresh, independent 24-hour invitation; never reuses an earlier one. */
export async function createInvitation(groupId: string, signal?: AbortSignal): Promise<Invitation> {
  const response = await checkedResponse(
    await unsafeRequest('POST', `/api/groups/${encodeURIComponent(groupId)}/invitations`, undefined, signal),
    201, 'Could not create the invitation.',
  )
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.code !== 'string' || !invitationCodePattern.test(body.code) ||
    typeof body.expiresAt !== 'string' || Number.isNaN(Date.parse(body.expiresAt))) {
    throw new Error('The server returned an invalid invitation.')
  }
  return { code: body.code, expiresAt: body.expiresAt }
}

/** Public, non-consuming preview. Sends no session cookie and keeps the token out of caches and referrers. */
export async function previewInvitation(code: string, signal?: AbortSignal): Promise<{ groupName: string }> {
  const response = await checkedResponse(await fetch(`/api/invitations/${encodeURIComponent(code)}`, {
    credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', ...(signal ? { signal } : {}),
  }), 200, 'Could not load the invitation.')
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.groupName !== 'string' || !body.groupName) {
    throw new Error('The server returned an invalid invitation preview.')
  }
  return { groupName: body.groupName }
}

export async function getGroup(id: string, signal?: AbortSignal): Promise<GroupDetails> {
  const response = await checkedResponse(
    await fetch(`/api/groups/${encodeURIComponent(id)}`, { ...requestDefaults, ...(signal ? { signal } : {}) }), 200, 'Could not load group details.',
  )
  const body: unknown = await response.json()
  const group = groupFrom(body)
  if (!isRecord(body) || !Array.isArray(body.members) || group.id.toLowerCase() !== id.toLowerCase()) {
    throw new Error('The server returned invalid group details.')
  }
  const members = body.members.map(memberFrom)
  if (new Set(members.map((member) => member.userId)).size !== members.length) {
    throw new Error('The server returned duplicate group members.')
  }
  return { ...group, members }
}

function memberFrom(member: unknown): GroupMember {
  if (!isRecord(member) || typeof member.userId !== 'string' || !uuidPattern.test(member.userId) ||
    typeof member.username !== 'string' || !member.username || !isRole(member.role) ||
    ('quickProfile' in member && typeof member.quickProfile !== 'boolean')) {
    throw new Error('The server returned an invalid group member.')
  }
  return { userId: member.userId, username: member.username, role: member.role, ...(member.quickProfile === true ? { quickProfile: true } : {}) }
}

/** The server generates the playful name and stores the profile immediately (#223). */
export async function createQuickProfile(groupId: string, signal?: AbortSignal): Promise<GroupMember> {
  const response = await checkedResponse(await unsafeRequest('POST', `/api/groups/${encodeURIComponent(groupId)}/quick-profiles`, undefined, signal),
    201, 'Das Schnellprofil konnte nicht erstellt werden.')
  const profile = memberFrom(await response.json())
  if (!profile.quickProfile) throw new Error('The server returned an invalid quick profile.')
  return profile
}

const groupPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}`
const quickProfilePath = (groupId: string, userId: string) => `${groupPath(groupId)}/quick-profiles/${encodeURIComponent(userId)}`

/** Renames a quick profile; 409 carries `QUICK_PROFILE_NAME_TAKEN` (#223). */
export async function renameQuickProfile(groupId: string, userId: string, name: string, signal?: AbortSignal): Promise<GroupMember> {
  const response = await checkedResponse(await unsafeRequest('PATCH', quickProfilePath(groupId, userId), { name }, signal),
    200, 'Das Schnellprofil konnte nicht umbenannt werden.')
  const profile = memberFrom(await response.json())
  if (!profile.quickProfile || profile.userId.toLowerCase() !== userId.toLowerCase()) throw new Error('The server returned an invalid quick profile.')
  return profile
}

export async function deleteQuickProfile(groupId: string, userId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', quickProfilePath(groupId, userId), undefined, signal), 204, 'Das Schnellprofil konnte nicht gelöscht werden.')
}

/** OWNER-only promotion/demotion of a registered member (#185). */
export async function changeMemberRole(groupId: string, userId: string, role: 'ADMIN' | 'MEMBER', signal?: AbortSignal): Promise<GroupMember> {
  const response = await checkedResponse(await unsafeRequest('PATCH', `${groupPath(groupId)}/members/${encodeURIComponent(userId)}/role`, { role }, signal),
    200, 'Die Rolle konnte nicht geändert werden.')
  const member = memberFrom(await response.json())
  if (member.userId.toLowerCase() !== userId.toLowerCase() || member.role !== role) throw new Error('The server did not confirm the role change.')
  return member
}

export async function removeMember(groupId: string, userId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `${groupPath(groupId)}/members/${encodeURIComponent(userId)}`, undefined, signal), 204, 'Das Mitglied konnte nicht entfernt werden.')
}

export type TransferState = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
export type OwnershipTransfer = {
  id: string; groupId: string; requesterId: string; requesterUsername: string
  targetUserId: string; targetUsername: string; state: TransferState
}
const transferPath = (groupId: string) => `${groupPath(groupId)}/ownership-transfer`

function transferFrom(value: unknown, groupId: string): OwnershipTransfer {
  if (!isRecord(value) || !isUuid(value.id) || !isUuid(value.groupId) || value.groupId.toLowerCase() !== groupId.toLowerCase() ||
    !isUuid(value.requesterId) || !isUuid(value.targetUserId) || typeof value.requesterUsername !== 'string' || !value.requesterUsername ||
    typeof value.targetUsername !== 'string' || !value.targetUsername ||
    !['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'].includes(value.state as string)) {
    throw new Error('The server returned an invalid ownership transfer.')
  }
  return { id: value.id, groupId: value.groupId, requesterId: value.requesterId, requesterUsername: value.requesterUsername,
    targetUserId: value.targetUserId, targetUsername: value.targetUsername, state: value.state as TransferState }
}

/** Pending request visible to the current OWNER or its named ADMIN; `null` when none is visible (404). */
export async function getOwnershipTransfer(groupId: string, signal?: AbortSignal): Promise<OwnershipTransfer | null> {
  const response = await fetch(transferPath(groupId), { ...requestDefaults, cache: 'no-store', ...(signal ? { signal } : {}) })
  if (response.status === 404) return null
  const transfer = transferFrom(await (await checkedResponse(response, 200, 'Der Status der Eigentümerübertragung konnte nicht geladen werden.')).json(), groupId)
  if (transfer.state !== 'PENDING') throw new Error('The server returned a resolved transfer as pending.')
  return transfer
}

export async function offerOwnership(groupId: string, targetUserId: string, signal?: AbortSignal): Promise<OwnershipTransfer> {
  const transfer = transferFrom(await (await checkedResponse(await unsafeRequest('POST', transferPath(groupId), { targetUserId }, signal),
    201, 'Das Angebot konnte nicht gesendet werden.')).json(), groupId)
  if (transfer.state !== 'PENDING' || transfer.targetUserId.toLowerCase() !== targetUserId.toLowerCase()) throw new Error('The server did not confirm the offer.')
  return transfer
}

async function respondToTransfer(groupId: string, requestId: string, answer: 'accept' | 'decline', signal?: AbortSignal) {
  const transfer = transferFrom(await (await checkedResponse(await unsafeRequest('POST', `${transferPath(groupId)}/${answer}`, { requestId }, signal),
    200, 'Die Antwort konnte nicht bestätigt werden.')).json(), groupId)
  if (transfer.id.toLowerCase() !== requestId.toLowerCase() || transfer.state !== (answer === 'accept' ? 'ACCEPTED' : 'DECLINED')) {
    throw new Error('The server did not confirm the response.')
  }
  return transfer
}
export const acceptOwnership = (groupId: string, requestId: string, signal?: AbortSignal) => respondToTransfer(groupId, requestId, 'accept', signal)
export const declineOwnership = (groupId: string, requestId: string, signal?: AbortSignal) => respondToTransfer(groupId, requestId, 'decline', signal)

export async function withdrawOwnership(groupId: string, requestId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', transferPath(groupId), { requestId }, signal), 204, 'Die Anfrage konnte nicht zurückgezogen werden.')
}

/** Up to 20 unacknowledged ACCEPTED/DECLINED outcomes for the original requester; GET never consumes them. */
export async function listOwnershipNotices(groupId: string, signal?: AbortSignal): Promise<OwnershipTransfer[]> {
  const response = await checkedResponse(await fetch(`${transferPath(groupId)}/notices`, { ...requestDefaults, cache: 'no-store', ...(signal ? { signal } : {}) }),
    200, 'Could not load ownership notices.')
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned invalid ownership notices.')
  return body.map(value => transferFrom(value, groupId)).filter(notice => notice.state === 'ACCEPTED' || notice.state === 'DECLINED')
}

export async function acknowledgeOwnershipNotice(groupId: string, noticeId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('POST', `${transferPath(groupId)}/notices/${encodeURIComponent(noticeId)}/acknowledge`, undefined, signal),
    204, 'Could not acknowledge the ownership notice.')
}

const quickProfileDecksPath = (groupId: string, userId: string) =>
  `/api/groups/${encodeURIComponent(groupId)}/quick-profiles/${encodeURIComponent(userId)}/decks`

export async function listQuickProfileDecks(groupId: string, userId: string, signal?: AbortSignal): Promise<Deck[]> {
  const response = await checkedResponse(await fetch(quickProfileDecksPath(groupId, userId), { ...requestDefaults, ...(signal ? { signal } : {}) }),
    200, 'Could not load the quick profile decks.')
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned an invalid deck list.')
  return body.map(deckFrom)
}

export async function createQuickProfileDeck(groupId: string, userId: string, input: DeckInput, signal?: AbortSignal, idempotencyKey?: string): Promise<Deck> {
  const response = await unsafeRequest('POST', quickProfileDecksPath(groupId, userId), input, signal, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
  return deckResponse(response, 'Could not create the deck.', idempotencyKey && response.status === 200 ? 200 : 201)
}

export async function leaveGroup(id: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `/api/groups/${encodeURIComponent(id)}/membership`, undefined, signal), 204, 'Could not leave the group.')
}
