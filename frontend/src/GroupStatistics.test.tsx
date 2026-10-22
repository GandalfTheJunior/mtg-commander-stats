import { savedCommander } from './test/commanderFixtures'
import { useState } from 'react'
import type { GroupTab } from './groupNavigation'
import { gameAction, selectGameDeck } from './test/gameEntry'
import { selectTab } from './test/groupEntry'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
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
  return { ...renderApp(<Harness />), ...handlers }
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
const playerTable = () => { selectView('Spieler'); return screen.getByRole('table', { name: 'Spielerstatistiken' }) }
const deckTable = () => { selectView('Decks'); return screen.getByRole('table', { name: 'Deckstatistiken' }) }
const viewButton = (name: 'Spieler' | 'Decks') => within(screen.getByRole('group', { name: 'Statistikansicht' })).getByRole('button', { name })
function selectView(name: 'Spieler' | 'Decks') { if (viewButton(name).getAttribute('aria-pressed') !== 'true') fireEvent.click(viewButton(name)) }
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
  fireEvent.click(await screen.findByRole('button', { name }))
  await selectTab('Statistiken')
}
async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'fourth@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Fourth')
}

test('shows loading then the selected server-ordered dataset with API rates, former users and archived decks', async () => {
  const api = gameApi(), pending = deferred()
  api.next(path, () => pending.promise)
  show()
  await screen.findByText('Statistiken werden geladen…')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(viewButton('Spieler')).toHaveAttribute('aria-pressed', 'true')
  await act(async () => pending.resolve(response(statistics())))
  const players = within(playerTable())
  expect(players.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Spieler', 'Spiele', 'Siege', 'Siegrate'])
  expect(players.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent))).toEqual([
    ['12', '6', '50%'], ['12', '1', '8.33%'], ['4', '0', '0%'],
  ])
  expect(players.getByRole('row', { name: /Former member/ })).toBeInTheDocument()
  expect(screen.queryByText(`Spielerkennung: ${uid(1)}`)).not.toBeInTheDocument()
  const decks = within(deckTable())
  expect(screen.getAllByRole('table')).toHaveLength(1)
  expect(screen.queryByRole('table', { name: 'Spielerstatistiken' })).not.toBeInTheDocument()
  expect(decks.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Deck', 'Besitzer', 'Spiele', 'Siege', 'Siegrate'])
  expect(decks.getByRole('row', { name: /Dragon Engine/ })).toHaveTextContent('66100%')
  expect(decks.getByRole('row', { name: /Patient Constructs/ })).toHaveTextContent('600%')
  expect(decks.getByRole('row', { name: /Old Artifacts/ })).toHaveTextContent('Archiviert')
  expect(decks.getByRole('row', { name: /Old Artifacts/ })).toHaveTextContent('Former member')
  expect(decks.queryByRole('button', { name: /Edit|Archive|Delete/ })).not.toBeInTheDocument()
  expect(screen.queryByText('50.00%')).not.toBeInTheDocument()
})

test('namesakes reveal distinct complete identifiers only on request, preserving fresh API order', async () => {
  const api = gameApi(), data = statistics()
  data.players = data.players.slice(0, 2).map(row => ({ ...row, username: 'Same name' }))
  data.decks = data.decks.slice(0, 2).map(row => ({ ...row, name: 'Same deck' }))
  api.state.statistics = data
  show()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(screen.queryByText(`Spielerkennung: ${uid(1)}`)).not.toBeInTheDocument()
  const disclosures = within(playerTable()).getAllByRole('button', { name: /Kennung anzeigen/ })
  expect(disclosures[0]).not.toHaveAccessibleName(disclosures[1].getAttribute('aria-label')!)
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2)])
  api.state.statistics = { players: [...data.players].reverse(), decks: [...data.decks].reverse() }
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await waitFor(() => expect(sortedIds(playerTable())).toEqual([uid(2), uid(1)]))
  const decks = deckTable()
  expect(within(decks).getAllByRole('rowheader')[0]).toHaveTextContent('Karn, Silver Golem')
  expect(within(decks).getAllByRole('rowheader')[1]).toHaveTextContent('The Ur-Dragon')
  const disclosure = within(decks).getAllByRole('button', { name: /Kennung anzeigen/ })[0]
  disclosure.focus(); fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  expect(disclosure).toHaveFocus()
  expect(screen.getByText(`Deckkennung: ${uid(102)}`)).toBeVisible()
  expect(screen.getByText(`Besitzerkennung: ${uid(1)}`)).toBeVisible()
  fireEvent.click(disclosure)
  expect(screen.queryByText(`Deckkennung: ${uid(102)}`)).not.toBeInTheDocument()
})

