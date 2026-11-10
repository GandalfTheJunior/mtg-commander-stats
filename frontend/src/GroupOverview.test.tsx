import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import GroupPage from './GroupPage'
import { renderApp } from './test/renderApp'
import { deferred, group, recorded, response, uid } from './test/gameFixtures'
import { emptyStatistics, statistics } from './test/statisticsFixtures'
import { archiveEmpty, gamesEmpty } from './GroupOverview'
import { spotlightPlayers } from './statisticsOrder'
import { recentGames } from './api'

const base = `/api/groups/${group.id}`
function setup(games: unknown[] = [{ ...recorded(), playedOn: '2026-11-01' }], stats = statistics()) {
  const mock = vi.fn((path: string, init?: RequestInit) => {
    void init
    return Promise.resolve(response(path === base ? group : path.endsWith('/history') ? { games, nextCursor: null } : stats))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
function show(unauthorized = vi.fn(), notice = vi.fn()) {
  return renderApp(<Routes>
    <Route path="/playgroups/:groupId" element={<GroupPage tab="overview" currentUser={{ id: uid(1), username: 'Owner' }} onUnauthorized={unauthorized} onNotice={notice} />} />
    <Route path="/playgroups" element={<p>Collection</p>} />
  </Routes>, `/playgroups/${group.id}`)
}
afterEach(() => vi.unstubAllGlobals())

test('Overview shows one compact spotlight and three games with group-scoped destinations', async () => {
  const games = Array.from({ length: 4 }, (_, i) => ({ ...recorded({ id: uid(20 + i) }), playedOn: `2026-11-0${4 - i}` }))
  const fetchMock = setup(games)
  show()
  const list = await screen.findByRole('list', { name: 'Letzte Spiele' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  expect(within(list).getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(games.slice(0, 3).map(game => `/playgroups/${group.id}/games/${game.id}`))
  expect(within(list).getAllByText('Deck: Deck 2')).toHaveLength(3)
  expect(within(list).getAllByText(/Gespielt am/).map(el => el.textContent)).toEqual(['Gespielt am: 04.11.2026', 'Gespielt am: 03.11.2026', 'Gespielt am: 02.11.2026'])
  expect(within(list).queryByText(/Erfasst am|Teilnehmende/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Spiel erfassen' })).toHaveAttribute('href', `/playgroups/${group.id}/games/new`)
  expect(screen.getByRole('link', { name: 'Alle Spiele anzeigen' })).toHaveAttribute('href', `/playgroups/${group.id}/games`)
  expect(screen.getByRole('link', { name: /Alle Spielerstatistiken ansehen/ })).toHaveAttribute('href', `/playgroups/${group.id}/statistics/reports/players`)
  expect(screen.getAllByRole('heading', { name: 'Gesamtsiegquote pro Spieler' })).toHaveLength(1)
  expect(within(screen.getByRole('list', { name: 'Gesamtsiegquoten' })).getAllByRole('listitem')).toHaveLength(3)
  expect(screen.getByText('8,33 %')).toBeInTheDocument()
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([base, `${base}/games/history`, `${base}/statistics`])
})

test('draws and unknown dates never invent a winner, deck or recording date', async () => {
  setup([{ ...recorded({ result: 'DRAW', winnerUserId: null }), playedOn: null }])
  show()
  const list = await screen.findByRole('list', { name: 'Letzte Spiele' })
  expect(within(list).getByText('Unentschieden')).toBeInTheDocument()
  expect(within(list).getByText('Spieldatum unbekannt')).toBeInTheDocument()
  expect(within(list).queryByText(/Deck:|16.10.2026/)).not.toBeInTheDocument()
  expect(within(list).queryByRole('img', { hidden: true })).not.toBeInTheDocument()
})

test('zero games keeps exact approved copy and report link with only one record action', async () => {
  setup([], emptyStatistics())
  show()
  expect(await screen.findByText(gamesEmpty)).toBeInTheDocument()
  expect(await screen.findByText(archiveEmpty)).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Spiel erfassen' })).toHaveLength(1)
  expect(screen.getByRole('link', { name: /Alle Spielerstatistiken ansehen/ })).toHaveAttribute('href', `/playgroups/${group.id}/statistics/reports/players`)
})

test('player selection follows #197: most games, alphabetical names, stable UUID; no minimum sample gate', () => {
  const rows = [
    { userId: uid(4), username: 'Zed', games: 1, wins: 1, winRatePercent: 100 },
    { userId: uid(3), username: 'Ada', games: 1, wins: 0, winRatePercent: 0 },
    { userId: uid(2), username: 'Ada', games: 1, wins: 0, winRatePercent: 0 },
    { userId: uid(1), username: 'Zed', games: 2, wins: 0, winRatePercent: 0 },
  ]
  expect(spotlightPlayers(rows).map(row => row.userId)).toEqual([uid(1), uid(2), uid(3)])
  expect(rows[0].userId).toBe(uid(4))
})

test('loading and retryable errors are distinct from empty data, and requests recover independently', async () => {
  const pending = deferred()
  const fetchMock = setup([], emptyStatistics())
  fetchMock.mockImplementationOnce(() => Promise.resolve(response(group)))
    .mockImplementationOnce(() => pending.promise)
    .mockImplementationOnce(() => Promise.resolve(response({}, 503)))
  show()
  expect(await screen.findByText('Letzte Spiele werden geladen…')).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('Die Spielerstatistik konnte nicht geladen werden.')
  expect(screen.queryByText(archiveEmpty)).not.toBeInTheDocument()
  expect(screen.queryByText(gamesEmpty)).not.toBeInTheDocument()
  await act(async () => pending.resolve(response({ games: [], nextCursor: null })))
  expect(await screen.findByText(gamesEmpty)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Übersicht erneut laden' }))
  expect(await screen.findByText(archiveEmpty)).toBeInTheDocument()
})

test.each([401, 403, 404])('overview read denial %s retires both requests and protected group data', async status => {
  const pending = deferred()
  const fetchMock = setup()
  fetchMock.mockImplementationOnce(() => Promise.resolve(response(group)))
    .mockImplementationOnce(() => Promise.resolve(response({}, status)))
    .mockImplementationOnce(() => pending.promise)
  const unauthorized = vi.fn()
  show(unauthorized)
  await waitFor(() => expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument())
  if (status === 401) await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce())
  else expect(await screen.findByText('Collection')).toBeInTheDocument()
  await act(async () => pending.resolve(response(statistics())))
  expect(screen.queryByText('Ada')).not.toBeInTheDocument()
})

test.each([200, 401])('leaving Overview ignores a late statistics response with status %s', async status => {
  const pending = deferred()
  const fetchMock = setup()
  fetchMock.mockImplementationOnce(() => Promise.resolve(response(group)))
    .mockImplementationOnce(() => Promise.resolve(response({ games: [], nextCursor: null })))
    .mockImplementationOnce(() => pending.promise)
  const unauthorized = vi.fn()
  show(unauthorized)
  await screen.findByText(gamesEmpty)
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' }))
  await screen.findByText('Collection')
  await act(async () => pending.resolve(response(statistics(), status)))
  expect(screen.queryByText('Ada')).not.toBeInTheDocument()
  expect(unauthorized).not.toHaveBeenCalled()
})

test.each(['2026-02-29', '2026-13-01', '2026-11-01T00:00:00Z', '', 123, undefined])('invalid play date %s fails without substituting recordedAt', async playedOn => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ games: [{ ...recorded(), playedOn }], nextCursor: null })))
  await expect(recentGames(group.id)).rejects.toThrow()
})

test('bounded preview accepts legacy null seats/ranks and preserves server date order', async () => {
  const known = { ...recorded(), playedOn: '2024-02-29', participants: recorded().participants.map(person => ({ ...person, startPosition: null, placement: null })) }
  const unknown = { ...recorded({ id: uid(21) }), playedOn: null }
  const fetchMock = setup([known, unknown])
  const signal = new AbortController().signal
  expect((await recentGames(group.id, signal)).map(game => game.playedOn)).toEqual(['2024-02-29', null])
  expect(fetchMock).toHaveBeenCalledWith(`${base}/games/history`, { credentials: 'same-origin', signal })
})

test.each([
  { games: null, nextCursor: null },
  { games: [], nextCursor: 1 },
  { games: Array.from({ length: 21 }, (_, i) => ({ ...recorded({ id: uid(20 + i) }), playedOn: null })), nextCursor: null },
  { games: [{ ...recorded(), groupId: uid(99), playedOn: null }], nextCursor: null },
  { games: [{ ...recorded(), winnerUserId: uid(99), playedOn: null }], nextCursor: null },
  { games: [{ ...recorded(), playedOn: null }, { ...recorded(), playedOn: null }], nextCursor: null },
])('malformed or mismatched history fails closed: %j', async body => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)))
  await expect(recentGames(group.id)).rejects.toThrow()
})
