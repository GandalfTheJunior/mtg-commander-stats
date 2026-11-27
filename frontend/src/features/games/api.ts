import { checkedResponse, isRecord, isUuid, requestDefaults, unsafeRequest } from '../../shared/http/client'
import { canonicalColors, commandersFrom, companionFrom, type Deck, type MagicColor, magicColors } from '../decks/api'
import { gamePayload } from './gameOutcome'

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
  /** Required with every explicitly supplied non-null playedOn; browser IANA zone at Save. */
  playedOnTimeZone?: string
  participants: { userId: string; deckId: string; startPosition: number; placement?: number; winner?: true; stillInGame?: boolean }[]
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

/** Group-scoped read of an active member's unarchived decks (#199, #238). `manaBoxUrl` is present only when the server
 * authorized and returned a stored link; callers must still validate it before rendering. */
export type MemberDeck = DeckSelection & { manaBoxUrl?: string }

/** `includeManaBox` is only for the read-only member deck view (#199); the game-editor picker never retains links. */
export async function memberDecks(groupId: string, userId: string, signal?: AbortSignal, includeManaBox = false): Promise<MemberDeck[]> {
  const response = await checkedResponse(await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/decks`,
    { ...requestDefaults, ...(signal ? { signal } : {}) },
  ), 200, 'Could not load eligible decks.')
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new Error('The server returned an invalid deck selection list.')
  const decks = body.map((value: unknown): MemberDeck => ({ ...selectionFrom(value),
    ...(includeManaBox && isRecord(value) && typeof value.manaBoxUrl === 'string' ? { manaBoxUrl: value.manaBoxUrl } : {}) }))
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length) throw new Error('The server returned duplicate decks.')
  return decks
}