test('empty history shows a concise empty state with no invented active-member or unused-deck rows', async () => {
  gameApi(); show()
  await stats()
  await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test.each(['network', 'server', 'malformed', 'json', 'bad-request', 'conflict'])('failed refresh (%s) hides old rows and offers a successful explicit retry', async failure => {
  const api = gameApi()
  api.state.statistics = statistics()
  show(); await screen.findByRole('table', { name: 'Spielerstatistiken' })
  api.next(path, () => {
    if (failure === 'network') throw new Error('Network unavailable')
    if (failure === 'json') return new Response('invalid json')
    if (failure === 'bad-request' || failure === 'conflict') return response({}, failure === 'bad-request' ? 400 : 409)
    return response(failure === 'server' ? { detail: 'Statistics unavailable.' } : { players: [{}], decks: [] }, failure === 'server' ? 500 : 200)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('Zum erneuten Versuch Statistiken aktualisieren.')
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('only acknowledged game creation refreshes visited statistics; canceled creation does nothing', async () => {
  const api = appSetup(); api.state.history = []; api.state.statistics = { players: [], decks: [] }; renderApp(<App />, `/playgroups/${group.id}`)
  await stats()
  await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Spiel erfassen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(statsCalls(api)).toHaveLength(1)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Spiel erfassen' }))
  for (const n of [1, 2]) fireEvent.change(screen.getByRole('combobox', { name: `Spieler ${n}` }), { target: { value: uid(n + 1) } })
  for (const n of [1, 2]) await selectGameDeck(n, deckFor(n + 1))
  fireEvent.change(screen.getByRole('combobox', { name: 'Gewinner' }), { target: { value: uid(2) } })
  const pending = deferred()
  api.next(`/api/groups/${group.id}/games`, () => pending.promise, 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('button', { name: 'Spiel wird gespeichert…' })
  await stats()
  expect(statsCalls(api)).toHaveLength(1)
  expect(screen.getByText(/Noch keine (Spieler|Deck)statistiken/)).toBeInTheDocument()
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  api.state.history = [recorded()]
  api.state.statistics = statistics()
  await act(async () => pending.resolve(response(recorded(), 201)))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  expect(statsCalls(api)).toHaveLength(2)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test('only acknowledged game edits refresh visited statistics; canceled edits do nothing', async () => {
  const api = appSetup(); renderApp(<App />, `/playgroups/${group.id}`)
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(statsCalls(api)).toHaveLength(1)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  await games()
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  const pending = deferred()
  api.next(`/api/groups/${group.id}/games/${uid(20)}`, () => pending.promise, 'PUT')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('button', { name: 'Spiel wird gespeichert…' })
  await stats()
  expect(statsCalls(api)).toHaveLength(2)
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  expect(screen.queryByText('Game updated.')).not.toBeInTheDocument()
  api.state.history = [recorded({ result: 'DRAW', winnerUserId: null })]
  api.state.statistics = { ...statistics(), players: [{ ...statistics().players[0], wins: 0, winRatePercent: 0 }] }
  await act(async () => pending.resolve(response(api.state.history[0])))
  await waitFor(() => expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('1200%'))
  expect(statsCalls(api)).toHaveLength(3)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
})

test('acknowledged game deletion reloads server statistics; canceled deletion sends no write', async () => {
  const api = appSetup(); renderApp(<App />, `/playgroups/${group.id}`)
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  await games()
  await gameAction('Löschen')
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Zurück zu Spiele' }))
  expect(statsCalls(api)).toHaveLength(1)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  await games()
  await gameAction('Löschen')
  const pending = deferred()
  api.next(`/api/groups/${group.id}/games/${uid(20)}`, () => pending.promise, 'DELETE')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('Löschung und Serverstand werden geprüft…')
  expect(statsCalls(api)).toHaveLength(2)
  expect(screen.queryByText('Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.')).not.toBeInTheDocument()
  api.state.history = []
  api.state.statistics = { players: [], decks: [] }
  await act(async () => pending.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.')
  await stats()
  await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  expect(statsCalls(api)).toHaveLength(3)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
})

test('a failed game write fabricates no statistics and explicit game refresh reloads unchanged server figures', async () => {
  const api = appSetup(); renderApp(<App />, `/playgroups/${group.id}`)
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
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
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(playerTable()).getByRole('row', { name: /Ada/ })).toHaveTextContent('12650%')
  expect(statsCalls(api)).toHaveLength(2)
})

test('loads statistics only after a confirmed session and opened group, and current 401 expires the session', async () => {
  const api = appSetup(); renderApp(<App />, '/playgroups')
  await screen.findByRole('button', { name: group.name })
  expect(statsCalls(api)).toHaveLength(0)
  api.next(path, () => response({}, 401))
  await open()
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
})

test.each([403, 404])('statistics %s hides all protected details during a safe recheck, then permits retry on confirmed membership', async status => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const checking = deferred()
  api.next(path, () => response({}, status))
  api.next(`/api/groups/${group.id}`, () => checking.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
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
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
})

test.each([403, 404, 401, 500])('statistics denial followed by access-check %s never restores protected statistics', async status => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  api.next(path, () => response({}, 403))
  api.next(`/api/groups/${group.id}`, () => response({}, status))
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  if (status === 401) await screen.findByText('Your session expired. Sign in again.')
  else if (status === 500) await screen.findByText(/Group access could not be verified/)
  else await screen.findByText(/Diese Playgroup ist nicht verfügbar/)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
})

test.each(['switch', 'close', 'members', 'games'].flatMap(action => [200, 401].map(status => ({ action, status }))))('retiring statistics on $action aborts requests and ignores late status $status', async ({ action, status }) => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const late = deferred()
  api.next(path, () => late.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await screen.findByText('Statistiken werden geladen…')
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
    expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
    await open()
  }
  await stats()
  await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  await act(async () => late.resolve(response(statistics(), status)))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Owner')
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
})

test.each([200, 401, 403])('logout hides statistics immediately and late status %s cannot restore them or expire the new identity', async status => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const late = deferred()
  api.next(path, () => late.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await screen.findByText('Statistiken werden geladen…')
  const logout = deferred()
  api.session.logout = () => logout.promise
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
  await act(async () => logout.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Logged out.')
  await signIn()
  await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  await act(async () => late.resolve(response(statistics(), status)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Fourth')
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
})

test('switching a loaded group hides its statistics while the next group details are still pending', async () => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const details = deferred()
  // The second group's details use the App fixture's branch, so intercept that request here.
  const previousFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url === `/api/groups/${api.other.id}`
    ? details.promise : previousFetch(url, init)))
  await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: api.other.name }))
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  api.state.statistics = { players: [], decks: [] }
  await act(async () => details.resolve(response(api.other)))
  await stats()
  await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
})

test('logout immediately removes loaded statistics even while logout acknowledgment is pending', async () => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const logout = deferred()
  api.session.logout = () => logout.promise
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
  await act(async () => logout.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Logged out.')
})


function sortedIds(table: HTMLElement) {
  for (const button of within(table).queryAllByRole('button', { name: /Kennung anzeigen/ })) fireEvent.click(button)
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
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const table = () => kind === 'players' ? playerTable() : deckTable()
  const other = () => kind === 'players' ? deckTable() : playerTable()
  const base = kind === 'players' ? [uid(1), uid(2), uid(9), uid(4)] : [101, 102, 103, 104].map(uid)
  const untouched = sortedIds(other())
  expect(sortedIds(table())).toEqual(base)
  expect(within(table()).getAllByRole('columnheader').every(header => !header.hasAttribute('aria-sort'))).toBe(true)
  for (const label of ['Siegrate', 'Spiele', 'Siege']) {
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
  ['players', 'Spieler'], ['decks', 'Deck'], ['decks', 'Besitzer'],
] as const)('%s %s heading sorts mixed-case text, retaining backend ID order for equal names in both directions', async (kind, label) => {
  const api = gameApi(), data = sortingData()
  const labels = ['beta', 'ALPHA', 'alpha', 'Zoo']
  data.players = data.players.map((row, index) => ({ ...row, username: labels[index] }))
  data.decks = data.decks.map((row, index) => ({ ...row, name: labels[index], ownerUsername: labels[index] }))
  api.state.statistics = data; show()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
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
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Spieler' }))
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Spieler' }))
  expect(sortedIds(playerTable())).toEqual([uid(9), uid(2), uid(1)])
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Siege' }))
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2), uid(9)])
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Siege' }))
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2), uid(9)])
})

