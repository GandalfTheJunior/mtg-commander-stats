export type CurrentUser = {
  id: string
  username: string
}

export const magicColors = ['W', 'U', 'B', 'R', 'G'] as const
export type MagicColor = (typeof magicColors)[number]

export type Deck = {
  id: string
  name: string
  commander: string
  colorIdentity: MagicColor[]
}

export type DeckInput = Omit<Deck, 'id'>

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type CsrfToken = {
  headerName: string
  token: string
}

type Registration = {
  email: string
  username: string
  password: string
}

type Credentials = {
  email: string
  password: string
}

const requestDefaults = {
  credentials: 'same-origin' as const,
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const problem: unknown = await response.json()
    if (
      typeof problem === 'object' &&
      problem !== null &&
      'detail' in problem &&
      typeof problem.detail === 'string'
    ) {
      return problem.detail
    }
  } catch {
    // Use the stable, operation-specific fallback for non-JSON responses.
  }
  return fallback
}

async function currentUserFrom(response: Response): Promise<CurrentUser> {
  const user: unknown = await response.json()
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('username' in user) ||
    typeof user.username !== 'string'
  ) {
    throw new Error('The server returned an invalid user response.')
  }
  return { id: user.id, username: user.username }
}

function deckFrom(value: unknown): Deck {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('commander' in value) ||
    typeof value.commander !== 'string' ||
    !('colorIdentity' in value) ||
    !Array.isArray(value.colorIdentity) ||
    !value.colorIdentity.every((color) =>
      magicColors.includes(color as MagicColor),
    )
  ) {
    throw new Error('The server returned an invalid deck response.')
  }
  return {
    id: value.id,
    name: value.name,
    commander: value.commander,
    colorIdentity: value.colorIdentity as MagicColor[],
  }
}

async function deckResponse(response: Response, fallback: string): Promise<Deck> {
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, fallback), response.status)
  }
  return deckFrom(await response.json())
}

export async function restoreSession(): Promise<CurrentUser | null> {
  const response = await fetch('/api/me', requestDefaults)
  if (response.status === 401) return null
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not check your session.'))
  }
  return currentUserFrom(response)
}

export async function registerUser(registration: Registration) {
  const response = await fetch('/api/users', {
    ...requestDefaults,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration),
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Registration failed.'))
  }
  return currentUserFrom(response)
}

async function getCsrf(): Promise<CsrfToken> {
  const response = await fetch('/api/csrf', requestDefaults)
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not prepare login.'), response.status)
  }
  const csrf: unknown = await response.json()
  if (
    typeof csrf !== 'object' ||
    csrf === null ||
    !('headerName' in csrf) ||
    typeof csrf.headerName !== 'string' ||
    !('token' in csrf) ||
    typeof csrf.token !== 'string'
  ) {
    throw new Error('The server returned an invalid CSRF response.')
  }
  return { headerName: csrf.headerName, token: csrf.token }
}

async function unsafeRequest(method: 'POST' | 'PUT' | 'DELETE', path: string, input?: object) {
  const csrf = await getCsrf()
  return fetch(path, {
    ...requestDefaults,
    method,
    headers: {
      ...(input ? { 'Content-Type': 'application/json' } : {}),
      [csrf.headerName]: csrf.token,
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  })
}

export async function login(
  credentials: Credentials,
  onSessionChanged: () => void,
): Promise<CurrentUser> {
  const csrf = await getCsrf()
  const response = await fetch('/api/session', {
    ...requestDefaults,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(credentials),
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Login failed.'))
  }

  // The server-side identity changed, so the previous client identity is no
  // longer authoritative while the rotated session is being verified.
  onSessionChanged()
  await getCsrf()
  const user = await restoreSession()
  if (user === null) throw new Error('The authenticated session could not be confirmed.')
  return user
}

export async function listDecks(): Promise<Deck[]> {
  const response = await fetch('/api/decks', requestDefaults)
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not load your decks.'), response.status)
  }
  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('The server returned an invalid deck list.')
  }
  return body.map(deckFrom)
}

