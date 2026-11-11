import { savedCommander } from './test/commanderFixtures'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import type { GroupStatistics } from './api'
import { renderApp, goTo } from './test/renderApp'
import { deferred, gameApi, group, response, uid } from './test/gameFixtures'
import { statistics, emptyStatistics } from './test/statisticsFixtures'
import { groupUrl } from './groupNavigation'

const apiPath = `/api/groups/${group.id}/statistics`
const landing = groupUrl(group.id, 'statistics')
const chooser = `${landing}/reports`
const reportUrl = (report: string) => `${chooser}/${report}`
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const history = { navigate: (() => undefined) as ReturnType<typeof useNavigate>, path: '' }
function HistoryProbe() {
  const navigate = useNavigate(), location = useLocation()
  useEffect(() => {
    history.navigate = navigate
    history.path = `${location.pathname}${location.search}`
  })
  return null
}
const back = () => act(async () => { await history.navigate(-1) })

function setup(data: GroupStatistics = richStatistics()) {
  const api = gameApi()
  api.state.statistics = data
  const base = api.fetchMock
  const other = { ...group, id: uid(11), name: 'Sunday games' }
  const session = { user: { id: uid(1), username: 'Owner' } as { id: string; username: string } | null,
    logout: async () => { session.user = null; return new Response(null, { status: 204 }) } }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me') return response(session.user ?? {}, session.user ? 200 : 401)
    if (url === '/api/decks') return response([])
    if (url === '/api/groups') return response([group, other])
    if (url === `/api/groups/${other.id}`) return response(other)
    if (url.startsWith(`/api/groups/${other.id}/statistics`)) return response(emptyStatistics())
    if (url === '/api/session' && init?.method === 'DELETE') return session.logout()
    if (url === '/api/session' && init?.method === 'POST') {
      session.user = { id: uid(1), username: 'Owner' }
      return response(session.user)
    }
    if (url.startsWith(`${apiPath}?playerCount=`)) {
      // The fixture answers a filtered read with only the selected table-size section.
      const size = Number(url.split('=')[1]), reply = await base(apiPath, init)
      const body = await reply.clone().json() as GroupStatistics
      return Array.isArray(body.startPositions) && body.startPositions.length === 5
        ? response({ ...body, startPositions: body.startPositions.filter(section => section.playerCount === size) }) : reply
    }
    return base(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  const statsCalls = () => fetchMock.mock.calls.map(([url]) => url).filter(url => url.startsWith(apiPath))
  return { ...api, fetchMock, statsCalls, session, other }
}
function show(path = landing) {
  return renderApp(<><App /><HistoryProbe /></>, path)
}
function mobile() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true } }))
}
const seats = (n: number, games: number[], wins: number[]) => Array.from({ length: n }, (_, i) => ({ startPosition: i + 1, games: games[i] ?? 0, wins: wins[i] ?? 0,
  winRatePercent: (games[i] ?? 0) === 0 ? null : Math.round(10000 * (wins[i] ?? 0) / games[i]) / 100 }))