test('both table choices re-sort fresh server rows on statistics and game refresh', async () => {
  const api = gameApi(); api.state.statistics = statistics(); show()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Siegrate' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Siege' }))
  const updated = statistics()
  updated.players[2] = { ...updated.players[2], wins: 4, winRatePercent: 100 }
  updated.decks[2] = { ...updated.decks[2], games: 10, wins: 10, winRatePercent: 100 }
  api.state.statistics = updated
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await stats()
  await waitFor(() => expect(sortedIds(playerTable())).toEqual([uid(9), uid(1), uid(2)]))
  expect(sortedIds(deckTable())).toEqual([uid(109), uid(101), uid(102)])
  await games()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await stats()
  await waitFor(() => expect(within(playerTable()).getByRole('columnheader', { name: 'Siegrate' })).toHaveAttribute('aria-sort', 'descending'))
  expect(sortedIds(playerTable())).toEqual([uid(9), uid(1), uid(2)])
  expect(within(deckTable()).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
  expect(sortedIds(deckTable())).toEqual([uid(109), uid(101), uid(102)])
})

test('an acknowledged game write retains the chosen sort and applies it to newly fetched values', async () => {
  const api = gameApi([recorded()]); api.state.statistics = statistics(); show()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Siegrate' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Besitzer' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Besitzer' }))
  const updated = statistics()
  updated.players[2] = { ...updated.players[2], wins: 4, winRatePercent: 100 }
  api.state.statistics = updated
  await games()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  for (const n of [1, 2]) fireEvent.change(screen.getByRole('combobox', { name: `Spieler ${n}` }), { target: { value: uid(n + 1) } })
  for (const n of [1, 2]) await selectGameDeck(n, deckFor(n + 1))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Spiel speichern' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game recorded.')
  await stats()
  await waitFor(() => expect(sortedIds(playerTable())).toEqual([uid(9), uid(1), uid(2)]))
  expect(within(playerTable()).getByRole('columnheader', { name: 'Siegrate' })).toHaveAttribute('aria-sort', 'descending')
  expect(within(deckTable()).getByRole('columnheader', { name: 'Besitzer' })).toHaveAttribute('aria-sort', 'descending')
  expect(sortedIds(deckTable())).toEqual([uid(109), uid(101), uid(102)])
})

