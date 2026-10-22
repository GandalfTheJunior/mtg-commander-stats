import { afterEach, expect, test, vi } from 'vitest'
import { archiveDeck, deleteDeck, getGame, listDecks, listGames, memberDecks, saveGame } from './api'
import { deckFor, gameApi, group, recorded, response, uid } from './test/gameFixtures'

afterEach(() => vi.unstubAllGlobals())

test.each([
  ['missing metadata', { id: undefined }], ['wrong group', { groupId: uid(99) }],
  ['bad creator', { creatorId: 'bad' }], ['bad time', { recordedAt: 'yesterday' }],
  ['bad result', { result: 'LOSS' }], ['invalid winner', { winnerUserId: uid(99) }],
  ['draw winner', { result: 'DRAW', winnerUserId: uid(2) }], ['missing winner', { winnerUserId: undefined }],
  ['too few players', { participants: [recorded().participants[0]] }],
  ['duplicate players', { participants: [recorded().participants[0], recorded().participants[0]] }],
  ['bad deck', { participants: [{ ...recorded().participants[0], deck: { ...deckFor(2), archived: 'true' } }, recorded().participants[1]] }],
  ['mismatched deck', { participants: [{ ...recorded().participants[0], deckId: uid(999) }, recorded().participants[1]] }],
] as const)('rejects game responses with %s', async (_label, changes) => {
  vi.stubGlobal('fetch', vi.fn(async () => response([{ ...recorded(), ...changes }])))
  await expect(listGames(group.id)).rejects.toThrow()
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...recorded(), ...changes })))
  await expect(getGame(group.id, uid(20))).rejects.toThrow()
})

test.each([{}, [recorded(), recorded()], [recorded({ groupId: uid(99) })]])('rejects malformed/cross-group history', async (body) => {
  vi.stubGlobal('fetch', vi.fn(async () => response(body)))
  await expect(listGames(group.id)).rejects.toThrow()
})

test('validates and strips response fields while retaining server game order and public historical display', async () => {
  const first = recorded({ id: uid(21), result: 'DRAW', winnerUserId: null })
  const second = recorded()
  second.participants[0].deck.archived = true
  vi.stubGlobal('fetch', vi.fn(async () => response([
    { ...first, email: 'secret@example.invalid', credential: 'private' }, second,
  ])))
  expect(await listGames(group.id)).toEqual([first, second])
})

test.each([
  [{ ...deckFor(2), id: 'bad' }], [{ ...deckFor(2), colorIdentity: ['R', 'R'] }],
  [{ ...deckFor(2), colorIdentity: ['G', 'W'] }], [{ ...deckFor(2), commanders: null }],
  [deckFor(2), deckFor(2)], {},
])('rejects invalid eligible-deck summaries', async (body) => {
  vi.stubGlobal('fetch', vi.fn(async () => response(body)))
  await expect(memberDecks(group.id, uid(2))).rejects.toThrow()
})

test('deck selection is a credentialed read, exposes only selection fields, and supports an empty list', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response([{ ...deckFor(2), email: 'hidden' }])).mockResolvedValueOnce(response([]))
  vi.stubGlobal('fetch', fetchMock)
  expect(await memberDecks(group.id, uid(2))).toEqual([deckFor(2)])
  expect(fetchMock).toHaveBeenCalledWith(`/api/groups/${group.id}/members/${uid(2)}/decks`, { credentials: 'same-origin' })
  expect(await memberDecks(group.id, uid(2))).toEqual([])
})

test('PUT rejects a different game ID and all unknown request fields are stripped', async () => {
  const api = gameApi()
  api.next(`/api/groups/${group.id}/games/${uid(30)}`, () => response(recorded()), 'PUT')
  const input = { participants: [{ userId: uid(2), deckId: deckFor(2).id, role: 'OWNER' }, { userId: uid(3), deckId: deckFor(3).id }],
    result: 'WIN' as const, winnerUserId: uid(2), creatorId: uid(99) }
  await expect(saveGame(group.id, input, uid(30))).rejects.toThrow()
  expect(JSON.parse(api.fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body as string)).toEqual({
    participants: input.participants.map(({ userId, deckId }) => ({ userId, deckId })), result: 'WIN', winnerUserId: uid(2),
  })
})

test.each([{}, { everUsed: 'true', archived: false }, { everUsed: false }, { everUsed: false, archived: null }])('requires real deck lifecycle flags', async (flags) => {
  vi.stubGlobal('fetch', vi.fn(async () => response([{ ...deckFor(2), ...flags }])))
  await expect(listDecks()).rejects.toThrow()
})

test.each([
  [200, { ...deckFor(2), everUsed: true, archived: false }],
  [200, { ...deckFor(3), everUsed: true, archived: true }],
  [201, { ...deckFor(2), everUsed: true, archived: true }],
])('archive requires expected status and matching confirmed archived deck', async (status, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
    .mockResolvedValueOnce(response(body, status)))
  await expect(archiveDeck(deckFor(2).id)).rejects.toThrow()
})

test('deck hard deletion requires the documented 204 acknowledgment', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
    .mockResolvedValueOnce(response({}, 200)))
  await expect(deleteDeck(deckFor(2).id)).rejects.toThrow('unexpected response')
})


test('single-game GET validates both route IDs case-insensitively, exact status and preserves AbortSignal', async () => {
  const groupId = 'aabbccdd-1234-4abc-8def-abcdef123456'
  const gameId = 'aabbccdd-1234-4abc-8def-abcdef123457'
  const signal = new AbortController().signal
  const fetchMock = vi.fn(async () => response(recorded({ id: gameId, groupId })))
  vi.stubGlobal('fetch', fetchMock)
  expect((await getGame(groupId.toUpperCase(), gameId.toUpperCase(), signal)).id).toBe(gameId)
  expect(fetchMock).toHaveBeenCalledWith(`/api/groups/${groupId.toUpperCase()}/games/${gameId.toUpperCase()}`, { credentials: 'same-origin', signal })
  vi.stubGlobal('fetch', vi.fn(async () => response(recorded({ id: uid(99), groupId }))))
  await expect(getGame(groupId, gameId)).rejects.toThrow()
  vi.stubGlobal('fetch', vi.fn(async () => response(recorded({ id: gameId, groupId }), 201)))
  await expect(getGame(groupId, gameId)).rejects.toThrow('unexpected')
})