export async function createDeck(input: DeckInput): Promise<Deck> {
  return deckResponse(await unsafeRequest('POST', '/api/decks', input), 'Could not create the deck.')
}

export async function updateDeck(id: string, input: DeckInput): Promise<Deck> {
  return deckResponse(
    await unsafeRequest('PUT', `/api/decks/${id}`, input),
    'Could not update the deck.',
  )
}

export async function deleteDeck(id: string): Promise<void> {
  const response = await unsafeRequest('DELETE', `/api/decks/${id}`)
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not delete the deck.'), response.status)
  }
}

export type GroupRole = 'OWNER' | 'MEMBER'
export type GroupSummary = { id: string; name: string; role: GroupRole }
export type GroupMember = { userId: string; username: string; role: GroupRole }
export type GroupDetails = GroupSummary & { members: GroupMember[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRole(value: unknown): value is GroupRole {
  return value === 'OWNER' || value === 'MEMBER'
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function groupFrom(value: unknown): GroupSummary {
  if (!isRecord(value) || typeof value.id !== 'string' || !uuidPattern.test(value.id) ||
    typeof value.name !== 'string' || !value.name || !isRole(value.role)) {
    throw new Error('The server returned an invalid group response.')
  }
  return { id: value.id, name: value.name, role: value.role }
}

async function checkedResponse(response: Response, status: number, fallback: string) {
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, fallback), response.status)
  }
  if (response.status !== status) throw new Error('The server returned an unexpected response.')
  return response
}

async function groupResponse(response: Response, status: number, fallback: string) {
  return groupFrom(await (await checkedResponse(response, status, fallback)).json())
}

export async function listGroups(): Promise<GroupSummary[]> {
  const response = await checkedResponse(
    await fetch('/api/groups', requestDefaults), 200, 'Could not load your groups.',
  )
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned an invalid group list.')
  // Stable group IDs also make repeated joins idempotent in the browser.
  return [...new Map(body.map((value) => {
    const group = groupFrom(value)
    return [group.id, group] as const
  })).values()]
}

export async function createGroup(name: string): Promise<GroupSummary> {
  return groupResponse(await unsafeRequest('POST', '/api/groups', { name }), 201, 'Could not create the group.')
}

export async function joinGroup(code: string): Promise<GroupSummary> {
  return groupResponse(await unsafeRequest('POST', '/api/groups/join', { code }), 200, 'Could not join. Check that the invitation code is current and valid.')
}

export async function getGroup(id: string): Promise<GroupDetails> {
  const response = await checkedResponse(
    await fetch(`/api/groups/${encodeURIComponent(id)}`, requestDefaults), 200, 'Could not load group details.',
  )
  const body: unknown = await response.json()
  const group = groupFrom(body)
  if (!isRecord(body) || !Array.isArray(body.members) || group.id !== id) {
    throw new Error('The server returned invalid group details.')
  }
  const members = body.members.map((member: unknown): GroupMember => {
    if (!isRecord(member) || typeof member.userId !== 'string' || !uuidPattern.test(member.userId) ||
      typeof member.username !== 'string' || !member.username || !isRole(member.role)) {
      throw new Error('The server returned an invalid group member.')
    }
    return { userId: member.userId, username: member.username, role: member.role }
  })
  if (new Set(members.map((member) => member.userId)).size !== members.length) {
    throw new Error('The server returned duplicate group members.')
  }
  return { ...group, members }
}

export async function getJoinCode(id: string, regenerate = false): Promise<string> {
  const path = `/api/groups/${encodeURIComponent(id)}/join-code`
  const response = await checkedResponse(
    regenerate ? await unsafeRequest('POST', path) : await fetch(path, { ...requestDefaults, cache: 'no-store' }),
    200, regenerate ? 'Could not regenerate the invitation code.' : 'Could not load the invitation code.',
  )
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(body.code)) {
    throw new Error('The server returned an invalid invitation code.')
  }
  return body.code
}

export async function leaveGroup(id: string): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `/api/groups/${encodeURIComponent(id)}/membership`), 204, 'Could not leave the group.')
}

export async function logout(): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', '/api/session'), 204, 'Could not sign out.')
}
