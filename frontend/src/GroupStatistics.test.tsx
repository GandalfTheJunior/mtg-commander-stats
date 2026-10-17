import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import type { GroupTab } from './groupNavigation'
import { gameAction } from './test/gameEntry'
import { selectTab } from './test/groupEntry'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp, goTo } from './test/renderApp'
import GameManager from './GameManager'
import { deferred, gameApi, group, recorded, response, uid, deckFor } from './test/gameFixtures'
import { statistics } from './test/statisticsFixtures'

const path = `/api/groups/${group.id}/statistics`
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function show() {
  const handlers = { onUnauthorized: vi.fn(), onAccessLost: vi.fn(), onCheckingAccess: vi.fn(), onGroupConfirmed: vi.fn() }
  function Harness() {
    const [tab, setTab] = useState<GroupTab>('statistics')
    return <><button onClick={() => setTab('games')}>Show games</button><button onClick={() => setTab('statistics')}>Show statistics</button>
      <GameManager group={group} actorId={uid(1)} tab={tab} {...handlers} /></>
  }
  return { ...render(<MemoryRouter><Harness /></MemoryRouter>), ...handlers }
}
async function games() {
  const trigger = screen.queryByRole('button', { name: 'Show games' })
  if (trigger) fireEvent.click(trigger)
  else await selectTab('Spiele')
}
async function stats() {
  const trigger = screen.queryByRole('button', { name: 'Show statistics' })
  if (trigger) fireEvent.click(trigger)
  else await selectTab('Statistiken')
}
const playerTable = () => screen.getByRole('table', { name: 'Player statistics' })
const deckTable = () => screen.getByRole('table', { name: 'Deck statistics' })
const statsCalls = (api: ReturnType<typeof gameApi>) => api.fetchMock.mock.calls.filter(([url]) => url === path)

function appSetup() {
  const api = gameApi([recorded()])
  api.state.statistics = statistics()
  const base = api.fetchMock
  const other = { ...group, id: uid(11), name: 'Sunday games' }
  const session = { user: { id: uid(1), username: 'Owner' } as { id: string; username: string } | null,
    logout: async () => { session.user = null; return new Response(null, { status: 204 }) } }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me') return response(session.user ?? {}, session.user ? 200 : 401)
    if (url === '/api/decks') return response([])
    if (url === '/api/groups') return response([group, other])
    if (url === `/api/groups/${other.id}`) return response(other)
    if (url === `/api/groups/${other.id}/games`) return response([])
    if (url === '/api/session' && init?.method === 'DELETE') return session.logout()
    if (url === '/api/session' && init?.method === 'POST') {
      session.user = { id: uid(4), username: 'Fourth' }
      return response(session.user)
    }
    return base(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { ...api, session, other }
}
async function open(name = group.name) {
  await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: `${name} (OWNER)` }))
  await selectTab('Statistiken')
}
async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'fourth@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Fourth')
}

