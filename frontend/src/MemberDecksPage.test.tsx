import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import GroupPage from './GroupPage'
import MemberDecksPage from './MemberDecksPage'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { groupUrl } from './groupNavigation'
import { savedCommander } from './test/commanderFixtures'
import { deferred, response, uid } from './test/gameFixtures'
import type { GroupDetails, GroupMember, MagicColor, MemberDeck, SavedCompanion } from './api'

const groupId = uid(10)
const base = `/api/groups/${groupId}`
const owner: GroupMember = { userId: uid(1), username: 'Gandalf', role: 'OWNER' }
const frodo: GroupMember = { userId: uid(4), username: 'Frodo', role: 'MEMBER' }
const quick: GroupMember = { userId: uid(5), username: 'Flinker Waschbär', role: 'MEMBER', quickProfile: true }
const klaus: GroupMember = { userId: uid(6), username: 'Klaus', role: 'MEMBER' }
const roster = [owner, frodo, quick, klaus]
const details = (members = roster): GroupDetails => ({ id: groupId, name: 'Commander-Runde', role: 'MEMBER', members })
const decksPath = (member: GroupMember | string) => `${base}/members/${typeof member === 'string' ? member : member.userId}/decks`
const manaBox = 'https://manabox.app/decks/Synthetic-Dragons_1'

let oracle = 500
const commander = (name: string, colors: MagicColor[] = [], position = 1) => ({ ...savedCommander(name, colors), position, oracleId: uid(oracle++) })
const companion: SavedCompanion = { oracleId: uid(410), name: 'Lurrus of the Dream-Den', selectionRef: { scryfallCardId: uid(311) }, scryfallCardId: uid(311),
  colorIdentity: ['W', 'B'], artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null }
const dragons: MemberDeck = { id: uid(101), name: 'Drachenpakt', commanders: [commander('The Ur-Dragon', ['W', 'U', 'B', 'R', 'G'])],
  colorIdentity: ['W', 'U', 'B', 'R', 'G'], companion: null, manaBoxUrl: manaBox }
const partners: MemberDeck = { id: uid(102), name: 'Partnerkombo', commanders: [commander('Tymna the Weaver', ['W', 'B']), commander('Thrasios, Triton Hero', ['U', 'G'], 2)],
  colorIdentity: ['W', 'U', 'B', 'G'], companion: null }
const superfriends: MemberDeck = { id: uid(103), name: 'Superfriends', commanders: [commander("Atraxa, Praetors' Voice", ['W', 'U', 'B', 'G'])],
  colorIdentity: ['W', 'U', 'B', 'G'], companion }
const many = (count: number): MemberDeck[] => Array.from({ length: count }, (_, index) => ({ id: uid(200 + index), name: `Deck ${String(index).padStart(2, '0')}`,
  commanders: [commander(`Commander ${index}`, ['R'])], colorIdentity: ['R'], companion: null }))

type Handler = () => Response | Promise<Response>
function api(routes: Record<string, Handler | Handler[]>) {
  const queues = new Map(Object.entries(routes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]))
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const queue = queues.get(`${method} ${path}`)
    if (!queue?.length) throw new Error(`Unexpected ${method} ${path}`)
    return (queue.length > 1 ? queue.shift()! : queue[0])()
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls: (path: string) => fetchMock.mock.calls.filter(([p]) => p === path).length }
}
const groupReads = (members = roster) => ({
  [`GET ${base}`]: () => response(details(members)),
  [`GET ${base}/ownership-transfer`]: () => response({}, 404),
  [`GET ${base}/ownership-transfer/notices`]: () => response([]),
})

