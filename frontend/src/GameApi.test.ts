import { afterEach, expect, test, vi } from 'vitest'
import { archiveDeck, createQuickProfile, createQuickProfileDeck, deleteDeck, getGame, getGroup, listDecks, listGames, listQuickProfileDecks, memberDecks, saveGame } from './api'
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
  const input = { participants: [{ userId: uid(2), deckId: deckFor(2).id, startPosition: 1, placement: 1, role: 'OWNER' }, { userId: uid(3), deckId: deckFor(3).id, startPosition: 2, placement: 2 }],
    result: 'WIN' as const, alternateWinCon: false, winnerUserId: uid(2), creatorId: uid(99) }
  await expect(saveGame(group.id, input, uid(30))).rejects.toThrow()
  expect(JSON.parse(api.fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body as string)).toEqual({
    participants: input.participants.map(({ userId, deckId, startPosition, placement }) => ({ userId, deckId, startPosition, placement })), result: 'WIN', alternateWinCon: false,
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

test.each(['normal', 'alternate', 'draw'] as const)('transport sends only %s fields, stripping inactive cached values and read winner', async mode => {
  const api = gameApi()
  const input = {
    result: mode === 'draw' ? 'DRAW' as const : 'WIN' as const, alternateWinCon: mode === 'alternate',
    winnerUserId: uid(2),
    participants: [2, 3, 4].map((n, i) => ({
      userId: uid(n), deckId: deckFor(n).id, startPosition: i + 1, placement: i + 1,
      ...(i === 0 ? { winner: true as const } : {}), stillInGame: i !== 2,
    })),
  }
  await saveGame(group.id, input)
  const body = JSON.parse(api.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as string)
  expect(body).toEqual({ result: input.result, alternateWinCon: input.alternateWinCon,
    participants: input.participants.map((p, i) => ({ userId: p.userId, deckId: p.deckId, startPosition: p.startPosition,
      ...(mode === 'draw' ? { stillInGame: p.stillInGame } : mode === 'normal' ? { placement: p.placement } :
        i === 0 ? { winner: true } : i === 1 ? { stillInGame: true } : { stillInGame: false, placement: 3 }),
    })) })
})

test.each([
  { startPosition: undefined }, { startPosition: 0 }, { startPosition: 1.5 },
  { stillInGame: null }, { placement: undefined }, { placement: 0 },
])('read contract rejects incomplete or malformed game facts %j', async changes => {
  const game = recorded()
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...game, participants: [{ ...game.participants[0], ...changes }, game.participants[1]] })))
  await expect(getGame(group.id, game.id)).rejects.toThrow()
})

test.each(['2026-02-30', 'not-a-date', undefined])('rejects invalid or absent playedOn %s in details', async playedOn => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...recorded(), playedOn })))
  await expect(getGame(group.id, uid(20))).rejects.toThrow()
})

test('group members carry the optional quick-profile marker and reject a malformed one', async () => {
  const members = [{ userId: uid(1), username: 'Owner', role: 'OWNER', quickProfile: false }, { userId: uid(5), username: 'Hairy Zombie', role: 'MEMBER', quickProfile: true }]
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...group, members })))
  expect((await getGroup(group.id)).members).toEqual([{ userId: uid(1), username: 'Owner', role: 'OWNER' }, { userId: uid(5), username: 'Hairy Zombie', role: 'MEMBER', quickProfile: true }])
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...group, members: [{ ...members[1], quickProfile: 'yes' }] })))
  await expect(getGroup(group.id)).rejects.toThrow()
})

test('quick-profile creation and its deck routes use the group-scoped API with CSRF', async () => {
  const profile = { userId: uid(5), username: 'Hairy Zombie', role: 'MEMBER', quickProfile: true }
  const saved = { ...deckFor(5), everUsed: false, archived: false, manaBoxUrl: null }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'token' })
    if (path === `/api/groups/${group.id}/quick-profiles` && init?.method === 'POST') return response(profile, 201)
    if (path === `/api/groups/${group.id}/quick-profiles/${uid(5)}/decks`) return init?.method === 'POST' ? response(saved, 201) : response([saved])
    throw new Error(`Unexpected ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  expect(await createQuickProfile(group.id)).toEqual(profile)
  expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST', headers: { 'X-CSRF-TOKEN': 'token' } }))
  expect(fetchMock.mock.calls[1][1]).not.toHaveProperty('body')
  expect((await createQuickProfileDeck(group.id, uid(5), { name: 'Deck 5' })).id).toBe(saved.id)
  expect((await listQuickProfileDecks(group.id, uid(5))).map(deck => deck.id)).toEqual([saved.id])
  vi.stubGlobal('fetch', vi.fn(async (path: string) => path === '/api/csrf' ? response({ headerName: 'X', token: 't' }) : response({ ...profile, quickProfile: false }, 201)))
  await expect(createQuickProfile(group.id)).rejects.toThrow()
})

test('game writes send playedOn and leave winner-only ranks unknown', async () => {
  const api = gameApi()
  await saveGame(group.id, { result: 'WIN', alternateWinCon: false, playedOn: '2026-11-06', participants: [
    { userId: uid(2), deckId: deckFor(2).id, startPosition: 1, placement: 1 }, { userId: uid(3), deckId: deckFor(3).id, startPosition: 2 },
  ] })
  const body = JSON.parse(api.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as string)
  expect(body).toEqual({ result: 'WIN', alternateWinCon: false, playedOn: '2026-11-06', participants: [
    { userId: uid(2), deckId: deckFor(2).id, startPosition: 1, placement: 1 }, { userId: uid(3), deckId: deckFor(3).id, startPosition: 2 },
  ] })
})