function richStatistics(): GroupStatistics {
  const data = statistics()
  data.players = [
    { userId: uid(5), username: 'Mara', games: 18, wins: 9, winRatePercent: 50 },
    { userId: uid(6), username: 'Alex', games: 24, wins: 10, winRatePercent: 41.67 },
    { userId: uid(7), username: 'Alex', games: 14, wins: 5, winRatePercent: 35.71 },
    { userId: uid(8), username: 'Deleted profile', deleted: true, deletedNumber: 2, games: 18, wins: 2, winRatePercent: 11.11 },
    { userId: uid(9), username: 'Sam', games: 1, wins: 1, winRatePercent: 100 },
  ]
  data.decks = [
    { ...data.decks[1], deckId: uid(102), name: 'Friedhof', ownerUsername: 'Sam', commanders: [savedCommander('Muldrotha, the Gravetide')], archived: true, games: 12, wins: 3, winRatePercent: 25 },
    { ...data.decks[0], deckId: uid(101), name: 'Superfriends', ownerUsername: 'Mara', commanders: [savedCommander('Atraxa, Praetors\' Voice')], games: 6, wins: 4, winRatePercent: 66.67 },
    { ...data.decks[0], deckId: uid(103), name: 'Partner Control', ownerUsername: 'Deleted profile', ownerDeleted: true, ownerDeletedNumber: 2,
      commanders: [savedCommander('Tymna the Weaver'), { ...savedCommander('Kraum, Ludevic\'s Opus'), position: 2, oracleId: uid(402), scryfallCardId: uid(302), selectionRef: { scryfallCardId: uid(302) } }], games: 4, wins: 2, winRatePercent: 50 },
    { ...data.decks[0], deckId: uid(104), name: 'One shot', ownerUsername: 'Alex', commanders: [savedCommander('Yuriko')], games: 1, wins: 1, winRatePercent: 100 },
  ]
  data.startPositions = [
    { playerCount: 2, seats: seats(2, [0, 0], []) },
    { playerCount: 3, seats: seats(3, [12, 12, 12], [5, 4, 3]) },
    { playerCount: 4, seats: seats(4, [12, 12, 12, 0], [3, 2, 1]) },
    { playerCount: 5, seats: seats(5, [], []) },
    { playerCount: 6, seats: seats(6, [], []) },
  ]
  data.manaColors = [
    { color: 'W', games: 12, wins: 7, winRatePercent: 58.33 }, { color: 'U', games: 21, wins: 11, winRatePercent: 52.38 },
    { color: 'B', games: 18, wins: 6, winRatePercent: 33.33 }, { color: 'R', games: 0, wins: 0, winRatePercent: null },
    { color: 'G', games: 16, wins: 7, winRatePercent: 43.75 }, { color: 'C', games: 4, wins: 0, winRatePercent: 0 },
  ]
  return data
}
const teaser = (title: string) => screen.getByRole('link', { name: title })
const radio = (name: string) => within(screen.getByRole('group', { name: 'Spielerzahl' })).getByRole('radio', { name })
const cardTitles = (list: string) => within(screen.getByRole('list', { name: list })).getAllByRole('heading', { level: 4 }).map(heading => heading.textContent)

test('landing shows three fixed unfiltered teasers with their exact selections and destinations', async () => {
  const api = setup()
  show()
  expect(await screen.findByRole('heading', { name: 'Statistiken', level: 3 })).toBeInTheDocument()
  await screen.findByRole('list', { name: 'Spieler mit den meisten Partien' })
  expect(screen.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent))
    .toEqual(['Gesamtsiegquote pro Spieler', 'Gesamtsiegquote pro Deck', 'Siegrate nach Startplatz'])
  expect(teaser('Gesamtsiegquote pro Spieler')).toHaveAttribute('href', reportUrl('players'))
  expect(teaser('Gesamtsiegquote pro Deck')).toHaveAttribute('href', reportUrl('decks'))
  expect(teaser('Siegrate nach Startplatz')).toHaveAttribute('href', reportUrl('starting-seats'))
  expect(screen.getByRole('link', { name: 'Alle Statistiken anzeigen' })).toHaveAttribute('href', chooser)
  expect(screen.queryByRole('button', { name: /aktualisieren/ })).not.toBeInTheDocument()
  // Most games, then display name: the deleted profile sorts by its localized label after Mara.
  const players = within(screen.getByRole('list', { name: 'Spieler mit den meisten Partien' })).getAllByRole('listitem')
  expect(players.map(row => row.textContent)).toEqual([
    'Alex41,67 %24 Spiele · 10 Siege', 'Gelöschtes Profil 211,11 %18 Spiele · 2 Siege', 'Mara50 %18 Spiele · 9 Siege'])
  // Highest rate with no sample threshold, partner Commanders on separate lines and archived marker.
  const decks = within(screen.getByRole('list', { name: 'Decks mit der höchsten Siegrate' })).getAllByRole('listitem')
  expect(decks.map(row => row.textContent)).toEqual([
    'YurikoDeck: One shot · Alex1 Spiel · 1 Sieg100 %',
    'Atraxa, Praetors\' VoiceDeck: Superfriends · Mara6 Spiele · 4 Siege66,67 %',
    'Tymna the WeaverKraum, Ludevic\'s OpusDeck: Partner Control · Gelöschtes Profil 24 Spiele · 2 Siege50 %'])
  // 3 and 4 players both have 12 observed games: prefer the larger table, never pooled.
  const seatsTeaser = teaser('Siegrate nach Startplatz')
  expect(within(seatsTeaser).getByText('4 Spieler · 12 Partien')).toBeInTheDocument()
  expect(within(within(seatsTeaser).getByRole('list')).getAllByRole('listitem').map(row => row.textContent)).toEqual([
    'Startplatz 112 Spiele · 3 Siege25 %', 'Startplatz 212 Spiele · 2 Siege16,67 %', 'Startplatz 312 Spiele · 1 Sieg8,33 %', 'Startplatz 40 Spiele · 0 SiegeKeine Beobachtung'])
  expect(api.statsCalls()).toEqual([apiPath])
})

