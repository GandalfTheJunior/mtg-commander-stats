import { checkedResponse, isRecord, isUuid, requestDefaults } from '../../shared/http/client'
import { commandersFrom, type MagicColor, type SavedCommander } from '../decks/api'

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
  ownerDeleted?: boolean
  ownerDeletedNumber?: number | null
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

// Optional anonymization metadata: a deleted profile carries its stable per-group number.
function deletedProfile<F extends string, N extends string>(deleted: unknown, number: unknown, flag: F, numberField: N) {
  if (deleted !== undefined && typeof deleted !== 'boolean' ||
    deleted === true && (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) ||
    deleted !== true && number !== undefined && number !== null) {
    throw new Error('The server returned invalid deleted profile metadata.')
  }
  return (deleted === undefined ? {} : { [flag]: deleted, [numberField]: number as number | null }) as Partial<Record<F, boolean> & Record<N, number | null>>
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
    return { userId: row.userId, username: row.username, ...deletedProfile(row.deleted, row.deletedNumber, 'deleted', 'deletedNumber'), ...statisticsCounts(row) }
  })
  const decks = body.decks.map((row: unknown): DeckStatistics => {
    if (!isRecord(row) || !isUuid(row.deckId) || !isUuid(row.ownerUserId) ||
      typeof row.ownerUsername !== 'string' || !row.ownerUsername ||
      typeof row.name !== 'string' || !row.name ||
      typeof row.archived !== 'boolean') {
      throw new Error('The server returned invalid deck statistics.')
    }
    return { deckId: row.deckId, ownerUserId: row.ownerUserId, ownerUsername: row.ownerUsername,
      ...deletedProfile(row.ownerDeleted, row.ownerDeletedNumber, 'ownerDeleted', 'ownerDeletedNumber'), name: row.name, commanders: commandersFrom(row.commanders), archived: row.archived, ...statisticsCounts(row) }
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