test('shows loading then accessible server-ordered tables with demo rates, former users and archived decks', async () => {
  const api = gameApi()
  const pending = deferred()
  api.next(path, () => pending.promise)
  show()
  await screen.findByText('Loading statistics…')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await act(async () => pending.resolve(response(statistics())))
  expect(await screen.findByRole('heading', { name: 'Statistics' })).toBeInTheDocument()
  const players = within(playerTable())
  expect(players.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Player', 'Games', 'Wins', 'Win rate'])
  expect(players.getAllByRole('row').slice(1).map(row => row.textContent)).toEqual([
    `AdaUser ID: ${uid(1)}12650%`, `EmilUser ID: ${uid(2)}1218.33%`, `Former memberUser ID: ${uid(9)}400%`,
  ])
  const decks = within(deckTable())
  expect(decks.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Deck', 'Owner', 'Games', 'Wins', 'Win rate'])
  expect(decks.getByRole('row', { name: /Dragon Engine/ })).toHaveTextContent('66100%')
  expect(decks.getByRole('row', { name: /Patient Constructs/ })).toHaveTextContent('600%')
  expect(decks.getByRole('row', { name: /Old Artifacts/ })).toHaveTextContent('Archived')
  expect(decks.getByRole('row', { name: /Old Artifacts/ })).toHaveTextContent('Former member')
  expect(decks.getAllByRole('button')).toHaveLength(5)
  expect(decks.queryByRole('button', { name: /Edit|Archive|Delete/ })).not.toBeInTheDocument()
  expect(screen.queryByText('50.00%')).not.toBeInTheDocument()
})

test('keeps duplicate display names distinct by IDs and commander, preserving backend order on refresh', async () => {
  const api = gameApi()
  const data = statistics()
  data.players = data.players.slice(0, 2).map(row => ({ ...row, username: 'Same name' }))
  data.decks = data.decks.slice(0, 2).map(row => ({ ...row, name: 'Same deck' }))
  api.state.statistics = data
  show()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  expect(within(playerTable()).getAllByRole('rowheader')).toHaveLength(2)
  const firstIds = within(playerTable()).getAllByRole('rowheader').map(row => row.textContent)
  expect(firstIds).toEqual([`Same nameUser ID: ${uid(1)}`, `Same nameUser ID: ${uid(2)}`])
  api.state.statistics = { players: [...data.players].reverse(), decks: [...data.decks].reverse() }
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await stats()
  await waitFor(() => expect(within(playerTable()).getAllByRole('rowheader').map(row => row.textContent)).toEqual([...firstIds].reverse()))
  expect(within(deckTable()).getAllByRole('rowheader')[0]).toHaveTextContent('Karn, Silver Golem')
  expect(within(deckTable()).getAllByRole('rowheader')[1]).toHaveTextContent('The Ur-Dragon')
})

test('empty history shows a concise empty state with no invented active-member or unused-deck rows', async () => {
  gameApi(); show()
  await stats()
  await screen.findByText(/No statistics yet/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test.each(['network', 'server', 'malformed', 'json'])('failed refresh (%s) hides old rows and offers a successful explicit retry', async failure => {
  const api = gameApi()
  api.state.statistics = statistics()
  show(); await screen.findByRole('table', { name: 'Player statistics' })
  api.next(path, () => {
    if (failure === 'network') throw new Error('Network unavailable')
    if (failure === 'json') return new Response('invalid json')
    return response(failure === 'server' ? { detail: 'Statistics unavailable.' } : { players: [{}], decks: [] }, failure === 'server' ? 500 : 200)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('Refresh statistics to try again.')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('create, edit and delete refresh actual backend statistics only after acknowledgment; cancellations do nothing', async () => {
  const api = appSetup(); api.state.history = []; api.state.statistics = { players: [], decks: [] }; renderApp(<App />, `/playgroups/${group.id}`)
  await stats()
  await screen.findByText(/No statistics yet/)
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Spiel erfassen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel game' }))
  expect(statsCalls(api)).toHaveLength(1)
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Spiel erfassen' }))
  for (const n of [1, 2]) fireEvent.change(screen.getByLabelText(`Player ${n}`), { target: { value: uid(n + 1) } })
  await waitFor(() => expect(screen.getByLabelText('Deck for player 1')).not.toBeDisabled())
  for (const n of [1, 2]) fireEvent.change(screen.getByLabelText(`Deck for player ${n}`), { target: { value: deckFor(n + 1).id } })
  fireEvent.change(screen.getByLabelText('Winning player'), { target: { value: uid(2) } })
  const pending = deferred()
  api.next(`/api/groups/${group.id}/games`, () => pending.promise, 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Record game' }))
  await screen.findByRole('button', { name: 'Saving game…' })
  await stats()
  expect(statsCalls(api)).toHaveLength(1)
  await stats()
  expect(screen.getByText(/No statistics yet/)).toBeInTheDocument()
  api.state.history = [recorded()]
  api.state.statistics = statistics()
  await act(async () => pending.resolve(response(recorded(), 201)))
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  expect(statsCalls(api)).toHaveLength(2)
  await games()
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Edit game' })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel game' }))
  await games()
  await gameAction('Löschen')
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Zurück zu Spiele' }))
  expect(statsCalls(api)).toHaveLength(2)
  await games()
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Edit game' })
  fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save game' })).not.toBeDisabled())
  api.state.statistics = { ...statistics(), players: [{ ...statistics().players[0], wins: 0, winRatePercent: 0 }] }
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await screen.findByText('Game updated.')
  await stats()
  await waitFor(() => expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('1200%'))
  expect(statsCalls(api)).toHaveLength(3)
  api.state.statistics = { players: [], decks: [] }
  await games()
  await gameAction('Löschen')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.')
  await stats()
  await screen.findByText(/No statistics yet/)
  expect(statsCalls(api)).toHaveLength(4)
})

test('a failed game write fabricates no statistics and explicit game refresh reloads unchanged server figures', async () => {
  const api = appSetup(); renderApp(<App />, `/playgroups/${group.id}`)
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  api.next(`/api/groups/${group.id}/games/${uid(20)}`, () => response({}, 409), 'DELETE')
  await games()
  await gameAction('Löschen')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText(/Die Löschung wurde nicht bestätigt/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByText('Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.')).not.toBeInTheDocument()
  expect(statsCalls(api)).toHaveLength(1)
  fireEvent.click(await screen.findByRole('link', { name: 'Zurück zu Spiele' }))
  await screen.findByRole('article')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  expect(statsCalls(api)).toHaveLength(2)
})

test('loads statistics only after a confirmed session and opened group, and current 401 expires the session', async () => {
  const api = appSetup(); renderApp(<App />, '/playgroups')
  await screen.findByRole('button', { name: `${group.name} (OWNER)` })
  expect(statsCalls(api)).toHaveLength(0)
  api.next(path, () => response({}, 401))
  await open()
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('heading', { name: 'Statistics' })).not.toBeInTheDocument()
})

test.each([403, 404])('statistics %s hides all protected details during a safe recheck, then permits retry on confirmed membership', async status => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const checking = deferred()
  api.next(path, () => response({}, status))
  api.next(`/api/groups/${group.id}`, () => checking.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await screen.findByText('Checking group access…')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  await act(async () => checking.resolve(response(group)))
  await screen.findByRole('tab', { name: 'Mitglieder' })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Owner')
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
})

test.each([403, 404, 401, 500])('statistics denial followed by access-check %s never restores protected statistics', async status => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  api.next(path, () => response({}, 403))
  api.next(`/api/groups/${group.id}`, () => response({}, status))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  if (status === 401) await screen.findByText('Your session expired. Sign in again.')
  else if (status === 500) await screen.findByText(/Group access could not be verified/)
  else await screen.findByText(/Diese Playgroup ist nicht verfügbar/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
})

test.each(['switch', 'close', 'members', 'games'].flatMap(action => [200, 401].map(status => ({ action, status }))))('retiring statistics on $action aborts requests and ignores late status $status', async ({ action, status }) => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const late = deferred()
  api.next(path, () => late.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await screen.findByText('Loading statistics…')
  const signal = statsCalls(api).at(-1)![1]!.signal!
  api.state.statistics = { players: [], decks: [] }
  if (action === 'switch') {
    api.next(`/api/groups/${api.other.id}/statistics`, () => response({ players: [], decks: [] }))
    await open(api.other.name)
  } else if (action === 'close') fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' }))
  else if (action === 'members') {
    await selectTab('Mitglieder')
    fireEvent.click(screen.getByRole('button', { name: 'Mitglieder aktualisieren' }))
    await screen.findByRole('tab', { name: 'Statistiken' }); await stats()
  } else { await games(); fireEvent.click(screen.getByRole('button', { name: 'Refresh games' })); await stats() }
  expect(signal.aborted).toBe(true)
  if (action === 'close') {
    expect(screen.queryByRole('heading', { name: 'Statistics' })).not.toBeInTheDocument()
    await open()
  }
  await stats()
  await screen.findByText(/No statistics yet/)
  await act(async () => late.resolve(response(statistics(), status)))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Owner')
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
})

test.each([200, 401, 403])('logout hides statistics immediately and late status %s cannot restore them or expire the new identity', async status => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const late = deferred()
  api.next(path, () => late.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await screen.findByText('Loading statistics…')
  const logout = deferred()
  api.session.logout = () => logout.promise
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('heading', { name: 'Statistics' })).not.toBeInTheDocument()
  await act(async () => logout.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Logged out.')
  await signIn()
  await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  await act(async () => late.resolve(response(statistics(), status)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Fourth')
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
})

test('switching a loaded group hides its statistics while the next group details are still pending', async () => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const details = deferred()
  // The second group's details use the App fixture's branch, so intercept that request here.
  const previousFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url === `/api/groups/${api.other.id}`
    ? details.promise : previousFetch(url, init)))
  await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: `${api.other.name} (OWNER)` }))
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  expect(screen.queryByRole('heading', { name: 'Statistics' })).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  api.state.statistics = { players: [], decks: [] }
  await act(async () => details.resolve(response(api.other)))
  await stats()
  await screen.findByText(/No statistics yet/)
})

test('logout immediately removes loaded statistics even while logout acknowledgment is pending', async () => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const logout = deferred()
  api.session.logout = () => logout.promise
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Statistics' })).not.toBeInTheDocument()
  await act(async () => logout.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Logged out.')
})


function sortedIds(table: HTMLElement) {
  return within(table).getAllByRole('rowheader').map(header =>
    header.textContent!.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)![0])
}

function sortingData() {
  const data = statistics()
  data.players = [
    { ...data.players[0], games: 12, wins: 6 },
    { ...data.players[1], games: 9, wins: 1 },
    { ...data.players[2], games: 2, wins: 0 },
    { ...data.players[0], userId: uid(4), username: 'Zed', games: 100, wins: 100, winRatePercent: 100 },
  ]
  data.decks = data.players.map((row, index) => ({ ...data.decks[0], deckId: uid(101 + index),
    games: row.games, wins: row.wins, winRatePercent: row.winRatePercent }))
  return data
}

test.each(['players', 'decks'] as const)('every numeric %s heading sorts numbers descending then ascending, with independent accessible state', async kind => {
  const api = gameApi(); api.state.statistics = sortingData(); show()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const table = () => kind === 'players' ? playerTable() : deckTable()
  const other = () => kind === 'players' ? deckTable() : playerTable()
  const base = kind === 'players' ? [uid(1), uid(2), uid(9), uid(4)] : [101, 102, 103, 104].map(uid)
  const untouched = sortedIds(other())
  expect(sortedIds(table())).toEqual(base)
  expect(within(table()).getAllByRole('columnheader').every(header => !header.hasAttribute('aria-sort'))).toBe(true)
  for (const label of ['Win rate', 'Games', 'Wins']) {
    fireEvent.click(within(table()).getByRole('button', { name: label }))
    expect(sortedIds(table())).toEqual([base[3], base[0], base[1], base[2]])
    const active = within(table()).getByRole('columnheader', { name: label })
    expect(active).toHaveAttribute('aria-sort', 'descending')
    expect(active).toHaveTextContent('↓')
    expect(table().querySelectorAll('th[aria-sort]')).toHaveLength(1)
    fireEvent.click(within(table()).getByRole('button', { name: label }))
    expect(sortedIds(table())).toEqual([base[2], base[1], base[0], base[3]])
    expect(active).toHaveAttribute('aria-sort', 'ascending')
    expect(active).toHaveTextContent('↑')
    expect(sortedIds(other())).toEqual(untouched)
  }
  expect(statsCalls(api)).toHaveLength(1) // Presentation-only sorting never makes an API call.
})

test.each([
  ['players', 'Player'], ['decks', 'Deck'], ['decks', 'Owner'],
] as const)('%s %s heading sorts mixed-case text, retaining backend ID order for equal names in both directions', async (kind, label) => {
  const api = gameApi(), data = sortingData()
  const labels = ['beta', 'ALPHA', 'alpha', 'Zoo']
  data.players = data.players.map((row, index) => ({ ...row, username: labels[index] }))
  data.decks = data.decks.map((row, index) => ({ ...row, name: labels[index], ownerUsername: labels[index] }))
  api.state.statistics = data; show()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  const table = kind === 'players' ? playerTable() : deckTable()
  const base = sortedIds(table)
  fireEvent.click(within(table).getByRole('button', { name: label }))
  expect(sortedIds(table)).toEqual([base[1], base[2], base[0], base[3]])
  expect(within(table).getByRole('columnheader', { name: label })).toHaveAttribute('aria-sort', 'ascending')
  fireEvent.click(within(table).getByRole('button', { name: label }))
  expect(sortedIds(table)).toEqual([base[3], base[0], base[1], base[2]])
  expect(within(table).getByRole('columnheader', { name: label })).toHaveAttribute('aria-sort', 'descending')
})

test('numeric ties use the backend order rather than the prior text sort or reversed tie order', async () => {
  const api = gameApi(), data = statistics()
  data.players = data.players.map(row => ({ ...row, games: 12, wins: 0, winRatePercent: 0 }))
  api.state.statistics = data; show()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Player' }))
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Player' }))
  expect(sortedIds(playerTable())).toEqual([uid(9), uid(2), uid(1)])
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Wins' }))
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2), uid(9)])
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Wins' }))
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2), uid(9)])
})

