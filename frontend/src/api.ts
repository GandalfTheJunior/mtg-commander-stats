import { gamePayload } from './gameOutcome'
export type CurrentUser = {
  id: string
  username: string
}

export const magicColors = ['W', 'U', 'B', 'R', 'G'] as const
export type MagicColor = (typeof magicColors)[number]

export type Deck = {
  id: string
  name: string
  commanders: SavedCommander[]
  colorIdentity: MagicColor[]
  everUsed: boolean
  archived: boolean
  manaBoxUrl: string | null
  companion?: SavedCompanion | null
  /** Persisted format; legacy responses without it are regular Commander decks. */
  format?: DeckFormat
}
export const deckFormats = ['COMMANDER', 'PAUPER_COMMANDER'] as const
export type DeckFormat = (typeof deckFormats)[number]
export type CompanionChoice = { selectionRef: CommanderSelectionRef; name: string; colorIdentity: MagicColor[]; thumbnailUrl: string | null }
/** Printing-local artwork selector accepted by atomic deck writes (#241). */
export type ArtworkSelection = { scryfallCardId: string; artworkFaceIndex?: number }

export type CommanderSelectionRef = { scryfallCardId: string; gameplayFaceIndex?: number }
export type PairingCapabilities = { roles: string[]; partnerWith: string[]; variants: string[] }
export type CommanderChoice = {
  pairing: PairingCapabilities;
  selectionRef: CommanderSelectionRef; scryfallCardId: string; name: string; colorIdentity: MagicColor[]
  requiresChosenColor: boolean; canBeSoleCommander: boolean; thumbnailUrl: string | null
}
export type CardFace = { faceIndex: number | null; name: string; typeLine: string | null; oracleText: string | null; imageUrl: string | null }
export type SavedCompanion = Pick<SavedCommander, 'oracleId' | 'name' | 'selectionRef' | 'scryfallCardId' | 'colorIdentity' | 'artworkFaceIndex' | 'artCropUrl' | 'illustrationId' | 'artist' | 'scryfallUri' | 'cardFaces'>
export type SavedCommander = Omit<CommanderChoice, 'thumbnailUrl'> & {
  cardFaces?: CardFace[] | null
  position: number; oracleId: string; chosenColor: MagicColor | null; effectiveColorIdentity: MagicColor[]
  artworkFaceIndex: number | null; artCropUrl: string | null; illustrationId: string | null; artist: string | null; scryfallUri: string | null
}
export type DeckInput = {
  name: string; manaBoxUrl?: string | null; format?: DeckFormat
  commanders?: { selectionRef: CommanderSelectionRef; chosenColor?: MagicColor; artwork?: ArtworkSelection }[]
  companion?: { selectionRef: CommanderSelectionRef; artwork?: ArtworkSelection } | null
}
export const commanderNames = (deck: { commanders: { name: string }[] }) => deck.commanders.map(card => card.name).join(' / ')
export const scryfallUnavailable = 'Scryfall is currently imprisoned in the moon… Please try again later.'


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
    commanders: commandersFrom('commanders' in value ? value.commanders : undefined),
    colorIdentity: value.colorIdentity as MagicColor[],
    everUsed: value.everUsed,
    archived: value.archived,
    ...('companion' in value ? { companion: companionFrom(value.companion) } : {}),
    manaBoxUrl: 'manaBoxUrl' in value && typeof value.manaBoxUrl === 'string' ? value.manaBoxUrl : null,
    ...('format' in value && value.format !== undefined ? { format: formatFrom(value.format) } : {}),
  }
}