test('landing keeps all three linked teasers with truthful empty states and no invented rows', async () => {
  setup(emptyStatistics())
  show()
  await screen.findByText('Noch keine Spielerstatistiken.')
  expect(screen.getByText('Noch keine Deckstatistiken.')).toBeInTheDocument()
  expect(screen.getByText('Noch keine Startplätze aufgezeichnet.')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /Gesamtsiegquote|Siegrate/ })).toHaveLength(3)
  expect(screen.queryByText(/%/)).not.toBeInTheDocument()
})

test('loading is announced, failures offer a distinct retry and never show stale numbers', async () => {
  const api = setup(), pending = deferred()
  api.next(apiPath, () => pending.promise)
  show()
  await screen.findByText('Statistiken werden geladen…')
  expect(screen.getAllByRole('link', { name: /Gesamtsiegquote|Siegrate/ })).toHaveLength(3)
  await act(async () => pending.resolve(response({}, 503)))
  expect(await screen.findByRole('alert')).toHaveTextContent('Die Statistiken konnten nicht geladen werden.')
  expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await screen.findByText('Statistiken geladen.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.statsCalls()).toHaveLength(2)
})

test('chooser starts collapsed, expands independently and lists exactly the four reports', async () => {
  const api = setup()
  show()
  fireEvent.click(await screen.findByRole('link', { name: 'Alle Statistiken anzeigen' }))
  expect(await screen.findByRole('heading', { name: 'Alle Statistiken' })).toBeInTheDocument()
  const section = within(screen.getByRole('region', { name: 'Alle Statistiken' }))
  const toggles = section.getAllByRole('button', { expanded: false })
  expect(toggles.map(button => button.textContent)).toEqual(['Spieler', 'Decks', 'Gruppe'])
  expect(screen.queryByRole('link', { name: /Gesamtsiegquote|Siegrate/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Spieler' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe' }))
  expect(screen.getByRole('button', { name: 'Spieler' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Decks' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getAllByRole('link', { name: /Gesamtsiegquote|Siegrate/ }).map(link => link.getAttribute('href')))
    .toEqual([reportUrl('players'), reportUrl('starting-seats'), reportUrl('mana-colors')])
  fireEvent.click(screen.getByRole('button', { name: 'Decks' }))
  expect(screen.getAllByRole('link', { name: /Gesamtsiegquote|Siegrate/ })).toHaveLength(4)
  expect(screen.getByRole('link', { name: 'Zurück zu Statistiken' })).toHaveAttribute('href', landing)
  expect(api.statsCalls()).toHaveLength(1) // The chooser itself reads no statistics.
})

test.each(['visible Back', 'browser Back'] as const)('%s from a chooser report restores expanded categories; fresh chooser entry is collapsed', async exit => {
  setup()
  show(chooser)
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppe' }))
  fireEvent.click(screen.getByRole('link', { name: 'Siegrate nach Manafarbe' }))
  await screen.findByRole('heading', { name: 'Siegrate nach Manafarbe', level: 3 })
  if (exit === 'visible Back') fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Statistiken' }))
  else await back()
  expect(await screen.findByRole('button', { name: 'Gruppe' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Spieler' })).toHaveAttribute('aria-expanded', 'false')
  expect(history.path).toBe(chooser)
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Statistiken' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Alle Statistiken anzeigen' }))
  expect(await screen.findByRole('button', { name: 'Gruppe' })).toHaveAttribute('aria-expanded', 'false')
})

test('filter is shared between chooser reports, reset by teaser entry, and never written to the URL', async () => {
  const api = setup()
  show(chooser)
  fireEvent.click(await screen.findByRole('button', { name: 'Spieler' }))
  fireEvent.click(screen.getByRole('link', { name: 'Gesamtsiegquote pro Spieler' }))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(radio('Alle')).toBeChecked()
  fireEvent.click(radio('4'))
  expect(radio('4')).toBeChecked()
  await waitFor(() => expect(api.statsCalls().at(-1)).toBe(`${apiPath}?playerCount=4`))
  expect(history.path).toBe(reportUrl('players'))
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Statistiken' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Decks' }))
  fireEvent.click(screen.getByRole('link', { name: 'Gesamtsiegquote pro Deck' }))
  await screen.findByRole('table', { name: 'Deckstatistiken' })
  expect(radio('4')).toBeChecked()
  expect(api.statsCalls().at(-1)).toBe(`${apiPath}?playerCount=4`)
  // Deliberate Statistics tab selection lands on the unfiltered teaser page.
  fireEvent.click(screen.getByRole('tab', { name: 'Statistics' }))
  await screen.findByRole('link', { name: 'Alle Statistiken anzeigen' })
  expect(history.path).toBe(landing)
  await screen.findByText('Statistiken geladen.')
  expect(api.statsCalls().at(-1)).toBe(apiPath)
  fireEvent.click(teaser('Gesamtsiegquote pro Deck'))
  await screen.findByRole('table', { name: 'Deckstatistiken' })
  expect(radio('Alle')).toBeChecked()
  expect(api.statsCalls().at(-1)).toBe(apiPath)
  expect(screen.getByRole('link', { name: 'Zurück zu Statistiken' })).toHaveAttribute('href', landing)
})

test('a fresh direct report URL starts with Alle and the default sort and returns to the landing page', async () => {
  const api = setup()
  show(reportUrl('players'))
  const table = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(radio('Alle')).toBeChecked()
  expect(within(table).getByRole('columnheader', { name: 'Spiele' })).toHaveAttribute('aria-sort', 'descending')
  expect(within(table).getAllByRole('rowheader').map(cell => cell.firstChild!.textContent))
    .toEqual(['Alex', 'Gelöschtes Profil 2', 'Mara', 'Alex', 'Sam'])
  expect(screen.getByRole('link', { name: 'Zurück zu Statistiken' })).toHaveAttribute('href', landing)
  expect(screen.getByRole('tab', { name: 'Statistics', selected: true })).toBeInTheDocument()
  expect(api.statsCalls()).toEqual([apiPath])
})

test('player report lists every played player, sorts by all columns and directions, and discloses IDs only for visible namesakes', async () => {
  setup()
  show(reportUrl('players'))
  const table = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const names = () => within(table).getAllByRole('rowheader').map(cell => cell.firstChild!.textContent)
  fireEvent.click(within(table).getByRole('button', { name: 'Siegrate' }))
  expect(names()).toEqual(['Sam', 'Mara', 'Alex', 'Alex', 'Gelöschtes Profil 2'])
  expect(within(table).getByRole('columnheader', { name: /Siegrate/ })).toHaveAttribute('aria-sort', 'descending')
  fireEvent.click(within(table).getByRole('button', { name: /Siegrate/ }))
  expect(names()).toEqual(['Gelöschtes Profil 2', 'Alex', 'Alex', 'Mara', 'Sam'])
  fireEvent.click(within(table).getByRole('button', { name: 'Spieler' }))
  expect(names()).toEqual(['Alex', 'Alex', 'Gelöschtes Profil 2', 'Mara', 'Sam'])
  fireEvent.click(within(table).getByRole('button', { name: 'Siege' }))
  expect(names()).toEqual(['Alex', 'Mara', 'Alex', 'Gelöschtes Profil 2', 'Sam'])
  const disclosures = within(table).getAllByRole('button', { name: /Kennung anzeigen/ })
  expect(disclosures).toHaveLength(2)
  expect(screen.queryByText(uid(6), { exact: false })).not.toBeInTheDocument()
  fireEvent.click(disclosures[1])
  expect(screen.getByText(`Spielerkennung: ${uid(7)}`)).toBeInTheDocument()
  // The disclosure stays with the same stable identity after re-sorting.
  fireEvent.click(within(table).getByRole('button', { name: /Siege/ }))
  expect(within(within(table).getAllByRole('row').find(row => row.textContent!.includes(uid(7)))!).getByText('14')).toBeInTheDocument()
})

test('a filter that leaves one namesake visible removes its disclosure; empty filtered subsets name the table size', async () => {
  const api = setup()
  show(reportUrl('players'))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const filtered = richStatistics()
  filtered.players = filtered.players.slice(1, 2)
  api.next(apiPath, () => response({ ...filtered, startPositions: emptyStatistics(3).startPositions }))
  fireEvent.click(radio('3'))
  const table = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(within(table).queryByRole('button', { name: /Kennung/ })).not.toBeInTheDocument()
  api.next(apiPath, () => response(emptyStatistics(5)))
  fireEvent.click(radio('5'))
  expect(await screen.findByText('Keine Spielerstatistiken für 5-Spieler-Partien vorhanden.')).toBeInTheDocument()
})

test('a retired filter response cannot replace the newer selection', async () => {
  const api = setup()
  show(reportUrl('players'))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  const late = deferred()
  api.next(apiPath, () => late.promise)
  fireEvent.click(radio('3'))
  await screen.findByText('Statistiken werden geladen…')
  const signal = api.fetchMock.mock.calls.at(-1)![1]!.signal!
  api.next(apiPath, () => response(emptyStatistics(4)))
  fireEvent.click(radio('4'))
  await screen.findByText('Keine Spielerstatistiken für 4-Spieler-Partien vorhanden.')
  expect(signal.aborted).toBe(true)
  await act(async () => late.resolve(response({ ...richStatistics(), startPositions: emptyStatistics(3).startPositions })))
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(radio('4')).toBeChecked()
})

test('mobile reports use cards, explicit sort controls and independent per-report sorts across report and tab switches', async () => {
  mobile()
  const api = setup()
  show(chooser)
  fireEvent.click(await screen.findByRole('button', { name: 'Spieler' }))
  fireEvent.click(screen.getByRole('button', { name: 'Decks' }))
  fireEvent.click(screen.getByRole('link', { name: 'Gesamtsiegquote pro Spieler' }))
  await screen.findByRole('list', { name: 'Spielerstatistiken' })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Sortieren nach')).toHaveValue('games')
  expect(screen.getByLabelText('Reihenfolge')).toHaveValue('descending')
  fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'name' } })
  fireEvent.change(screen.getByLabelText('Reihenfolge'), { target: { value: 'ascending' } })
  expect(cardTitles('Spielerstatistiken')).toEqual(['Alex', 'Alex', 'Gelöschtes Profil 2', 'Mara', 'Sam'])
  expect(within(screen.getByRole('list', { name: 'Spielerstatistiken' })).getAllByRole('button', { name: /Kennung anzeigen/ })).toHaveLength(2)
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Statistiken' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Gesamtsiegquote pro Deck' }))
  await screen.findByRole('list', { name: 'Deckstatistiken' })
  expect(screen.getByLabelText('Sortieren nach')).toHaveValue('winRate')
  expect(cardTitles('Deckstatistiken')).toEqual(['Yuriko', 'Atraxa, Praetors\' Voice', 'Tymna the WeaverKraum, Ludevic\'s Opus', 'Muldrotha, the Gravetide'])
  const archived = within(screen.getByRole('list', { name: 'Deckstatistiken' })).getAllByRole('listitem')[3]
  expect(archived).toHaveTextContent('Archiviert')
  expect(archived).toHaveTextContent('Deck: Friedhof')
  expect(archived).toHaveTextContent('Besitzer: Sam')
  expect(within(screen.getByRole('list', { name: 'Deckstatistiken' })).getAllByRole('listitem')[2]).toHaveTextContent('Besitzer: Gelöschtes Profil 2')
  fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'name' } })
  fireEvent.change(screen.getByLabelText('Reihenfolge'), { target: { value: 'ascending' } })
  expect(cardTitles('Deckstatistiken')[0]).toBe('Muldrotha, the Gravetide') // Saved deck name "Friedhof" sorts first.
  await act(async () => { await history.navigate(groupUrl(group.id, 'members')) })
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  await act(async () => { await history.navigate(reportUrl('players'), { state: { statisticsOrigin: { kind: 'chooser', expanded: ['players'] } } }) })
  await screen.findByRole('list', { name: 'Spielerstatistiken' })
  expect(screen.getByLabelText('Sortieren nach')).toHaveValue('name')
  expect(screen.getByLabelText('Reihenfolge')).toHaveValue('ascending')
  expect(api.statsCalls().every(url => url === apiPath)).toBe(true)
})