function RouteLabel() { const location = useLocation(); return <p>Route {location.pathname}</p> }
/** Simulates an in-app route change to another member while the page stays mounted. */
function Jump() { const navigate = useNavigate(); return <button type="button" onClick={() => { void navigate(deckUrl(klaus)) }}>Zu Klaus springen</button> }
function show(entry: string | { pathname: string; state: unknown }, viewer: GroupMember = frodo) {
  const unauthorized = vi.fn(), notice = vi.fn()
  render(<AppThemeProvider><MemoryRouter initialEntries={[entry]}><Jump /><Routes>
    <Route path="/playgroups/:groupId/members" element={<GroupPage tab="members" currentUser={{ id: viewer.userId, username: viewer.username }}
      onUnauthorized={unauthorized} onNotice={notice} />} />
    <Route path="/playgroups/:groupId/members/:memberId/decks" element={<MemberDecksPage onUnauthorized={unauthorized} onNotice={notice} />} />
    <Route path="*" element={<RouteLabel />} />
  </Routes></MemoryRouter></AppThemeProvider>)
  return { unauthorized, notice }
}
const deckUrl = (member: GroupMember | string) => `${groupUrl(groupId, 'members')}/${typeof member === 'string' ? member : member.userId}/decks`
const deckList = () => screen.findByRole('list', { name: /^Decks von / })
const cards = () => within(screen.getByRole('list', { name: /^Decks von / })).getAllByRole('listitem')
const cardOf = (deckName: string) => cards().find(card => card.textContent?.includes(deckName))!
const searchbox = () => screen.queryByRole('searchbox', { name: 'Deckname oder Commander suchen' })
afterEach(() => { vi.unstubAllGlobals() })

test('header names the member and group; cards keep server order and show Commanders, Companion and colors read-only', async () => {
  // The server's name/UUID order is displayed as returned; the view never re-sorts.
  const server = api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => response([superfriends, dragons, partners]) })
  show(deckUrl(frodo))
  await deckList()
  expect(screen.getByRole('heading', { level: 2, name: 'Frodos Decks' })).toBeInTheDocument()
  expect(screen.getByText('Playgroup: Commander-Runde')).toBeInTheDocument()
  expect(screen.getByText('Decks dieses Playgroup-Mitglieds')).toBeInTheDocument()
  expect(cards().map(card => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
    "Atraxa, Praetors' Voice", 'The Ur-Dragon', 'Tymna the WeaverThrasios, Triton Hero'])
  expect(cardOf('Superfriends')).toHaveTextContent('Companion: Lurrus of the Dream-Den')
  expect(within(cardOf('Partnerkombo')).getByRole('img', { name: /Weiß.*Blau.*Schwarz.*Grün/ })).toBeInTheDocument()
  // Paired Commanders and the Companion are separate, labelled viewer triggers; nothing edits.
  expect(within(cardOf('Partnerkombo')).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
    'Karte anzeigen: Tymna the Weaver', 'Karte anzeigen: Thrasios, Triton Hero'])
  expect(within(cardOf('Superfriends')).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
    "Karte anzeigen: Atraxa, Praetors' Voice", 'Companion anzeigen: Lurrus of the Dream-Den'])
  expect(screen.queryByRole('button', { name: /bearbeiten|ändern|archivieren|löschen|Deck erstellen/i })).not.toBeInTheDocument()
  expect(screen.queryByText('Deck bearbeiten')).not.toBeInTheDocument()
  // Non-target card areas do nothing.
  fireEvent.click(within(cardOf('Drachenpakt')).getByRole('heading', { level: 3 }))
  fireEvent.click(within(cardOf('Drachenpakt')).getByText('Drachenpakt'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText(/^Route/)).not.toBeInTheDocument()
  expect(server.fetchMock).toHaveBeenCalledWith(decksPath(frodo), expect.objectContaining({ credentials: 'same-origin' }))
  expect(searchbox()).not.toBeInTheDocument()
})

