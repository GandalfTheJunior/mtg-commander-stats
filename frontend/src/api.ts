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
  everUsed: boolean
  archived: boolean
}

export type DeckInput = Pick<Deck, 'name' | 'commander' | 'colorIdentity'>

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
    !('everUsed' in value) || typeof value.everUsed !== 'boolean' ||
    !('archived' in value) || typeof value.archived !== 'boolean' ||
    !('colorIdentity' in value) ||
    !Array.isArray(value.colorIdentity) ||
    !value.colorIdentity.every((color) =>
      magicColors.includes(color as MagicColor),
    ) || value.colorIdentity.join('') !== canonicalColors(value.colorIdentity)
  ) {
    throw new Error('The server returned an invalid deck response.')
  }
  return {
    id: value.id,
    name: value.name,
    commander: value.commander,
    colorIdentity: value.colorIdentity as MagicColor[],
    everUsed: value.everUsed,
    archived: value.archived,
  }
}

async function deckResponse(response: Response, fallback: string, status: number): Promise<Deck> {
  return deckFrom(await (await checkedResponse(response, status, fallback)).json())
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

async function getCsrf(signal?: AbortSignal): Promise<CsrfToken> {
  const response = await fetch('/api/csrf', { ...requestDefaults, ...(signal ? { signal } : {}) })
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

async function unsafeRequest(method: 'POST' | 'PUT' | 'DELETE', path: string, input?: object, signal?: AbortSignal) {
  const csrf = await getCsrf(signal)
  signal?.throwIfAborted()
  return fetch(path, {
    ...requestDefaults,
    method,
    ...(signal ? { signal } : {}),
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

export async function logout(): Promise<void> {
  const response = await unsafeRequest('DELETE', '/api/session')
  if (response.status !== 204) {
    throw new ApiError('Logout could not be confirmed.', response.status)
  }
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
  return deckResponse(await unsafeRequest('POST', '/api/decks', input), 'Could not create the deck.', 201)
}

export async function updateDeck(id: string, input: DeckInput): Promise<Deck> {
  const deck = await deckResponse(
    await unsafeRequest('PUT', `/api/decks/${encodeURIComponent(id)}`, input),
    'Could not update the deck.', 200,
  )
  if (deck.id !== id) throw new Error('The server returned a different deck. Refresh your decks.')
  return deck
}

export async function deleteDeck(id: string): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `/api/decks/${encodeURIComponent(id)}`),
    204, 'Could not delete the deck.')
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

export async function getGroup(id: string, signal?: AbortSignal): Promise<GroupDetails> {
  const response = await checkedResponse(
    await fetch(`/api/groups/${encodeURIComponent(id)}`, { ...requestDefaults, ...(signal ? { signal } : {}) }), 200, 'Could not load group details.',
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

export async function archiveDeck(id: string): Promise<Deck> {
  const response = await checkedResponse(
    await unsafeRequest('POST', `/api/decks/${encodeURIComponent(id)}/archive`), 200, 'Could not archive the deck.',
  )
  const deck = deckFrom(await response.json())
  if (deck.id !== id || !deck.archived) throw new Error('The server did not confirm deck archival. Refresh your decks.')
  return deck
}

export type DeckSelection = Pick<Deck, 'id' | 'name' | 'commander' | 'colorIdentity'>
export type GameParticipant = {
  userId: string
  username: string
  deckId: string
  deck: DeckSelection & { archived: boolean }
}
export type Game = {
  id: string
  groupId: string
  creatorId: string
  recordedAt: string
  participants: GameParticipant[]
  result: 'WIN' | 'DRAW'
  winnerUserId: string | null
}
export type GameInput = Pick<Game, 'result' | 'winnerUserId'> & {
  participants: { userId: string; deckId: string }[]
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function canonicalColors(colors: unknown[]): string {
  return magicColors.filter((color) => colors.includes(color)).join('')
}

function selectionFrom(value: unknown): DeckSelection {
  if (!isRecord(value) || !isUuid(value.id) || typeof value.name !== 'string' || !value.name ||
    typeof value.commander !== 'string' || !value.commander || !Array.isArray(value.colorIdentity) ||
    value.colorIdentity.some((color) => !magicColors.includes(color as MagicColor)) ||
    value.colorIdentity.join('') !== canonicalColors(value.colorIdentity)) {
    throw new Error('The server returned invalid deck selection data.')
  }
  return { id: value.id, name: value.name, commander: value.commander, colorIdentity: value.colorIdentity as MagicColor[] }
}

function gameFrom(value: unknown, groupId: string, gameId?: string): Game {
  if (!isRecord(value) || !isUuid(value.id) || (gameId !== undefined && value.id !== gameId) ||
    value.groupId !== groupId || !isUuid(value.creatorId) || typeof value.recordedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value.recordedAt) ||
    !Number.isFinite(Date.parse(value.recordedAt)) || !Array.isArray(value.participants) ||
    value.participants.length < 2 || value.participants.length > 6 ||
    (value.result !== 'WIN' && value.result !== 'DRAW')) {
    throw new Error('The server returned invalid game data. Refresh games before continuing.')
  }
  const participants = value.participants.map((participant: unknown): GameParticipant => {
    if (!isRecord(participant) || !isUuid(participant.userId) || !isUuid(participant.deckId) ||
      typeof participant.username !== 'string' || !participant.username || !isRecord(participant.deck) ||
      typeof participant.deck.archived !== 'boolean') {
      throw new Error('The server returned an invalid game participant.')
    }
    const deck = selectionFrom(participant.deck)
    if (deck.id !== participant.deckId) throw new Error('The server returned mismatched game deck data.')
    return { userId: participant.userId, username: participant.username, deckId: deck.id,
      deck: { ...deck, archived: participant.deck.archived } }
  })
  const userIds = participants.map((participant) => participant.userId)
  if (new Set(userIds).size !== userIds.length ||
    (value.result === 'WIN' && (!isUuid(value.winnerUserId) || !userIds.includes(value.winnerUserId))) ||
    (value.result === 'DRAW' && value.winnerUserId !== null)) {
    throw new Error('The server returned an invalid game result.')
  }
  return { id: value.id, groupId, creatorId: value.creatorId, recordedAt: value.recordedAt,
    participants, result: value.result, winnerUserId: value.winnerUserId as string | null }
}

const gamesPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/games`

export async function listGames(groupId: string, signal?: AbortSignal): Promise<Game[]> {
  const response = await checkedResponse(
    await fetch(gamesPath(groupId), { ...requestDefaults, ...(signal ? { signal } : {}) }),
    200, 'Could not load game history.',
  )
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned an invalid game history.')
  const games = body.map((game) => gameFrom(game, groupId))
  if (new Set(games.map((game) => game.id)).size !== games.length) throw new Error('The server returned duplicate games.')
  return games
}

export async function saveGame(groupId: string, input: GameInput, gameId?: string, signal?: AbortSignal): Promise<Game> {
  // Construct the complete documented payload; identity and role are never writable.
  const payload: GameInput = { participants: input.participants.map(({ userId, deckId }) => ({ userId, deckId })),
    result: input.result, winnerUserId: input.winnerUserId }
  const response = await checkedResponse(
    await unsafeRequest(gameId ? 'PUT' : 'POST', gamesPath(groupId) + (gameId ? `/${encodeURIComponent(gameId)}` : ''), payload, signal),
    gameId ? 200 : 201, 'Could not save the game.',
  )
  return gameFrom(await response.json(), groupId, gameId)
}

export async function deleteGame(groupId: string, gameId: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `${gamesPath(groupId)}/${encodeURIComponent(gameId)}`, undefined, signal),
    204, 'Could not delete the game.')
}

export async function memberDecks(groupId: string, userId: string, signal?: AbortSignal): Promise<DeckSelection[]> {
  const response = await checkedResponse(await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/decks`,
    { ...requestDefaults, ...(signal ? { signal } : {}) },
  ), 200, 'Could not load eligible decks.')
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned an invalid deck selection list.')
  const decks = body.map(selectionFrom)
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length) throw new Error('The server returned duplicate decks.')
  return decks
}

export type PlayerStatistics = {
  userId: string
  username: string
  games: number
  wins: number
  winRatePercent: number
}
export type DeckStatistics = {
  deckId: string
  ownerUserId: string
  ownerUsername: string
  name: string
  commander: string
  archived: boolean
  games: number
  wins: number
  winRatePercent: number
}
export type GroupStatistics = { players: PlayerStatistics[]; decks: DeckStatistics[] }

function statisticsCounts(value: Record<string, unknown>) {
  const { games, wins, winRatePercent } = value
  if (typeof games !== 'number' || !Number.isSafeInteger(games) || games <= 0 ||
    typeof wins !== 'number' || !Number.isSafeInteger(wins) || wins < 0 || wins > games ||
    typeof winRatePercent !== 'number' || !Number.isFinite(winRatePercent) || winRatePercent < 0 || winRatePercent > 100) {
    throw new Error('The server returned invalid statistics counts.')
  }
  return { games, wins, winRatePercent }
}

export async function getGroupStatistics(groupId: string, signal?: AbortSignal): Promise<GroupStatistics> {
  const response = await checkedResponse(await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/statistics`,
    { ...requestDefaults, ...(signal ? { signal } : {}) },
  ), 200, 'Could not load statistics.')
  const body: unknown = await response.json()
  if (!isRecord(body) || !Array.isArray(body.players) || !Array.isArray(body.decks)) {
    throw new Error('The server returned invalid group statistics.')
  }
  const players = body.players.map((row: unknown): PlayerStatistics => {
    if (!isRecord(row) || !isUuid(row.userId) || typeof row.username !== 'string' || !row.username) {
      throw new Error('The server returned invalid player statistics.')
    }
    return { userId: row.userId, username: row.username, ...statisticsCounts(row) }
  })
  const decks = body.decks.map((row: unknown): DeckStatistics => {
    if (!isRecord(row) || !isUuid(row.deckId) || !isUuid(row.ownerUserId) ||
      typeof row.ownerUsername !== 'string' || !row.ownerUsername ||
      typeof row.name !== 'string' || !row.name ||
      typeof row.commander !== 'string' || !row.commander || typeof row.archived !== 'boolean') {
      throw new Error('The server returned invalid deck statistics.')
    }
    return { deckId: row.deckId, ownerUserId: row.ownerUserId, ownerUsername: row.ownerUsername,
      name: row.name, commander: row.commander, archived: row.archived, ...statisticsCounts(row) }
  })
  if (new Set(players.map((row) => row.userId.toLowerCase())).size !== players.length ||
    new Set(decks.map((row) => row.deckId.toLowerCase())).size !== decks.length) {
    throw new Error('The server returned duplicate statistics rows.')
  }
  return { players, decks }
}