test('duplicate deck identities get disclosures only when Commanders, name and owner all collide', async () => {
  const data = richStatistics()
  data.decks = [data.decks[1], { ...data.decks[1], deckId: uid(105), ownerUserId: uid(15) }, { ...data.decks[1], deckId: uid(106), ownerUsername: 'Other owner' }]
  setup(data)
  show(reportUrl('decks'))
  const table = await screen.findByRole('table', { name: 'Deckstatistiken' })
  const buttons = within(table).getAllByRole('button', { name: /Kennung anzeigen/ })
  expect(buttons).toHaveLength(2)
  fireEvent.click(buttons[1])
  expect(screen.getByText(`Deckkennung: ${uid(105)}`)).toBeInTheDocument()
  expect(screen.getByText(`Besitzerkennung: ${uid(15)}`)).toBeInTheDocument()
})

test('starting seats show separate observed table sizes in seat order, with no-observation seats never shown as 0 %', async () => {
  const api = setup()
  show(reportUrl('starting-seats'))
  const sections = await screen.findAllByRole('region', { name: /Spieler ·/ })
  expect(sections.map(section => within(section).getByRole('heading').textContent)).toEqual(['3 Spieler · 12 Partien', '4 Spieler · 12 Partien'])
  expect(within(sections[1]).getAllByRole('listitem').map(row => row.textContent)).toEqual([
    'Startplatz 112 Spiele · 3 Siege25 %', 'Startplatz 212 Spiele · 2 Siege16,67 %', 'Startplatz 312 Spiele · 1 Sieg8,33 %', 'Startplatz 40 Spiele · 0 SiegeKeine Beobachtung'])
  expect(screen.queryByLabelText('Sortieren nach')).not.toBeInTheDocument()
  api.next(apiPath, () => response({ ...emptyStatistics(3), startPositions: [{ playerCount: 3, seats: seats(3, [5, 5, 5], [0, 5, 0]) }] }))
  fireEvent.click(radio('3'))
  await screen.findByRole('heading', { name: '3 Spieler · 5 Partien' })
  expect(screen.getAllByRole('region', { name: /Spieler ·/ })).toHaveLength(1)
  expect(screen.getAllByText('0 %')).toHaveLength(2) // Measured zero stays a valid rate.
  api.next(apiPath, () => response(emptyStatistics(6)))
  fireEvent.click(radio('6'))
  expect(await screen.findByText('Keine Startplatzdaten für 6-Spieler-Partien vorhanden.')).toBeInTheDocument()
})

