import { savedCommander } from './commanderFixtures'
import { vi } from 'vitest'
import type { DeckSelection, Game, GameInput, GroupDetails, GroupMember, GroupStatistics } from '../api'

export const uid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
export const members: GroupMember[] = [
  { userId: uid(1), username: 'Owner', role: 'OWNER' },
  { userId: uid(2), username: 'Same name', role: 'MEMBER' },
  { userId: uid(3), username: 'Same name', role: 'MEMBER' },
  { userId: uid(4), username: 'Fourth', role: 'MEMBER' },
]
export const group: GroupDetails = { id: uid(10), name: 'Friday games', role: 'OWNER', members }
export const deckFor = (n: number): DeckSelection => ({ id: uid(100 + n), name: `Deck ${n}`, commanders: [savedCommander(`Commander ${n}`)], colorIdentity: ['R'] })
export function recorded(overrides: Partial<Game> = {}): Game {
  return { id: uid(20), groupId: group.id, creatorId: uid(2), recordedAt: '2026-10-16T08:00:00.123456Z',
    result: 'WIN', alternateWinCon: false, winnerUserId: uid(2), participants: [2, 3].map((n) => ({
      startPosition: n - 1, placement: overrides.result === 'DRAW' ? null : n - 1, stillInGame: overrides.result === 'DRAW' || n === 2, userId: uid(n), username: 'Same name', deckId: deckFor(n).id, deck: { ...deckFor(n), archived: false },
    })), ...overrides }
}
export function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
export function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}
type Reply = (input?: RequestInit) => Response | Promise<Response>
export function gameApi(initial: Game[] = []) {
  const state = { history: initial, statistics: { players: [], decks: [] } as GroupStatistics }
  const replies = new Map<string, Reply[]>()
  function next(path: string, reply: Reply, method = 'GET') {
    const key = `${method} ${path}`
    replies.set(key, [...(replies.get(key) ?? []), reply])
  }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const reply = replies.get(`${method} ${path}`)?.shift()
    if (reply) return reply(init)
    if (path.endsWith('/statistics')) return response(state.statistics)
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'game-token' })
    if (path === `/api/groups/${group.id}`) return response(group)
    if (path === `/api/groups/${group.id}/games` && method === 'GET') return response(state.history)
    const member = members.find((member) => path === `/api/groups/${group.id}/members/${member.userId}/decks`)
    if (member) return response([deckFor(members.indexOf(member) + 1)])
    if (path.startsWith(`/api/groups/${group.id}/games`) && ['POST', 'PUT'].includes(method)) {
      const input = JSON.parse(init!.body as string) as GameInput
      const winner = input.result === 'DRAW' ? null : input.participants.find(p => input.alternateWinCon ? p.winner : p.placement === 1)?.userId ?? null
      const game = recorded({ ...input, winnerUserId: winner, participants: input.participants.map((p) => ({
        ...p, placement: input.result === 'DRAW' ? null : input.alternateWinCon ? p.winner ? 1 : p.stillInGame ? 2 : p.placement! : p.placement!,
        stillInGame: input.result === 'DRAW' ? p.stillInGame! : input.alternateWinCon ? Boolean(p.winner || p.stillInGame) : p.placement === 1, username: members.find((m) => m.userId === p.userId)?.username ?? 'Former',
        deck: { ...deckFor(Number(p.userId.slice(-1))), id: p.deckId, archived: false },
      })) })
      state.history = [game]
      return response(game, method === 'POST' ? 201 : 200)
    }
    if (path.startsWith(`/api/groups/${group.id}/games/`) && method === 'GET') {
      const game = state.history.find(game => game.id.toLowerCase() === path.split('/').at(-1)?.toLowerCase())
      return response(game ?? {}, game ? 200 : 404)
    }
    if (path === `/api/groups/${group.id}/games/${uid(20)}` && method === 'DELETE') {
      state.history = []
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { ...state, state, next, fetchMock }
}
