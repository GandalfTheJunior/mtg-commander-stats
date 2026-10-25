import { afterEach, expect, test, vi } from 'vitest'
import { ApiError, getGroupStatistics } from './api'
import { group, response, uid } from './test/gameFixtures'
import { statistics, emptyStatistics } from './test/statisticsFixtures'

afterEach(() => vi.unstubAllGlobals())

test('uses the credentialed GET contract and abort signal, strips extras and preserves server order and percentages', async () => {
  const data = statistics()
  data.players.reverse()
  data.players[0].winRatePercent = 7.89 // Deliberately supplied by the server; never calculated from counts.
  const raw = { ...data, email: 'private@example.test', joinCode: 'private',
    players: data.players.map(row => ({ ...row, password: 'private' })),
    decks: data.decks.map(row => ({ ...row, email: 'private' })) }
  const mock = vi.fn().mockResolvedValue(response(raw))
  vi.stubGlobal('fetch', mock)
  const controller = new AbortController()
  expect(await getGroupStatistics(group.id, controller.signal)).toEqual(data)
  expect(mock).toHaveBeenCalledExactlyOnceWith(`/api/groups/${group.id}/statistics`, { credentials: 'same-origin', signal: controller.signal })
})

test('accepts an empty group and sends no CSRF request', async () => {
  const mock = vi.fn().mockResolvedValue(response(emptyStatistics()))
  vi.stubGlobal('fetch', mock)
  expect(await getGroupStatistics(group.id)).toEqual(emptyStatistics())
  expect(mock).toHaveBeenCalledExactlyOnceWith(`/api/groups/${group.id}/statistics`, { credentials: 'same-origin' })
})

test.each([null, [], {}, { players: [] }, { players: null, decks: [] }, { players: [], decks: {} }])('rejects malformed statistics shape %j', async body => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)))
  await expect(getGroupStatistics(group.id)).rejects.toThrow('invalid group statistics')
})

test.each(['players', 'decks'] as const)('rejects invalid counts, labels and IDs in %s', async kind => {
  const changes = [
    { games: 0 }, { games: -1 }, { games: 1.5 }, { games: '12' }, { games: null }, { games: Number.MAX_SAFE_INTEGER + 1 },
    { wins: -1 }, { wins: 0.5 }, { wins: '1' }, { wins: 99 }, { wins: undefined },
    { winRatePercent: -0.1 }, { winRatePercent: 101 }, { winRatePercent: '50' }, { winRatePercent: null },
    ...(kind === 'players' ? [{ userId: 'invalid' }, { username: '' }, { username: null }]
      : [{ deckId: 'invalid' }, { ownerUserId: uid(1).slice(1) }, { ownerUsername: null }, { name: '' }, { commanders: null }, { archived: 'true' }, { archived: undefined }]),
  ]
  for (const change of changes) {
    const data = statistics()
    const body = { ...data, [kind]: [{ ...data[kind][0], ...change }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)))
    await expect(getGroupStatistics(group.id), JSON.stringify(change)).rejects.toThrow()
  }
  for (const invalid of [null, 'not a row']) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...statistics(), [kind]: [invalid] })))
    await expect(getGroupStatistics(group.id)).rejects.toThrow()
  }
})

test.each(['players', 'decks'] as const)('rejects duplicate IDs in %s including different UUID letter case', async kind => {
  const data = statistics()
  const key = kind === 'players' ? 'userId' : 'deckId'
  const id = 'abcdefab-abcd-abcd-abcd-abcdefabcdef'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...data, [kind]: [
    { ...data[kind][0], [key]: id }, { ...data[kind][1], [key]: id.toUpperCase() },
  ] })))
  await expect(getGroupStatistics(group.id)).rejects.toThrow('duplicate statistics rows')
})

test.each([401, 403, 404, 500])('retains HTTP status %s for the access/error lifecycle', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ detail: 'Statistics unavailable.' }, status)))
  await expect(getGroupStatistics(group.id)).rejects.toEqual(new ApiError('Statistics unavailable.', status))
})

test.each([201, 202, 204])('rejects unexpected success status %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(status === 204 ? new Response(null, { status }) : response(statistics(), status)))
  await expect(getGroupStatistics(group.id)).rejects.toThrow('unexpected response')
})

test('rejects invalid JSON instead of treating it as empty statistics', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid json', { status: 200 })))
  await expect(getGroupStatistics(group.id)).rejects.toThrow()
})

// DisplayText deliberately permits BOM/zero-width text; do not apply a different
// JavaScript trimming policy to current public labels returned by the backend.
test('preserves product-valid display text exactly, including BOM and zero-width characters', async () => {
  const data = statistics()
  data.players[0].username = '\uFEFF'
  data.decks[0].ownerUsername = '\uFEFF'
  data.decks[0].name = '\u200B'
  data.decks[0].commanders[0].name = '\uFEFF'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  expect(await getGroupStatistics(group.id)).toEqual(data)
})

test.each([2, 3, 4, 5, 6] as const)('requests the shared %s-player subset and validates its fixed shape', async n => {
  const data = emptyStatistics(n)
  const mock = vi.fn().mockResolvedValue(response(data))
  vi.stubGlobal('fetch', mock)
  expect(await getGroupStatistics(group.id, undefined, n)).toEqual(data)
  expect(mock.mock.calls[0][0]).toBe(`/api/groups/${group.id}/statistics?playerCount=${n}`)
  mock.mockResolvedValue(response(emptyStatistics()))
  await expect(getGroupStatistics(group.id, undefined, n)).rejects.toThrow()
})

test.each([
  { manaColors: [] }, { manaColors: [...emptyStatistics().manaColors.slice(1), emptyStatistics().manaColors[1]] },
  { startPositions: [] },
  { manaColors: emptyStatistics().manaColors.map(row => ({ ...row, winRatePercent: 0 })) },
  { startPositions: [{ playerCount: 2, seats: [{ startPosition: 1, games: 1, wins: 0, winRatePercent: null }] }] },
])('rejects malformed v2 categories %j', async change => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...emptyStatistics(), ...change })))
  await expect(getGroupStatistics(group.id)).rejects.toThrow()
})