test('both table choices re-sort fresh server rows on statistics and game refresh', async () => {
  const api = gameApi(); api.state.statistics = statistics(); show()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Win rate' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Wins' }))
  const updated = statistics()
  updated.players[2] = { ...updated.players[2], wins: 4, winRatePercent: 100 }
  updated.decks[2] = { ...updated.decks[2], games: 10, wins: 10, winRatePercent: 100 }
  api.state.statistics = updated
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await stats()
  await waitFor(() => expect(sortedIds(playerTable())).toEqual([uid(9), uid(1), uid(2)]))
  expect(sortedIds(deckTable())).toEqual([uid(109), uid(101), uid(102)])
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await stats()
  await waitFor(() => expect(within(playerTable()).getByRole('columnheader', { name: 'Win rate' })).toHaveAttribute('aria-sort', 'descending'))
  expect(sortedIds(playerTable())).toEqual([uid(9), uid(1), uid(2)])
  expect(within(deckTable()).getByRole('columnheader', { name: 'Wins' })).toHaveAttribute('aria-sort', 'descending')
  expect(sortedIds(deckTable())).toEqual([uid(109), uid(101), uid(102)])
})

test('an acknowledged game write retains the chosen sort and applies it to newly fetched values', async () => {
  const api = gameApi([recorded()]); api.state.statistics = statistics(); show()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Win rate' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Owner' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Owner' }))
  const updated = statistics()
  updated.players[2] = { ...updated.players[2], wins: 4, winRatePercent: 100 }
  api.state.statistics = updated
  await games()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  for (const n of [1, 2]) fireEvent.change(screen.getByLabelText(`Player ${n}`), { target: { value: uid(n + 1) } })
  await waitFor(() => expect(screen.getByLabelText('Deck for player 1')).not.toBeDisabled())
  for (const n of [1, 2]) fireEvent.change(screen.getByLabelText(`Deck for player ${n}`), { target: { value: deckFor(n + 1).id } })
  fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Record game' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Record game' }))
  await screen.findByText('Game recorded.')
  await stats()
  await waitFor(() => expect(sortedIds(playerTable())).toEqual([uid(9), uid(1), uid(2)]))
  expect(within(playerTable()).getByRole('columnheader', { name: 'Win rate' })).toHaveAttribute('aria-sort', 'descending')
  expect(within(deckTable()).getByRole('columnheader', { name: 'Owner' })).toHaveAttribute('aria-sort', 'descending')
  expect(sortedIds(deckTable())).toEqual([uid(109), uid(101), uid(102)])
})

test.each(['close', 'switch', 'session'] as const)('%s discards previous sort choices along with protected statistics', async action => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Win rate' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Wins' }))
  if (action === 'close') {
    fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' })); await open()
  } else if (action === 'switch') await open(api.other.name)
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByText('Logged out.'); await signIn(); await open()
  }
  await stats()
  await screen.findByRole('table', { name: 'Player statistics' })
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2), uid(9)])
  expect(sortedIds(deckTable())).toEqual([uid(101), uid(102), uid(109)])
  for (const table of [playerTable(), deckTable()]) expect(table.querySelector('th[aria-sort]')).toBeNull()
})
