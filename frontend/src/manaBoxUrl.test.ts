import { afterEach, expect, test, vi } from 'vitest'
import { safeManaBoxUrl } from './manaBoxUrl'
import { createDeck, getGame, listDecks, listGames, memberDecks, updateDeck } from './api'
import { deck } from './test/deckFixtures'
import { deckFor, group, recorded, response, uid } from './test/gameFixtures'

const url = 'https://manabox.app/decks/Synthetic-Mixed_123'
afterEach(() => vi.unstubAllGlobals())

test.each([url, `${url}/`, 'HTTPS://MANABOX.APP:443/decks/a', 'https://manabox.app/decks/_-'])('accepts the backend v1 shape without rewriting %s', value => {
  expect(safeManaBoxUrl(value)).toBe(value)
})
test.each([null, undefined, 42, {}, '', ' ', ` ${url}`, `${url}\n`, `${url}\t`, 'javascript:alert(1)', url.replace('https:', 'http:'),
  url.replace('manabox.app', 'www.manabox.app'), url.replace('manabox.app', 'manabox.app.evil.test'),
  url.replace('manabox.app', 'user@manabox.app'), url.replace('manabox.app', 'manabox.app:444'),
  url.replace('manabox.app', 'manabox.app:0443'), url.replace('/decks/', '/DECKS/'),
  'https://manabox.app/decks/', 'https://manabox.app/decks/../decks/id', 'https://manabox.app/decks/%61',
  'https://manabox.app/decks/id%2fextra', 'https://manabox.app\\decks\\id',
  `${url}?`, `${url}#`, `${url}?key=value`, `${url}#fragment`, `${url}/extra`, `${url}//`,
  'https://manabox.app./decks/id', 'https://manabox.app:/decks/id', 'https://manabox.app/decks/a.b',
])('suppresses unsafe or repaired URL %j', value => {
  expect(safeManaBoxUrl(value)).toBeUndefined()
})

test('owner API retains links and serializes omission, null and verbatim replacement', async () => {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'synthetic' })
    if (!init?.method) return response([{ ...deck, manaBoxUrl: url }])
    return response({ ...deck, manaBoxUrl: url }, init.method === 'POST' ? 201 : 200)
  })
  vi.stubGlobal('fetch', fetchMock)
  expect((await listDecks())[0].manaBoxUrl).toBe(url)
  await createDeck({ name: deck.name, manaBoxUrl: url })
  await updateDeck(deck.id, { name: deck.name })
  await updateDeck(deck.id, { name: deck.name, manaBoxUrl: null })
  await updateDeck(deck.id, { name: deck.name, manaBoxUrl: `${url}/` })
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method).map(([, init]) => JSON.parse(init!.body as string))).toEqual([
    { name: deck.name, manaBoxUrl: url }, { name: deck.name }, { name: deck.name, manaBoxUrl: null }, { name: deck.name, manaBoxUrl: `${url}/` },
  ])
})

test('only the fresh detail reader retains optional links; history and deck selection ignore them', async () => {
  const game = recorded()
  game.participants[0].deck.manaBoxUrl = url
  vi.stubGlobal('fetch', vi.fn(async (path: string) => response(path.endsWith('/decks') ? [{ ...deckFor(2), manaBoxUrl: url }]
    : path.endsWith('/games') ? [game] : game)))
  expect((await getGame(group.id, game.id)).participants[0].deck.manaBoxUrl).toBe(url)
  expect((await getGame(group.id, game.id)).participants[1].deck).not.toHaveProperty('manaBoxUrl')
  expect((await listGames(group.id))[0].participants[0].deck).not.toHaveProperty('manaBoxUrl')
  expect((await memberDecks(group.id, uid(2)))[0]).not.toHaveProperty('manaBoxUrl')
})