test.each(['close', 'switch', 'session'] as const)('%s discards previous sort choices along with protected statistics', async action => {
  const api = appSetup(); renderApp(<App />, '/playgroups'); await open()
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Siegrate' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Siege' }))
  if (action === 'close') {
    fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' })); await open()
  } else if (action === 'switch') await open(api.other.name)
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByText('Logged out.'); await signIn(); await open()
  }
  await stats()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(viewButton('Spieler')).toHaveAttribute('aria-pressed', 'true')
  expect(sortedIds(playerTable())).toEqual([uid(1), uid(2), uid(9)])
  expect(sortedIds(deckTable())).toEqual([uid(101), uid(102), uid(109)])
  for (const getTable of [playerTable, deckTable]) expect(getTable().querySelector('th[aria-sort]')).toBeNull()
})

function responsiveViewport(initialDesktop = false) {
  let desktop = initialDesktop
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query, get matches() { return desktop },
    addEventListener(_event: string, listener: () => void) { listeners.add(listener) },
    removeEventListener(_event: string, listener: () => void) { listeners.delete(listener) },
  }))
  return (wide: boolean) => act(() => { desktop = wide; listeners.forEach(listener => listener()) })
}
function cardIds() {
  const list = screen.getByRole('list', { name: /statistiken$/ })
  for (const button of within(list).queryAllByRole('button', { name: /Kennung anzeigen/ })) fireEvent.click(button)
  return within(list).getAllByRole('listitem').map(card => card.textContent!.match(/[0-9a-f-]{36}/)![0])
}