function formatFrom(value: unknown): DeckFormat {
  if (!deckFormats.includes(value as DeckFormat)) throw new Error('The server returned an invalid deck format.')
  return value as DeckFormat
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

async function unsafeRequest(method: 'POST' | 'PUT' | 'DELETE', path: string, input?: object, signal?: AbortSignal, extraHeaders: Record<string, string> = {}) {
  const csrf = await getCsrf(signal)
  signal?.throwIfAborted()
  return fetch(path, {
    ...requestDefaults,
    method,
    ...(signal ? { signal } : {}),
    headers: {
      ...(input ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
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

export async function listDecks(signal?: AbortSignal): Promise<Deck[]> {
  const response = await fetch('/api/decks', { ...requestDefaults, ...(signal ? { signal } : {}) })
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not load your decks.'), response.status)
  }
  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('The server returned an invalid deck list.')
  }
  return body.map(deckFrom)
}

/** A keyed repeat returns 200 with the already created deck instead of creating another one. */
export async function createDeck(input: DeckInput, signal?: AbortSignal, idempotencyKey?: string): Promise<Deck> {
  const response = await unsafeRequest('POST', '/api/decks', input, signal, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
  return deckResponse(response, 'Could not create the deck.', idempotencyKey && response.status === 200 ? 200 : 201)
}

export async function updateDeck(id: string, input: DeckInput, signal?: AbortSignal): Promise<Deck> {
  const deck = await deckResponse(
    await unsafeRequest('PUT', `/api/decks/${encodeURIComponent(id)}`, input, signal),
    'Could not update the deck.', 200,
  )
  if (deck.id !== id) throw new Error('The server returned a different deck. Refresh your decks.')
  return deck
}

export async function deleteDeck(id: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `/api/decks/${encodeURIComponent(id)}`, undefined, signal),
    204, 'Could not delete the deck.')
}

export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type GroupSummary = { id: string; name: string; role: GroupRole }
export type GroupMember = { userId: string; username: string; role: GroupRole; quickProfile?: boolean }
export type GroupDetails = GroupSummary & { members: GroupMember[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRole(value: unknown): value is GroupRole {
  return value === 'OWNER' || value === 'ADMIN' || value === 'MEMBER'
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

export async function joinGroup(code: string, signal?: AbortSignal): Promise<GroupSummary> {
  return groupResponse(await unsafeRequest('POST', '/api/groups/join', { code }, signal), 200, 'Could not join. Check that the invitation code is current and valid.')
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

export async function getJoinCode(id: string, regenerate = false, signal?: AbortSignal): Promise<string> {
  const path = `/api/groups/${encodeURIComponent(id)}/join-code`
  const response = await checkedResponse(
    regenerate ? await unsafeRequest('POST', path, undefined, signal) : await fetch(path, { ...requestDefaults, cache: 'no-store', ...(signal ? { signal } : {}) }),
    200, regenerate ? 'Could not regenerate the invitation code.' : 'Could not load the invitation code.',
  )
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(body.code)) {
    throw new Error('The server returned an invalid invitation code.')
  }
  return body.code
}

export async function leaveGroup(id: string, signal?: AbortSignal): Promise<void> {
  await checkedResponse(await unsafeRequest('DELETE', `/api/groups/${encodeURIComponent(id)}/membership`, undefined, signal), 204, 'Could not leave the group.')
}

export async function archiveDeck(id: string, signal?: AbortSignal): Promise<Deck> {
  const response = await checkedResponse(
    await unsafeRequest('POST', `/api/decks/${encodeURIComponent(id)}/archive`, undefined, signal), 200, 'Could not archive the deck.',
  )
  const deck = deckFrom(await response.json())
  if (deck.id !== id || !deck.archived) throw new Error('The server did not confirm deck archival. Refresh your decks.')
  return deck
}

export type DeckSelection = Pick<Deck, 'id' | 'name' | 'commanders' | 'colorIdentity' | 'companion'>
export type GameParticipant = {
  startPosition: number
  placement: number | null
  stillInGame: boolean | null
  userId: string
  username: string
  deckId: string
  deck: DeckSelection & { archived: boolean; manaBoxUrl?: string | null }
}
export type Game = {
  id: string
  groupId: string
  creatorId: string
  recordedAt: string
  playedOn: string | null
  participants: GameParticipant[]
  result: 'WIN' | 'DRAW'
  alternateWinCon: boolean
  winnerUserId: string | null
}
export type GameInput = Pick<Game, 'result' | 'alternateWinCon'> & {
  /** Absent preserves a stored date on PUT; null explicitly records an unknown date. */
  playedOn?: string | null
  participants: { userId: string; deckId: string; startPosition: number; placement?: number; winner?: true; stillInGame?: boolean }[]
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function canonicalColors(colors: unknown[]): string {
  return magicColors.filter((color) => colors.includes(color)).join('')
}

function selectionFrom(value: unknown): DeckSelection {
  if (!isRecord(value) || !isUuid(value.id) || typeof value.name !== 'string' || !value.name ||
    !Array.isArray(value.colorIdentity) ||
    value.colorIdentity.some((color) => !magicColors.includes(color as MagicColor)) ||
    value.colorIdentity.join('') !== canonicalColors(value.colorIdentity)) {
    throw new Error('The server returned invalid deck selection data.')
  }
  return { id: value.id, name: value.name, commanders: commandersFrom(value.commanders), colorIdentity: value.colorIdentity as MagicColor[],
    ...('companion' in value ? { companion: companionFrom(value.companion) } : {}) }
}

function gameFrom(value: unknown, groupId: string, gameId?: string, includeManaBox = false): Game {
  if (!isRecord(value) || !isUuid(value.id) || (gameId !== undefined && value.id.toLowerCase() !== gameId.toLowerCase()) ||
    !isUuid(value.groupId) || value.groupId.toLowerCase() !== groupId.toLowerCase() || !isUuid(value.creatorId) || typeof value.recordedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value.recordedAt) ||
    !Number.isFinite(Date.parse(value.recordedAt)) || !playDate(value.playedOn) || !Array.isArray(value.participants) ||
    value.participants.length < 2 || value.participants.length > 6 ||
    (value.result !== 'WIN' && value.result !== 'DRAW') || typeof value.alternateWinCon !== 'boolean' || (value.result === 'DRAW' && value.alternateWinCon)) {
    throw new Error('The server returned invalid game data. Refresh games before continuing.')
  }
  const participantCount = value.participants.length
  const participants = value.participants.map((participant: unknown): GameParticipant => {
    if (!isRecord(participant) || !isUuid(participant.userId) || !isUuid(participant.deckId) ||
      typeof participant.username !== 'string' || !participant.username || !isRecord(participant.deck) ||
      typeof participant.deck.archived !== 'boolean' ||
      typeof participant.startPosition !== 'number' || !Number.isInteger(participant.startPosition) ||
      participant.startPosition < 1 || participant.startPosition > participantCount ||
      (typeof participant.stillInGame !== 'boolean' && !(value.result === 'WIN' && participant.userId !== value.winnerUserId && participant.stillInGame === null)) ||
      (value.result === 'DRAW' ? participant.placement !== null : participant.placement === null ? participant.userId === value.winnerUserId :
        typeof participant.placement !== 'number' || !Number.isInteger(participant.placement) ||
        participant.placement < 1 || participant.placement > participantCount)) {
      throw new Error('The server returned an invalid game participant.')
    }
    const deck = selectionFrom(participant.deck)
    if (deck.id !== participant.deckId) throw new Error('The server returned mismatched game deck data.')
    return { startPosition: participant.startPosition, placement: participant.placement as number | null, stillInGame: participant.stillInGame, userId: participant.userId, username: participant.username, deckId: deck.id,
      deck: { ...deck, archived: participant.deck.archived,
        ...(includeManaBox && typeof participant.deck.manaBoxUrl === 'string' ? { manaBoxUrl: participant.deck.manaBoxUrl } : {}) } }
  })
  const userIds = participants.map((participant) => participant.userId)
  if (new Set(participants.map(p => p.startPosition)).size !== participants.length || new Set(userIds).size !== userIds.length ||
    (value.result === 'WIN' && (!isUuid(value.winnerUserId) || !userIds.includes(value.winnerUserId))) ||
    (value.result === 'DRAW' && value.winnerUserId !== null)) {
    throw new Error('The server returned an invalid game result.')
  }
  return { id: value.id, groupId, creatorId: value.creatorId, recordedAt: value.recordedAt, playedOn: value.playedOn,
    participants, result: value.result, alternateWinCon: value.alternateWinCon, winnerUserId: value.winnerUserId as string | null }
}

const gamesPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/games`

export type GamePreview = Pick<Game, 'id' | 'groupId' | 'result' | 'winnerUserId'> & {
  playedOn: string | null
  participants: { userId: string; username: string; deck: DeckSelection }[]
}

function playDate(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// The bounded history endpoint owns date-first ordering, including unknown dates.
// Read only preview fields so legacy games without seats/ranks remain displayable.
export type GamesHistoryPage = { games: GamePreview[]; nextCursor: string | null }

export async function gamesHistoryPage(groupId: string, cursor?: string, signal?: AbortSignal): Promise<GamesHistoryPage> {
  const response = await checkedResponse(
    await fetch(`${gamesPath(groupId)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { ...requestDefaults, ...(signal ? { signal } : {}) }),
    200, 'Die letzten Spiele konnten nicht geladen werden.',
  )
  const body: unknown = await response.json()
  if (!isRecord(body) || !Array.isArray(body.games) || body.games.length > 20 ||
    !(body.nextCursor === null || (typeof body.nextCursor === 'string' && /^[A-Za-z0-9_-]+$/.test(body.nextCursor)))) {
    throw new Error('The server returned invalid game history.')
  }
  const games = body.games.map((value: unknown): GamePreview => {
    if (!isRecord(value) || !isUuid(value.id) || !isUuid(value.groupId) || value.groupId.toLowerCase() !== groupId.toLowerCase() ||
      !playDate(value.playedOn) || !Array.isArray(value.participants) || value.participants.length < 2 || value.participants.length > 6 ||
      (value.result !== 'WIN' && value.result !== 'DRAW')) throw new Error('The server returned invalid game preview data.')
    const participants = value.participants.map((person: unknown) => {
      if (!isRecord(person) || !isUuid(person.userId) || typeof person.username !== 'string' || !person.username.trim() ||
        !isUuid(person.deckId)) throw new Error('The server returned an invalid game participant.')
      const deck = selectionFrom(person.deck)
      if (deck.id.toLowerCase() !== person.deckId.toLowerCase()) throw new Error('The server returned mismatched game deck data.')
      return { userId: person.userId, username: person.username, deck }
    })
    if (new Set(participants.map(person => person.userId.toLowerCase())).size !== participants.length ||
      (value.result === 'DRAW' ? value.winnerUserId !== null :
        !isUuid(value.winnerUserId) || !participants.some(person => person.userId.toLowerCase() === String(value.winnerUserId).toLowerCase()))) {
      throw new Error('The server returned an invalid game result.')
    }
    return { id: value.id, groupId, playedOn: value.playedOn, result: value.result,
      winnerUserId: value.winnerUserId as string | null, participants }
  })
  if (new Set(games.map(game => game.id.toLowerCase())).size !== games.length) throw new Error('The server returned duplicate games.')
  if (body.nextCursor !== null && (games.length === 0 || body.nextCursor === cursor)) throw new Error('The server returned an invalid history cursor.')
  return { games, nextCursor: body.nextCursor as string | null }
}

export async function recentGames(groupId: string, signal?: AbortSignal): Promise<GamePreview[]> {
  return (await gamesHistoryPage(groupId, undefined, signal)).games.slice(0, 3)
}

export async function getGame(groupId: string, gameId: string, signal?: AbortSignal): Promise<Game> {
  const response = await checkedResponse(
    await fetch(`${gamesPath(groupId)}/${encodeURIComponent(gameId)}`, { ...requestDefaults, ...(signal ? { signal } : {}) }),
    200, 'Could not load game details.',
  )
  return gameFrom(await response.json(), groupId, gameId, true)
}

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
  const payload = gamePayload(input)
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
  deleted?: boolean
  deletedNumber?: number | null
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
  commanders: SavedCommander[]
  archived: boolean
  games: number
  wins: number
  winRatePercent: number
}
export type PlayerCount = 2 | 3 | 4 | 5 | 6
export type StatisticsCounts = { games: number; wins: number; winRatePercent: number | null }
export type ManaStatistics = StatisticsCounts & { color: MagicColor | 'C' }
export type SeatStatistics = StatisticsCounts & { startPosition: number }
export type GroupStatistics = {
  players: PlayerStatistics[]; decks: DeckStatistics[]
  startPositions: { playerCount: PlayerCount; seats: SeatStatistics[] }[]
  manaColors: ManaStatistics[]
}
function chartCounts(row: Record<string, unknown>): StatisticsCounts {
  if (row.games === 0 && row.wins === 0 && row.winRatePercent === null) return { games: 0, wins: 0, winRatePercent: null }
  return statisticsCounts(row)
}

function statisticsCounts(value: Record<string, unknown>) {
  const { games, wins, winRatePercent } = value
  if (typeof games !== 'number' || !Number.isSafeInteger(games) || games <= 0 ||
    typeof wins !== 'number' || !Number.isSafeInteger(wins) || wins < 0 || wins > games ||
    typeof winRatePercent !== 'number' || !Number.isFinite(winRatePercent) || winRatePercent < 0 || winRatePercent > 100) {
    throw new Error('The server returned invalid statistics counts.')
  }
  return { games, wins, winRatePercent }
}

export async function getGroupStatistics(groupId: string, signal?: AbortSignal, playerCount?: PlayerCount): Promise<GroupStatistics> {
  const response = await checkedResponse(await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/statistics${playerCount === undefined ? '' : `?playerCount=${playerCount}`}`,
    { ...requestDefaults, ...(signal ? { signal } : {}) },
  ), 200, 'Could not load statistics.')
  const body: unknown = await response.json()
  if (!isRecord(body) || !Array.isArray(body.players) || !Array.isArray(body.decks) || !Array.isArray(body.startPositions) || !Array.isArray(body.manaColors)) {
    throw new Error('The server returned invalid group statistics.')
  }
  const players = body.players.map((row: unknown): PlayerStatistics => {
    if (!isRecord(row) || !isUuid(row.userId) || typeof row.username !== 'string' || !row.username) {
      throw new Error('The server returned invalid player statistics.')
    }
    if (row.deleted !== undefined && typeof row.deleted !== 'boolean' ||
      row.deleted === true && (typeof row.deletedNumber !== 'number' || !Number.isSafeInteger(row.deletedNumber) || row.deletedNumber < 1) ||
      row.deleted !== true && row.deletedNumber !== undefined && row.deletedNumber !== null) {
      throw new Error('The server returned invalid deleted profile metadata.')
    }
    return { userId: row.userId, username: row.username,
      ...(row.deleted !== undefined ? { deleted: row.deleted, deletedNumber: row.deletedNumber as number | null } : {}), ...statisticsCounts(row) }
  })
  const decks = body.decks.map((row: unknown): DeckStatistics => {
    if (!isRecord(row) || !isUuid(row.deckId) || !isUuid(row.ownerUserId) ||
      typeof row.ownerUsername !== 'string' || !row.ownerUsername ||
      typeof row.name !== 'string' || !row.name ||
      typeof row.archived !== 'boolean') {
      throw new Error('The server returned invalid deck statistics.')
    }
    return { deckId: row.deckId, ownerUserId: row.ownerUserId, ownerUsername: row.ownerUsername,
      name: row.name, commanders: commandersFrom(row.commanders), archived: row.archived, ...statisticsCounts(row) }
  })
  if (new Set(players.map((row) => row.userId.toLowerCase())).size !== players.length ||
    new Set(decks.map((row) => row.deckId.toLowerCase())).size !== decks.length) {
    throw new Error('The server returned duplicate statistics rows.')
  }
  const sizes = playerCount === undefined ? [2, 3, 4, 5, 6] : [playerCount]
  if (body.startPositions.length !== sizes.length) throw new Error('Invalid statistics table sizes.')
  const startPositions = body.startPositions.map((section: unknown, index: number) => {
    if (!isRecord(section) || section.playerCount !== sizes[index] || !Array.isArray(section.seats) || section.seats.length !== sizes[index]) {
      throw new Error('Invalid statistics seats.')
    }
    return { playerCount: sizes[index] as PlayerCount, seats: section.seats.map((seat: unknown, position: number) => {
      if (!isRecord(seat) || seat.startPosition !== position + 1) throw new Error('Invalid statistics seat.')
      return { startPosition: position + 1, ...chartCounts(seat) }
    }) }
  })
  const colors = ['W', 'U', 'B', 'R', 'G', 'C']
  const manaColors = body.manaColors.map((row: unknown): ManaStatistics => {
    if (!isRecord(row) || typeof row.color !== 'string' || !colors.includes(row.color)) throw new Error('Invalid statistics color.')
    return { color: row.color as ManaStatistics['color'], ...chartCounts(row) }
  })
  if (manaColors.length !== 6 || new Set(manaColors.map(row => row.color)).size !== 6) throw new Error('Invalid statistics colors.')
  return { players, decks, startPositions, manaColors }
}

function colorsFrom(value: unknown): MagicColor[] {
  if (!Array.isArray(value) || value.some(color => !magicColors.includes(color as MagicColor)) || value.join('') !== canonicalColors(value)) {
    throw new Error('The server returned invalid Commander colors.')
  }
  return value as MagicColor[]
}
function referenceFrom(value: unknown): CommanderSelectionRef {
  if (!isRecord(value) || !isUuid(value.scryfallCardId) || (value.gameplayFaceIndex !== undefined &&
    (typeof value.gameplayFaceIndex !== 'number' || !Number.isSafeInteger(value.gameplayFaceIndex) || value.gameplayFaceIndex < 0))) {
    throw new Error('The server returned an invalid Commander selection.')
  }
  return { scryfallCardId: value.scryfallCardId, ...(value.gameplayFaceIndex !== undefined ? { gameplayFaceIndex: value.gameplayFaceIndex as number } : {}) }
}
function pairingFrom(value: unknown): PairingCapabilities {
  if (!isRecord(value) || !['roles', 'partnerWith', 'variants'].every(key => Array.isArray(value[key]) && value[key].every(item => typeof item === 'string'))) {
    throw new Error('The server returned invalid Commander pairing metadata.')
  }
  return { roles: value.roles as string[], partnerWith: value.partnerWith as string[], variants: value.variants as string[] }
}
function choiceFrom(value: unknown): CommanderChoice {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name || !isUuid(value.scryfallCardId) ||
    typeof value.requiresChosenColor !== 'boolean' || typeof value.canBeSoleCommander !== 'boolean') {
    throw new Error('The server returned an invalid Commander choice.')
  }
  const selectionRef = referenceFrom(value.selectionRef)
  if (selectionRef.scryfallCardId !== value.scryfallCardId) throw new Error('The server returned inconsistent Commander printing data.')
  return { pairing: pairingFrom(value.pairing), name: value.name, selectionRef, scryfallCardId: value.scryfallCardId, colorIdentity: colorsFrom(value.colorIdentity),
    requiresChosenColor: value.requiresChosenColor, canBeSoleCommander: value.canBeSoleCommander,
    thumbnailUrl: typeof value.thumbnailUrl === 'string' && /^https:\/\//.test(value.thumbnailUrl) ? value.thumbnailUrl : null }
}
function cardFacesFrom(value: unknown): CardFace[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length === 0) throw new Error('The server returned invalid card faces.')
  const faces = value.map((face: unknown): CardFace => {
    if (!isRecord(face) || typeof face.name !== 'string' || !face.name ||
      (face.faceIndex !== null && (typeof face.faceIndex !== 'number' || !Number.isSafeInteger(face.faceIndex) || face.faceIndex < 0)) ||
      [face.typeLine, face.oracleText, face.imageUrl].some(text => text !== null && typeof text !== 'string')) {
      throw new Error('The server returned an invalid card face.')
    }
    return { faceIndex: face.faceIndex as number | null, name: face.name, typeLine: face.typeLine as string | null,
      oracleText: face.oracleText as string | null, imageUrl: face.imageUrl as string | null }
  })
  if (new Set(faces.map(face => face.faceIndex)).size !== faces.length || (faces.length > 1 && faces.some(face => face.faceIndex === null))) {
    throw new Error('The server returned ambiguous card faces.')
  }
  return faces
}

function companionFrom(value: unknown): SavedCompanion | null {
  if (value === null) return null
  if (!isRecord(value) || !isUuid(value.oracleId) || !isUuid(value.scryfallCardId) || typeof value.name !== 'string' || !value.name ||
    (value.artworkFaceIndex !== null && (typeof value.artworkFaceIndex !== 'number' || !Number.isSafeInteger(value.artworkFaceIndex) || value.artworkFaceIndex < 0)) ||
    [value.artCropUrl, value.illustrationId, value.artist, value.scryfallUri].some(text => text !== null && typeof text !== 'string')) {
    throw new Error('The server returned an invalid saved Companion.')
  }
  const selectionRef = referenceFrom(value.selectionRef)
  if (selectionRef.scryfallCardId !== value.scryfallCardId) throw new Error('The server returned inconsistent Companion printing data.')
  return { oracleId: value.oracleId, name: value.name, selectionRef, scryfallCardId: value.scryfallCardId,
    colorIdentity: colorsFrom(value.colorIdentity), artworkFaceIndex: value.artworkFaceIndex as number | null,
    artCropUrl: value.artCropUrl as string | null, illustrationId: value.illustrationId as string | null,
    artist: value.artist as string | null, scryfallUri: value.scryfallUri as string | null,
    ...('cardFaces' in value ? { cardFaces: cardFacesFrom(value.cardFaces) } : {}) }
}

function commandersFrom(value: unknown): SavedCommander[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) throw new Error('The server returned invalid Commanders.')
  const result = value.map((card: unknown, index): SavedCommander => {
    const choice = choiceFrom(card)
    if (!isRecord(card) || card.position !== index + 1 || !isUuid(card.oracleId) ||
      (choice.requiresChosenColor ? !magicColors.includes(card.chosenColor as MagicColor) : card.chosenColor !== null) ||
      (card.artworkFaceIndex !== null && (typeof card.artworkFaceIndex !== 'number' || !Number.isSafeInteger(card.artworkFaceIndex) || card.artworkFaceIndex < 0))) {
      throw new Error('The server returned an invalid saved Commander.')
    }
    const nullableText = (key: string): string | null => {
      if (card[key] !== null && typeof card[key] !== 'string') throw new Error('The server returned invalid Commander artwork.')
      return card[key] as string | null
    }
    const { thumbnailUrl: _thumbnail, ...metadata } = choice
    void _thumbnail
    return { ...metadata, ...('cardFaces' in card ? { cardFaces: cardFacesFrom(card.cardFaces) } : {}), position: index + 1, oracleId: card.oracleId, chosenColor: card.chosenColor as MagicColor | null,
      effectiveColorIdentity: colorsFrom(card.effectiveColorIdentity), artworkFaceIndex: card.artworkFaceIndex as number | null,
      artCropUrl: nullableText('artCropUrl'), illustrationId: nullableText('illustrationId'), artist: nullableText('artist'), scryfallUri: nullableText('scryfallUri') }
  })
  if (new Set(result.map(card => card.oracleId)).size !== result.length) throw new Error('The server returned duplicate Commanders.')
  return result
}
export async function searchCommanders(query: string, signal?: AbortSignal, partnerOf?: CommanderSelectionRef, format?: DeckFormat): Promise<CommanderChoice[]> {
  const context = (partnerOf ? `&partnerOf=${encodeURIComponent(partnerOf.scryfallCardId)}${partnerOf.gameplayFaceIndex !== undefined ? `&partnerGameplayFaceIndex=${partnerOf.gameplayFaceIndex}` : ''}` : '') +
    (format && format !== 'COMMANDER' ? `&format=${format}` : '')
  const response = await fetch(`/api/scryfall/commanders?q=${encodeURIComponent(query)}${context}`, { ...requestDefaults, signal })
  if (!response.ok) throw new ApiError(scryfallUnavailable, response.status)
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > 20) throw new Error(scryfallUnavailable)
  return body.map(choiceFrom)
}

export async function searchCompanions(query: string, signal?: AbortSignal): Promise<CompanionChoice[]> {
  const response = await fetch(`/api/scryfall/companions?q=${encodeURIComponent(query)}`, { ...requestDefaults, signal })
  if (!response.ok) throw new ApiError(scryfallUnavailable, response.status)
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > 20) throw new Error(scryfallUnavailable)
  return body.map((value: unknown): CompanionChoice => {
    if (!isRecord(value) || typeof value.name !== 'string' || !value.name) throw new Error('The server returned an invalid Companion choice.')
    return { selectionRef: referenceFrom(value.selectionRef), name: value.name, colorIdentity: colorsFrom(value.colorIdentity),
      thumbnailUrl: typeof value.thumbnailUrl === 'string' && /^https:\/\//.test(value.thumbnailUrl) ? value.thumbnailUrl : null }
  })
}

export type Artwork = Pick<SavedCommander, 'scryfallCardId' | 'artworkFaceIndex' | 'artCropUrl' | 'illustrationId' | 'artist' | 'scryfallUri'>

export async function listArtworks(reference: CommanderSelectionRef, signal?: AbortSignal): Promise<Artwork[]> {
  const context = reference.gameplayFaceIndex === undefined ? '' : `?gameplayFaceIndex=${reference.gameplayFaceIndex}`
  const response = await checkedResponse(await fetch(`/api/scryfall/cards/${encodeURIComponent(reference.scryfallCardId)}/artworks${context}`,
    { ...requestDefaults, signal }), 200, scryfallUnavailable)
  const body: unknown = await response.json()
  if (!Array.isArray(body) || body.length > 200) throw new Error('Invalid artwork list.')
  return body.map((value: unknown): Artwork => {
    if (!isRecord(value) || !isUuid(value.scryfallCardId) ||
      (value.artworkFaceIndex !== null && (typeof value.artworkFaceIndex !== 'number' || !Number.isSafeInteger(value.artworkFaceIndex) || value.artworkFaceIndex < 0)) ||
      !['artCropUrl', 'illustrationId', 'artist', 'scryfallUri'].every(key => value[key] === null || typeof value[key] === 'string')) {
      throw new Error('Invalid artwork option.')
    }
    return { scryfallCardId: value.scryfallCardId, artworkFaceIndex: value.artworkFaceIndex as number | null,
      artCropUrl: value.artCropUrl as string | null, illustrationId: value.illustrationId as string | null,
      artist: value.artist as string | null, scryfallUri: value.scryfallUri as string | null }
  })
}

export async function updateCommanderArtwork(deckId: string, commander: SavedCommander, artwork: Artwork, signal?: AbortSignal): Promise<Deck> {
  const deck = await deckResponse(await unsafeRequest('PUT',
    `/api/decks/${encodeURIComponent(deckId)}/commanders/${commander.position}/artwork`,
    { scryfallCardId: artwork.scryfallCardId, ...(artwork.artworkFaceIndex === null ? {} : { artworkFaceIndex: artwork.artworkFaceIndex }) }, signal),
  'Artwork konnte nicht gespeichert werden.', 200)
  const slot = deck.commanders.find(card => card.position === commander.position)
  if (deck.id !== deckId || slot?.oracleId !== commander.oracleId || slot.scryfallCardId !== artwork.scryfallCardId || slot.artworkFaceIndex !== artwork.artworkFaceIndex) {
    throw new Error('The artwork save could not be confirmed.')
  }
  return deck
}

export async function updateCompanionArtwork(deckId: string, companion: SavedCompanion, artwork: Artwork, signal?: AbortSignal): Promise<Deck> {
  const deck = await deckResponse(await unsafeRequest('PUT', `/api/decks/${encodeURIComponent(deckId)}/companion/artwork`,
    { scryfallCardId: artwork.scryfallCardId, ...(artwork.artworkFaceIndex === null ? {} : { artworkFaceIndex: artwork.artworkFaceIndex }) }, signal),
  'Artwork konnte nicht gespeichert werden.', 200)
  if (deck.id !== deckId || deck.companion?.oracleId !== companion.oracleId || deck.companion.scryfallCardId !== artwork.scryfallCardId ||
    deck.companion.artworkFaceIndex !== artwork.artworkFaceIndex) throw new Error('The artwork save could not be confirmed.')
  return deck
}