test('Mana colors list only observed colors in ranked order with names and letters', async () => {
  setup()
  show(reportUrl('mana-colors'))
  const list = await screen.findByRole('list', { name: 'Siegrate nach Manafarbe' })
  expect(within(list).getAllByRole('listitem').map(row => row.textContent)).toEqual([
    'WWeiß58,33 %12 Spiele · 7 Siege', 'UBlau52,38 %21 Spiele · 11 Siege', 'GGrün43,75 %16 Spiele · 7 Siege',
    'BSchwarz33,33 %18 Spiele · 6 Siege', 'CFarblos0 %4 Spiele · 0 Siege'])
  expect(within(list).queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getByText(/Mehrfarbige Decks zählen je enthaltener Farbe/)).toBeInTheDocument()
})

test('Overview spotlight opens the player report with Alle and its Back returns to Overview', async () => {
  const api = setup()
  show(chooser)
  fireEvent.click(await screen.findByRole('button', { name: 'Spieler' }))
  fireEvent.click(screen.getByRole('link', { name: 'Gesamtsiegquote pro Spieler' }))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(radio('2'))
  await waitFor(() => expect(api.statsCalls().at(-1)).toBe(`${apiPath}?playerCount=2`))
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
  fireEvent.click(await screen.findByRole('link', { name: /Alle Spielerstatistiken ansehen/ }))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(radio('Alle')).toBeChecked()
  expect(api.statsCalls().at(-1)).toBe(apiPath)
  const backLink = screen.getByRole('link', { name: 'Zurück zur Übersicht' })
  expect(backLink).toHaveAttribute('href', groupUrl(group.id))
  fireEvent.click(backLink)
  expect(await screen.findByRole('heading', { name: 'Letzte Spiele' })).toBeInTheDocument()
})