test.each([
  ['players', 'username', 'Spieler', 'ascending'], ['players', 'games', 'Spiele', 'descending'],
  ['players', 'wins', 'Siege', 'descending'], ['players', 'winRatePercent', 'Siegrate', 'descending'],
  ['decks', 'name', 'Deck', 'ascending'], ['decks', 'ownerUsername', 'Besitzer', 'ascending'],
  ['decks', 'games', 'Spiele', 'descending'], ['decks', 'wins', 'Siege', 'descending'],
  ['decks', 'winRatePercent', 'Siegrate', 'descending'],
] as const)('mobile %s %s selects its first direction, reverses and resets API order', async (kind, field, label, direction) => {
  responsiveViewport()
  const api = gameApi(), data = sortingData()
  const names = ['beta', 'ALPHA', 'alpha', 'Éclair']
  data.players = data.players.map((row, i) => ({ ...row, username: names[i] }))
  data.decks = data.decks.map((row, i) => ({ ...row, name: names[i], ownerUsername: names[i] }))
  api.state.statistics = data; show()
  await screen.findByRole('list', { name: 'Spielerstatistiken' })
  if (kind === 'decks') selectView('Decks')
  const base = kind === 'players' ? [uid(1), uid(2), uid(9), uid(4)] : [101, 102, 103, 104].map(uid)
  expect(cardIds()).toEqual(base)
  const selector = screen.getByRole('combobox', { name: 'Sortieren nach' })
  expect(within(selector).getAllByRole('option')).toHaveLength(kind === 'players' ? 5 : 6)
  expect(screen.getByRole('button', { name: 'Sortierrichtung: Keine Sortierung' })).toBeDisabled()
  fireEvent.change(selector, { target: { value: field } })
  const numeric = direction === 'descending'
  expect(cardIds()).toEqual(numeric ? [base[3], base[0], base[1], base[2]] : [base[1], base[2], base[0], base[3]])
  expect(screen.getByRole('button', { name: `Sortierrichtung: ${numeric ? 'Absteigend' : 'Aufsteigend'}` })).toBeEnabled()
  expect(screen.getByText(`${kind === 'players' ? 'Spielerstatistiken' : 'Deckstatistiken'}: ${label}, ${numeric ? 'Absteigend' : 'Aufsteigend'}`)).toHaveAttribute('role', 'status')
  fireEvent.click(screen.getByRole('button', { name: /^Sortierrichtung:/ }))
  expect(cardIds()).toEqual(numeric ? [base[2], base[1], base[0], base[3]] : [base[3], base[0], base[1], base[2]])
  expect(selector).toHaveValue(field)
  fireEvent.change(selector, { target: { value: '' } })
  expect(cardIds()).toEqual(base)
  expect(screen.getByRole('button', { name: 'Sortierrichtung: Keine Sortierung' })).toBeDisabled()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(statsCalls(api)).toHaveLength(1)
})

