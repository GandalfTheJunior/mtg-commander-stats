import { checkedResponse, isRecord, requestDefaults, unsafeRequest } from '../../shared/http/client'
import { type Invitation, invitationCodePattern } from '../groups/api'

/** Quick-profile claim invitations (#224/#247): a one-hour, single-use secret managed by OWNER/ADMIN. */
export type ProfileInvitationStatus = { active: true; expiresAt: string } | { active: false; expiresAt: null }
const profileInvitationPath = (groupId: string, profileId: string) =>
  `/api/groups/${encodeURIComponent(groupId)}/quick-profiles/${encodeURIComponent(profileId)}/invitation`
const tokenRequest = { cache: 'no-store', referrerPolicy: 'no-referrer' } as const
const validInstant = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

/** Read-only status; the server never returns an existing code. */
export async function getProfileInvitation(groupId: string, profileId: string, signal?: AbortSignal): Promise<ProfileInvitationStatus> {
  const response = await checkedResponse(await fetch(profileInvitationPath(groupId, profileId), {
    ...requestDefaults, cache: 'no-store', ...(signal ? { signal } : {}),
  }), 200, 'Der Einladungsstatus konnte nicht geladen werden.')
  const body: unknown = await response.json()
  if (isRecord(body) && body.active === true && validInstant(body.expiresAt)) return { active: true, expiresAt: body.expiresAt }
  if (isRecord(body) && body.active === false && body.expiresAt === null) return { active: false, expiresAt: null }
  throw new Error('The server returned an invalid invitation status.')
}

/** Creates a new claim link and atomically revokes any previous one. The code is returned only here. */
export async function createProfileInvitation(groupId: string, profileId: string, signal?: AbortSignal): Promise<Invitation> {
  const response = await checkedResponse(await unsafeRequest('POST', profileInvitationPath(groupId, profileId), undefined, signal, {}, tokenRequest),
    201, 'Die Einladung konnte nicht erstellt werden.')
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.code !== 'string' || !invitationCodePattern.test(body.code) || !validInstant(body.expiresAt)) {
    throw new Error('The server returned an invalid invitation.')
  }
  return { code: body.code, expiresAt: body.expiresAt }
}

export async function revokeProfileInvitation(groupId: string, profileId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', profileInvitationPath(groupId, profileId), undefined, signal, {}, tokenRequest),
    204, 'Die Einladung konnte nicht widerrufen werden.')
}

export type ProfileClaimPreview = { groupName: string; profileName: string }
/** Public, non-consuming preview: no cookies, caches or referrer; only the two names are kept. */
export async function previewProfileInvitation(code: string, signal?: AbortSignal): Promise<ProfileClaimPreview> {
  const response = await checkedResponse(await fetch(`/api/profile-invitations/${encodeURIComponent(code)}`, {
    credentials: 'omit', ...tokenRequest, ...(signal ? { signal } : {}),
  }), 200, 'Die Einladung konnte nicht geladen werden.')
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.groupName !== 'string' || !body.groupName || typeof body.profileName !== 'string' || !body.profileName) {
    throw new Error('The server returned an invalid invitation preview.')
  }
  return { groupName: body.groupName, profileName: body.profileName }
}

/**
 * Explicit, authenticated and CSRF-protected merge; only 204 confirms it. `expectedAccountId` is the account the user
 * saw and confirmed: the server refuses any other session account with 409 `PROFILE_CLAIM_ACCOUNT_MISMATCH` before
 * reading the invitation (#247). Same-game conflict: 409 `PROFILE_CLAIM_SAME_GAME`.
 */
export async function acceptProfileInvitation(code: string, expectedAccountId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('POST', `/api/profile-invitations/${encodeURIComponent(code)}/accept`, { expectedAccountId }, signal, {}, tokenRequest),
    204, 'Die Übernahme konnte nicht bestätigt werden.')
}
export const profileClaimSameGame = 'PROFILE_CLAIM_SAME_GAME'
export const profileClaimAccountMismatch = 'PROFILE_CLAIM_ACCOUNT_MISMATCH'