test('artwork opens the shared full-card viewer without a request and returns focus; the list keeps its scroll', async () => {
  const server = api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => response([superfriends, partners]) })
  show(deckUrl(frodo))
  await deckList()
  const requests = server.fetchMock.mock.calls.length
  const region = screen.getByTestId('member-decks-region')
  region.scrollTop = 120
  const trigger = within(cardOf('Partnerkombo')).getByRole('button', { name: 'Karte anzeigen: Thrasios, Triton Hero' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Thrasios, Triton Hero' })
  expect(within(dialog).getByText('Kein Kartenbild gespeichert.')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(region.scrollTop).toBe(120)
  fireEvent.click(within(cardOf('Superfriends')).getByRole('button', { name: 'Companion anzeigen: Lurrus of the Dream-Den' }))
  expect(await screen.findByRole('dialog', { name: 'Lurrus of the Dream-Den' })).toBeInTheDocument()
  expect(server.fetchMock.mock.calls.length).toBe(requests)
})

test('only a valid authorized ManaBox link becomes one safe new-tab icon beside the deck name', async () => {
  const unsafe = [{ ...partners, manaBoxUrl: 'javascript:alert(1)' }, { ...superfriends, manaBoxUrl: 'http://manabox.app/decks/abc' },
    { id: uid(104), name: 'Ohne Link', commanders: [commander('Karn')], colorIdentity: [], companion: null, manaBoxUrl: null }]
  api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => response([dragons, ...unsafe]) })
  show(deckUrl(frodo))
  await deckList()
  const links = screen.getAllByRole('link')
  expect(links).toHaveLength(1)
  expect(links[0]).toHaveAccessibleName('Drachenpakt: Deck in ManaBox ansehen (öffnet einen neuen Tab)')
  expect(links[0]).toHaveAttribute('href', manaBox)
  expect(links[0]).toHaveAttribute('target', '_blank')
  expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
  expect(within(cardOf('Drachenpakt')).getByText('Drachenpakt').parentElement).toContainElement(links[0])
  fireEvent.click(links[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a long list reveals search; deck and either Commander match partially and case-insensitively in server order', async () => {
  const list: MemberDeck[] = [dragons, ...many(8), partners, superfriends]
  api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => response(list) })
  show(deckUrl(frodo))
  await deckList()
  expect(searchbox()).toBeInTheDocument()
  fireEvent.change(searchbox()!, { target: { value: 'tHRAS' } })
  expect(cards().map(card => within(card).getByText(/Partnerkombo|Deck \d+|Drachenpakt|Superfriends/).textContent)).toEqual(['Partnerkombo'])
  fireEvent.change(searchbox()!, { target: { value: 'deck 0' } })
  expect(cards().map(card => card.textContent?.match(/Deck \d+/)?.[0])).toEqual(['Deck 00', 'Deck 01', 'Deck 02', 'Deck 03', 'Deck 04', 'Deck 05', 'Deck 06', 'Deck 07'])
  // No separate Companion search requirement.
  fireEvent.change(searchbox()!, { target: { value: 'Meerjungfrau' } })
  expect(screen.getByText('Keine Decks gefunden')).toBeInTheDocument()
  expect(screen.getByText('Versuche einen anderen Suchbegriff.')).toBeInTheDocument()
  expect(screen.queryByText('Keine verfügbaren Decks')).not.toBeInTheDocument()
  expect(searchbox()).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Suche zurücksetzen' }))
  expect(searchbox()).toHaveValue('')
  expect(searchbox()).toHaveFocus()
  expect(cards()).toHaveLength(list.length)
  expect(within(cards()[0]).getByText('Drachenpakt')).toBeInTheDocument()
  fireEvent.change(searchbox()!, { target: { value: 'ur-dragon' } })
  fireEvent.click(screen.getByRole('button', { name: 'Suchbegriff löschen' }))
  expect(cards()).toHaveLength(list.length)
  expect(screen.getByText(/^Route|Frodos Decks/)).toHaveTextContent('Frodos Decks')
})

test('zero eligible decks show the empty state with Back and no create action, also for quick profiles', async () => {
  api({ ...groupReads(), [`GET ${decksPath(quick)}`]: () => response([]) })
  show(deckUrl(quick), owner)
  expect(await screen.findByText('Keine verfügbaren Decks')).toBeInTheDocument()
  expect(screen.getByText('Dieses Mitglied hat aktuell keine Decks, die in der Playgroup angezeigt werden können.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Flinker Waschbärs Decks' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Deck erstellen/ })).not.toBeInTheDocument()
  expect(searchbox()).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Zurück zu Mitglieder' })).toHaveLength(2)
})

test('the viewer’s own row stays read-only and names ending in s use an apostrophe', async () => {
  api({ ...groupReads(), [`GET ${decksPath(klaus)}`]: () => response([dragons]) })
  show(deckUrl(klaus), klaus)
  await deckList()
  expect(screen.getByRole('heading', { level: 2, name: 'Klaus’ Decks' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /bearbeiten|ändern|Deck erstellen/i })).not.toBeInTheDocument()
})

test('duplicate visible names keep the shortened UUID suffix in the heading', async () => {
  const twin = (n: number): GroupMember => ({ userId: `abcdef12-${n}000-4000-8000-00000000000${n}`, username: 'Sam', role: 'MEMBER' })
  const members = [owner, frodo, twin(1), twin(2)]
  api({ ...groupReads(members), [`GET ${decksPath(twin(2))}`]: () => response([]) })
  show(deckUrl(twin(2)))
  await screen.findByText('Keine verfügbaren Decks')
  expect(screen.getByRole('heading', { level: 2, name: 'Sams Decks · ID: abcdef122' })).toBeInTheDocument()
})