test('presentation memory resets for another group and a new session', async () => {
  const api = setup()
  show(reportUrl('players'))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(radio('3'))
  await waitFor(() => expect(api.statsCalls().at(-1)).toBe(`${apiPath}?playerCount=3`))
  await act(async () => { await history.navigate(reportUrl('decks').replace(group.id, api.other.id)) })
  await screen.findByText('Noch keine Deckstatistiken. Erfasst ein Spiel in dieser Gruppe, um Ergebnisse zu sehen.')
  expect(radio('Alle')).toBeChecked()
  await act(async () => { await history.navigate(reportUrl('players')) })
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(radio('4'))
  await waitFor(() => expect(api.statsCalls().at(-1)).toBe(`${apiPath}?playerCount=4`))
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Owner' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
  await screen.findByText('Logged out.')
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('navigation', { name: 'Main navigation' })
  await act(async () => { await history.navigate(reportUrl('players')) })
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(radio('Alle')).toBeChecked()
})

test.each([403, 404])('statistics %s retires the group and returns to the collection with the access notice', async status => {
  const api = setup()
  api.next(apiPath, () => response({}, status))
  show(reportUrl('decks'))
  expect(await screen.findByText('Du hast keinen Zugriff mehr auf diese Playgroup.')).toBeInTheDocument()
  await waitFor(() => expect(history.path).toBe('/playgroups'))
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
})

test('statistics 401 expires the session at the protected report path', async () => {
  const api = setup()
  api.next(apiPath, () => response({}, 401))
  show(reportUrl('mana-colors'))
  expect(await screen.findByText('Your session expired. Sign in again.')).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Siegrate nach Manafarbe' })).not.toBeInTheDocument()
})

test.each([200, 401])('leaving a loading report ignores a late status %s response', async status => {
  const api = setup(), late = deferred()
  api.next(apiPath, () => late.promise)
  show(reportUrl('players'))
  await screen.findByText('Statistiken werden geladen…')
  const signal = api.fetchMock.mock.calls.find(([url]) => url === apiPath)![1]!.signal!
  await goTo('Decks')
  expect(signal.aborted).toBe(true)
  await act(async () => late.resolve(response(richStatistics(), status)))
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('table', { name: 'Spielerstatistiken' })).not.toBeInTheDocument()
})