test('responsive variants share selection, independent sorts and stable disclosures without extra fetches', async () => {
  const resize = responsiveViewport()
  const api = gameApi(); api.state.statistics = statistics(); show()
  await screen.findByRole('list', { name: 'Spielerstatistiken' })
  const choose = (field: string) => fireEvent.change(screen.getByRole('combobox', { name: 'Sortieren nach' }), { target: { value: field } })
  choose('wins')
  selectView('Decks'); choose('name')
  const disclosure = screen.getAllByRole('button', { name: /Kennung anzeigen/ })[0]
  fireEvent.click(disclosure)
  const controlledId = disclosure.getAttribute('aria-controls')
  resize(true)
  expect(viewButton('Decks')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('table')).toHaveLength(1)
  expect(screen.queryByRole('list', { name: 'Deckstatistiken' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Sortieren nach' })).not.toBeInTheDocument()
  expect(within(deckTable()).getByRole('columnheader', { name: 'Deck' })).toHaveAttribute('aria-sort', 'ascending')
  expect(screen.getByRole('button', { name: /Kennung verbergen/ })).toHaveAttribute('aria-controls', controlledId)
  fireEvent.click(screen.getByRole('button', { name: 'Standardreihenfolge' }))
  expect(deckTable().querySelector('th[aria-sort]')).toBeNull()
  selectView('Spieler')
  expect(within(playerTable()).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
  resize(false)
  expect(screen.getByRole('combobox', { name: 'Sortieren nach' })).toHaveValue('wins')
  selectView('Decks')
  expect(screen.getByRole('combobox', { name: 'Sortieren nach' })).toHaveValue('')
  expect(statsCalls(api)).toHaveLength(1)
})

test('mobile cards retain complete long identity, server numbers and archived/owner disclosures', async () => {
  responsiveViewport()
  const api = gameApi(), data = statistics()
  const longName = 'LangerUnunterbrochenerName'.repeat(12)
  data.players[0].username = longName
  data.decks[2] = { ...data.decks[2], name: longName, ownerUsername: longName, commanders: [savedCommander(longName)], winRatePercent: 12.5 }
  api.state.statistics = data; show()
  const players = await screen.findByRole('list', { name: 'Spielerstatistiken' })
  expect(within(players).getByRole('heading', { name: longName })).toHaveTextContent(longName)
  expect(within(players).getAllByRole('term').map(term => term.textContent)).toEqual(Array(3).fill(['Spiele', 'Siege', 'Siegrate']).flat())
  expect(within(players).getAllByRole('definition').map(value => value.textContent)).toEqual(['12', '6', '50%', '12', '1', '8.33%', '4', '0', '0%'])
  selectView('Decks')
  const decks = screen.getByRole('list', { name: 'Deckstatistiken' })
  const archived = within(decks).getAllByRole('listitem')[2]
  expect(archived).toHaveTextContent(`Commander: ${longName}`)
  expect(archived).toHaveTextContent(`Besitzer: ${longName}`)
  expect(archived).toHaveTextContent('Archiviert')
  expect(archived).toHaveTextContent('12.5%')
  expect(screen.queryByText(`Deckkennung: ${uid(109)}`)).not.toBeInTheDocument()
  fireEvent.click(within(archived).getByRole('button', { name: /Kennung anzeigen/ }))
  expect(screen.getByText(`Deckkennung: ${uid(109)}`)).toBeVisible()
  expect(screen.getByText(`Besitzerkennung: ${uid(9)}`)).toBeVisible()
})

test.each(['players', 'decks', 'both'] as const)('empty %s shows selected-subview feedback and keeps the switch available', async empty => {
  const api = gameApi(), data = statistics()
  if (empty !== 'decks') data.players = []
  if (empty !== 'players') data.decks = []
  api.state.statistics = data; show()
  if (empty !== 'decks') await screen.findByText(/Noch keine Spielerstatistiken/)
  else await screen.findByRole('table', { name: 'Spielerstatistiken' })
  selectView('Decks')
  expect(viewButton('Spieler')).toBeEnabled()
  expect(viewButton('Decks')).toBeEnabled()
  if (empty !== 'players') expect(screen.getByText(/Noch keine Deckstatistiken/)).toBeVisible()
  else expect(deckTable()).toBeInTheDocument()
})

test('chosen Decks view and each sort survive refresh, outer tabs and an acknowledged game write', async () => {
  const api = gameApi([recorded()]); api.state.statistics = statistics(); show()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(playerTable()).getByRole('button', { name: 'Siege' }))
  fireEvent.click(within(deckTable()).getByRole('button', { name: 'Deck' }))
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await screen.findByRole('table', { name: 'Deckstatistiken' })
  await games(); await stats()
  expect(screen.getByRole('table', { name: 'Deckstatistiken' })).toBeVisible()
  await games()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  for (const n of [1, 2]) fireEvent.change(screen.getByRole('combobox', { name: `Spieler ${n}` }), { target: { value: uid(n + 1) } })
  for (const n of [1, 2]) await selectGameDeck(n, deckFor(n + 1))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game recorded.'); await stats()
  expect(viewButton('Decks')).toHaveAttribute('aria-pressed', 'true')
  expect(within(await screen.findByRole('table', { name: 'Deckstatistiken' })).getByRole('columnheader', { name: 'Deck' })).toHaveAttribute('aria-sort', 'ascending')
  expect(within(playerTable()).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
})

test('refresh keeps visible keyboard focus through loading and local failure', async () => {
  const api = gameApi(); api.state.statistics = statistics(); show()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const pending = deferred()
  api.next(path, () => pending.promise)
  const refresh = screen.getByRole('button', { name: 'Statistiken aktualisieren' })
  refresh.focus(); fireEvent.click(refresh)
  expect(refresh).toHaveFocus()
  expect(refresh).toHaveAttribute('aria-disabled', 'true')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await act(async () => pending.resolve(response({}, 500)))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(refresh).toHaveFocus()
  expect(refresh).toHaveAttribute('aria-disabled', 'false')
})


test('a breakpoint change recovers focus from a removed mobile sort control', async () => {
  const resize = responsiveViewport()
  const api = gameApi(); api.state.statistics = statistics(); show()
  await screen.findByRole('list', { name: 'Spielerstatistiken' })
  const selector = screen.getByRole('combobox', { name: 'Sortieren nach' })
  selector.focus()
  resize(true)
  expect(screen.getByRole('button', { name: 'Statistiken aktualisieren' })).toHaveFocus()
})

test('denial recovery focuses explicit retry and reloaded statistics without automatic retry loops', async () => {
  const api = gameApi(); api.state.statistics = statistics(); show()
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  selectView('Decks')
  api.next(path, () => response({}, 403))
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await screen.findByText('Gruppenzugriff bestätigt. Bitte Statistiken aktualisieren, um den Serverstand zu prüfen.')
  const retry = screen.getByRole('button', { name: 'Statistiken aktualisieren' })
  expect(retry).toHaveFocus()
  expect(statsCalls(api)).toHaveLength(2)
  fireEvent.click(retry)
  await screen.findByRole('table', { name: 'Deckstatistiken' })
  expect(screen.getByRole('button', { name: 'Statistiken aktualisieren' })).toHaveFocus()
  expect(statsCalls(api)).toHaveLength(3)
  await games()
  const tabTrigger = screen.getByRole('button', { name: 'Show statistics' })
  tabTrigger.focus(); fireEvent.click(tabTrigger)
  expect(tabTrigger).toHaveFocus()
})