test('a target missing from the fresh roster shows the compact unavailable state without deck content', async () => {
  api({ ...groupReads(roster.filter(member => member !== klaus)), [`GET ${decksPath(klaus)}`]: () => response([dragons]) })
  show(deckUrl(klaus))
  expect(await screen.findByText('Mitglied nicht mehr verfügbar')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Mitglieder-Decks' })).toBeInTheDocument()
  expect(screen.getByText('Dieses Mitglied gehört nicht mehr zur Playgroup.')).toBeInTheDocument()
  expect(screen.queryByText('Drachenpakt')).not.toBeInTheDocument()
})

test('an invalid member ID is unavailable without a deck request', async () => {
  const server = api(groupReads())
  show(deckUrl('frodo'))
  expect(await screen.findByText('Mitglied nicht mehr verfügbar')).toBeInTheDocument()
  expect(server.calls(decksPath('frodo'))).toBe(0)
})

test('a deck 404 is revalidated: a removed target becomes unavailable, never an empty deck list', async () => {
  const server = api({ [`GET ${base}`]: [() => response(details()), () => response(details(roster.filter(member => member !== klaus)))],
    [`GET ${decksPath(klaus)}`]: () => response({ detail: 'Requested group resource not found.' }, 404) })
  show(deckUrl(klaus))
  expect(await screen.findByText('Mitglied nicht mehr verfügbar')).toBeInTheDocument()
  expect(screen.queryByText('Keine verfügbaren Decks')).not.toBeInTheDocument()
  expect(server.calls(base)).toBe(2)
})

test.each([
  ['deck read 403', { [`GET ${base}`]: () => response(details()), [`GET ${decksPath(frodo)}`]: () => response({}, 403) }],
  ['group read 403', { [`GET ${base}`]: () => response({}, 403), [`GET ${decksPath(frodo)}`]: () => response([dragons]) }],
  ['group read 404', { [`GET ${base}`]: () => response({}, 404), [`GET ${decksPath(frodo)}`]: () => response({}, 404) }],
  ['revalidation 403', { [`GET ${base}`]: [() => response(details()), () => response({}, 403)], [`GET ${decksPath(frodo)}`]: () => response({}, 404) }],
])('lost viewer access (%s) retires the view and returns to Playgroups with the notice', async (_name, routes) => {
  api(routes)
  const { notice, unauthorized } = show(deckUrl(frodo))
  expect(await screen.findByText('Route /playgroups')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledWith({ kind: 'error', message: 'Du hast keinen Zugriff mehr auf diese Playgroup.' })
  expect(unauthorized).not.toHaveBeenCalled()
  expect(screen.queryByText('Drachenpakt')).not.toBeInTheDocument()
})

test('a deck 403 retires the view even when the fresh roster no longer contains the target', async () => {
  api({ ...groupReads(roster.filter(member => member !== klaus)), [`GET ${decksPath(klaus)}`]: () => response({}, 403) })
  const { notice, unauthorized } = show(deckUrl(klaus))
  expect(await screen.findByText('Route /playgroups')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledWith({ kind: 'error', message: 'Du hast keinen Zugriff mehr auf diese Playgroup.' })
  expect(notice).toHaveBeenCalledTimes(1)
  expect(unauthorized).not.toHaveBeenCalled()
  expect(screen.queryByText('Mitglied nicht mehr verfügbar')).not.toBeInTheDocument()
  expect(screen.queryByText('Playgroup: Commander-Runde')).not.toBeInTheDocument()
})

test('a group 500 does not hide a deck 401: session recovery runs instead of retry', async () => {
  api({ [`GET ${base}`]: () => response({}, 500), [`GET ${decksPath(frodo)}`]: () => response({}, 401) })
  const { notice, unauthorized } = show(deckUrl(frodo))
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1))
  expect(notice).not.toHaveBeenCalled()
  expect(screen.queryByText('Die Decks konnten nicht geladen werden.')).not.toBeInTheDocument()
})

test('a deck 403 is handled while the group read stalls, and the late group response cannot restore content', async () => {
  const stalled = deferred()
  api({ [`GET ${base}`]: () => stalled.promise, [`GET ${decksPath(frodo)}`]: () => response({}, 403) })
  const { notice } = show(deckUrl(frodo))
  expect(await screen.findByText('Route /playgroups')).toBeInTheDocument()
  await act(async () => { stalled.resolve(response(details())) })
  expect(screen.getByText('Route /playgroups')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledTimes(1)
})

test('a deck 401 while the group read stalls expires the session once and nothing renders afterwards', async () => {
  const stalled = deferred()
  api({ [`GET ${base}`]: () => stalled.promise, [`GET ${decksPath(frodo)}`]: () => response({}, 401) })
  const { notice, unauthorized } = show(deckUrl(frodo))
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1))
  await act(async () => { stalled.resolve(response({}, 403)) })
  expect(unauthorized).toHaveBeenCalledTimes(1)
  expect(notice).not.toHaveBeenCalled()
  expect(screen.queryByText('Frodos Decks')).not.toBeInTheDocument()
})

test('401 follows session recovery instead of membership loss', async () => {
  api({ [`GET ${base}`]: () => response(details()), [`GET ${decksPath(frodo)}`]: () => response({}, 401) })
  const { notice, unauthorized } = show(deckUrl(frodo))
  await waitFor(() => expect(unauthorized).toHaveBeenCalled())
  expect(notice).not.toHaveBeenCalled()
  expect(screen.queryByText(/Keine verfügbaren Decks|Mitglied nicht mehr verfügbar/)).not.toBeInTheDocument()
})

test('loading is honest; a server failure offers retry instead of an empty result', async () => {
  const late = deferred()
  api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: [() => late.promise, () => response([dragons])] })
  show(deckUrl(frodo))
  expect(screen.getByRole('status')).toHaveTextContent('Decks werden geladen…')
  expect(screen.queryByText('Keine verfügbaren Decks')).not.toBeInTheDocument()
  await act(async () => { late.resolve(response({}, 500)) })
  expect(await screen.findByText('Die Decks konnten nicht geladen werden.')).toBeInTheDocument()
  expect(screen.queryByText('Keine verfügbaren Decks')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  expect(await screen.findByText('Drachenpakt')).toBeInTheDocument()
})

test('a late response for a previous member never replaces the current member’s decks', async () => {
  const late = deferred()
  api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => late.promise, [`GET ${decksPath(klaus)}`]: () => response([partners]) })
  show(deckUrl(frodo))
  fireEvent.click(screen.getByRole('button', { name: 'Zu Klaus springen' }))
  expect(await screen.findByText('Partnerkombo')).toBeInTheDocument()
  await act(async () => { late.resolve(response([dragons])) })
  expect(screen.getByRole('heading', { level: 2, name: 'Klaus’ Decks' })).toBeInTheDocument()
  expect(screen.queryByText('Drachenpakt')).not.toBeInTheDocument()
})

test('a direct link Back goes to the Members directory', async () => {
  api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => response([]) })
  render(<AppThemeProvider><MemoryRouter initialEntries={[deckUrl(frodo)]}><Routes>
    <Route path="/playgroups/:groupId/members/:memberId/decks" element={<MemberDecksPage onUnauthorized={vi.fn()} onNotice={vi.fn()} />} />
    <Route path="*" element={<RouteLabel />} />
  </Routes></MemoryRouter></AppThemeProvider>)
  fireEvent.click((await screen.findAllByRole('button', { name: 'Zurück zu Mitglieder' }))[0])
  expect(await screen.findByText(`Route ${groupUrl(groupId, 'members')}`)).toBeInTheDocument()
})

test('a member row opens that member’s decks, including the own row, and Back restores the directory filter', async () => {
  api({ ...groupReads(), [`GET ${decksPath(frodo)}`]: () => response([dragons]), [`GET ${decksPath(quick)}`]: () => response([partners]) })
  show(groupUrl(groupId, 'members'))
  const directory = await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  fireEvent.click(screen.getByRole('button', { name: 'Nur Schnellprofile' }))
  fireEvent.click(within(directory).getByRole('button', { name: /^Flinker Waschbär/ }))
  expect(await screen.findByText('Partnerkombo')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Zurück zu Mitglieder' }))
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(screen.getByRole('button', { name: 'Nur Schnellprofile' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Alle' }))
  fireEvent.click(within(screen.getByRole('list', { name: 'Aktive Mitglieder' })).getByRole('button', { name: /^Frodo\s*\(Du\)/ }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Frodos Decks' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /bearbeiten/ })).not.toBeInTheDocument()
})
