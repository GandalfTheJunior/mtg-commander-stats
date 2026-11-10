import { savedCommander } from './test/commanderFixtures'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppRouter as BrowserRouter } from './AppRouter'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { openDeckAction } from './test/editorEntry'
import type { CurrentUser, Deck, GroupSummary } from './api'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { deferred, group, response, uid } from './test/gameFixtures'
import { goTo } from './test/renderApp'
import { groupUnavailable } from './groupNavigation'

const owner = { id: uid(1), username: 'Owner' }
const deck: Deck = { id: uid(101), name: 'Alpha', commanders: [savedCommander('Karn')], colorIdentity: [], archived: false, everUsed: false, manaBoxUrl: null }
function setup() {
  const state = { user: owner as CurrentUser | null, loginUser: owner, decks: [deck], groups: [group] as GroupSummary[] }
  const replies = new Map<string, Array<() => Response | Promise<Response>>>()
  function next(path: string, reply: () => Response | Promise<Response>, method = 'GET') {
    const key = `${method} ${path}`
    replies.set(key, [...replies.get(key) ?? [], reply])
  }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const reply = replies.get(`${method} ${path}`)?.shift()
    if (reply) return reply()
    if (path.startsWith('/api/scryfall/commanders?')) return response([{ ...savedCommander('Karn'), thumbnailUrl: null }])
    if (path === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'dashboard-token' })
    if (path === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (path === '/api/decks' && method === 'GET') return response(state.decks)
    if (path === '/api/decks' && method === 'POST') {
      const created = { ...deck, name: JSON.parse(init!.body as string).name, id: uid(102) }
      state.decks.push(created)
      return response(created, 201)
    }
    if (path === `/api/decks/${deck.id}` && method === 'PUT') {
      const updated = { ...state.decks[0], ...JSON.parse(init!.body as string) }
      state.decks[0] = updated
      return response(updated)
    }
    if (path === `/api/decks/${deck.id}/archive`) {
      state.decks[0] = { ...state.decks[0], archived: true }
      return response(state.decks[0])
    }
    if (path === `/api/decks/${deck.id}` && method === 'DELETE') {
      state.decks = state.decks.filter(item => item.id !== deck.id)
      return new Response(null, { status: 204 })
    }
    if (path === '/api/groups' && method === 'GET') return response(state.groups)
    if (path === '/api/groups' || path === '/api/groups/join') {
      const created = { id: uid(11), name: 'New group', role: path.endsWith('/join') ? 'MEMBER' : 'OWNER' } as GroupSummary
      state.groups.push(created)
      return response(created, path.endsWith('/join') ? 200 : 201)
    }
    const selected = state.groups.find(item => path === `/api/groups/${item.id}`)
    if (selected) return response({ ...selected, members: group.members })
    if (/^\/api\/groups\/[^/]+$/.test(path)) return response({}, 403)
    if (path.endsWith('/games')) return response([])
    if (path.endsWith('/statistics')) return response({ players: [], decks: [] })
    throw new Error(`Unexpected request ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { state, next, fetchMock }
}
function show(path = '/dashboard', state: unknown = null, strict = false) {
  window.history.replaceState(state == null ? null : { usr: state, key: 'test' }, '', path)
  const app = <AppThemeProvider><BrowserRouter><App /></BrowserRouter></AppThemeProvider>
  return render(strict ? <StrictMode>{app}</StrictMode> : app)
}
async function loaded() {
  await screen.findByRole('button', { name: group.name })
}
async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

test.each([false, true])('group card verifies current membership at its stable URL and transfers focus (StrictMode: %s)', async strict => {
  const api = setup(); show('/dashboard', null, strict); await loaded()
  const fresh = deferred(); api.next(`/api/groups/${group.id}`, () => fresh.promise.then(reply => reply.clone()))
  if (strict) api.next(`/api/groups/${group.id}`, () => fresh.promise.then(reply => reply.clone()))
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  expect(window.location.pathname).toBe(`/playgroups/${group.id}`)
  expect(window.history.state.usr).toBeNull()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  await act(async () => fresh.resolve(response(group)))
  const heading = await screen.findByRole('heading', { name: group.name })
  await waitFor(() => expect(heading).toHaveFocus())
  expect(await screen.findByRole('link', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path]) => path.endsWith('/join-code'))).toBe(false)
})

test('removed/revoked/other-account group target fails fresh authorization without exposing private details', async () => {
  const api = setup(); show(); await loaded()
  api.state.groups = []
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByText(groupUnavailable)
  await screen.findByRole('button', { name: 'Playgroup erstellen' })
  expect(window.location.pathname).toBe('/playgroups')
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: /^Deck .* bearbeiten$/ })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(1)
  expect(window.history.state.usr).toBeNull()
})

test.each([{}, 'bad', { dashboardToken: 'replayed' }, { kind: 'group', id: group.id }])('obsolete navigation state %j never opens a group from the list URL', async state => {
  const api = setup(); show('/playgroups', state)
  await screen.findByRole('button', { name: 'Playgroup erstellen' })
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path]) => path === `/api/groups/${group.id}`)).toBe(false)
})

test('group URL Back/Forward and reload verify and reopen the stable target', async () => {
  const api = setup(); const view = show(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByRole('tab', { name: 'Overview', selected: true })
  await act(async () => window.history.back()); await loaded()
  await act(async () => window.history.forward())
  await screen.findByRole('tab', { name: 'Overview', selected: true })
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(2)
  view.unmount(); show(window.location.pathname, window.history.state.usr)
  await screen.findByRole('tab', { name: 'Overview', selected: true })
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(3)
  expect(screen.queryByRole('button', { name: 'Playgroup erstellen' })).not.toBeInTheDocument()
})

test('Dashboard refreshes after acknowledged group creation and Overview navigation', async () => {
  setup(); show(); await loaded(); await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup erstellen' }))
  fireEvent.change(screen.getByLabelText(/Name der Playgroup/), { target: { value: 'New group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  await screen.findByRole('heading', { name: 'New group' })
  await goTo('Dashboard')
  expect(await screen.findByRole('button', { name: 'New group' })).toHaveAccessibleDescription(`Übersicht, ${uid(11)}`)
})

test('a failed destination details request hides private data until an explicit fresh check', async () => {
  const api = setup(); show(); await loaded()
  api.next(`/api/groups/${group.id}`, () => response({}, 503))
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByText(/Gruppenberechtigung konnte nicht geprüft werden/)
  expect(window.history.state.usr).toBeNull()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erneut laden' }))
  await screen.findByRole('tab', { name: 'Overview', selected: true })
})

test.each([false, true])('deck card opens the exact routed edit form including archived decks (%s)', async archived => {
  const api = setup(); api.state.decks = [{ ...deck, archived, everUsed: archived }, { ...deck, id: uid(102), name: 'Other deck' }]
  show('/decks'); await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  fireEvent.click(screen.getByRole('button', { name: `${deck.name} bearbeiten` }))
  const form = await screen.findByRole('form', { name: `Deck ${deck.name} bearbeiten` })
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(window.history.state.usr).toEqual({ editorToken: expect.any(String) })
  expect(within(form).getByLabelText(/Deckname/)).toHaveValue(deck.name)
  expect(within(form).getByLabelText(/Commander/)).toHaveProperty('readOnly', archived)
  expect(screen.queryByRole('form', { name: 'Deck Other deck bearbeiten' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Deck bearbeiten' })).toHaveFocus()
  expect(api.fetchMock.mock.calls.filter(([path]) => path === '/api/decks')).toHaveLength(2)
})

test('create CTA focuses the dedicated editor heading after loading even with many decks', async () => {
  const api = setup(); api.state.decks = Array.from({ length: 25 }, (_, index) => ({ ...deck, id: uid(100 + index), name: `Deck ${index}` }))
  show('/decks'); await screen.findByRole('button', { name: 'Deck 0 bearbeiten' })
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  const form = await screen.findByRole('form', { name: 'Deck erstellen' })
  expect(screen.getByRole('heading', { name: 'Deck erstellen' })).toHaveFocus()
  expect(within(form).getByLabelText(/Deckname/)).toHaveValue('')
  expect(screen.queryByRole('form', { name: /^Deck .* bearbeiten$/ })).not.toBeInTheDocument()
})

test('leaving before editor loading retires that request; Back resolves the stable target afresh', async () => {
  const api = setup(), pending = deferred(); show('/decks'); await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: `${deck.name} bearbeiten` }))
  await screen.findByText('Deck wird geladen…')
  await goTo('Playgroups'); await screen.findByRole('button', { name: 'Playgroup erstellen' })
  await act(async () => window.history.back())
  await screen.findByRole('form', { name: `Deck ${deck.name} bearbeiten` })
  await act(async () => pending.resolve(response([deck])))
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue(deck.name)
})

test.each(['create', 'rename', 'archive', 'delete'])('Decks reloads its collection after acknowledged %s', async operation => {
  const api = setup()
  if (operation === 'archive') api.state.decks = [{ ...deck, everUsed: true }]
  show('/decks'); await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  fireEvent.click(screen.getByRole('button', { name: operation === 'create' ? 'Deck erstellen' : `${deck.name} bearbeiten` }))
  const form = await screen.findByRole('form', { name: operation === 'create' ? 'Deck erstellen' : `Deck ${deck.name} bearbeiten` })
  if (operation === 'create' || operation === 'rename') {
    fireEvent.change(within(form).getByLabelText(/Deckname/), { target: { value: 'New deck' } })
    if (operation === 'create') {
      fireEvent.change(within(form).getByLabelText(/Commander/), { target: { value: 'Karn' } })
      fireEvent.focus(screen.getByRole('combobox', { name: /Commander/ }))
      fireEvent.click(await screen.findByRole('option', { name: 'Karn' }))
    }
    fireEvent.submit(form)
    await screen.findByText(`New deck wurde ${operation === 'create' ? 'erstellt' : 'gespeichert'}.`)
  } else {
    await openDeckAction(operation === 'archive' ? 'Archivieren' : 'Löschen')
    fireEvent.click(screen.getByRole('button', { name: operation === 'archive' ? 'Archivieren bestätigen' : 'Löschen bestätigen' }))
    await screen.findByText(`Alpha wurde ${operation === 'archive' ? 'archiviert' : 'gelöscht'}.`)
  }
  await screen.findByRole('heading', { name: 'Meine Decks' })
  if (operation === 'delete') await screen.findByText(/Noch keine Decks/)
  else {
    const card = await screen.findByRole('button', { name: operation === 'archive' ? `${deck.name} bearbeiten` : 'New deck bearbeiten' })
    if (operation === 'archive') expect(card).toHaveAccessibleDescription(expect.stringContaining('Archiviert'))
  }
})

test('reload while an editor loads resolves the stable target from a fresh list', async () => {
  const api = setup(), pending = deferred(); const view = show('/decks'); await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: `${deck.name} bearbeiten` }))
  await screen.findByText('Deck wird geladen…')
  const path = window.location.pathname, state = window.history.state.usr
  view.unmount(); show(path, state)
  await screen.findByRole('form', { name: `Deck ${deck.name} bearbeiten` })
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue(deck.name)
  await act(async () => pending.resolve(response([deck])))
})

test.each([owner, { id: uid(4), username: 'Fourth' }])('pending deck entry is retired before logout and $username re-login', async loginUser => {
  const api = setup(), pending = deferred(); show('/decks'); await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: `${deck.name} bearbeiten` }))
  await screen.findByText('Deck wird geladen…')
  api.state.loginUser = loginUser
  fireEvent.click(within(screen.getByRole('banner', { hidden: true })).getByRole('button', { hidden: true })); fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
  await screen.findByText('Logged out.'); await signIn(); await screen.findByRole('heading', { name: 'Dashboard' })
  await goTo('Decks'); await screen.findByRole('heading', { name: 'Meine Decks' })
  await act(async () => pending.resolve(response([deck])))
  expect(screen.queryByRole('form', { name: /^Deck .* bearbeiten$/ })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: loginUser.username })).toBeInTheDocument()
})

const emptyMessage = 'Du bist noch keiner Playgroup beigetreten. Erstelle eine eigene Playgroup oder öffne einen Einladungslink.'

test.each([0, 1, 2, 3, 4, 8])('%s groups render the first three API entries; the shortcut opens the canonical collection only above three', async count => {
  const api = setup()
  api.state.groups = Array.from({ length: count }, (_, index) => ({ ...group, id: uid(10 + index), name: `Group ${count - index}` }))
  show()
  await screen.findByRole('link', { name: 'Playgroup erstellen' })
  const dashboard = within(screen.getByRole('region', { name: 'Dashboard' }))
  if (count) {
    const list = dashboard.getByRole('list', { name: 'Deine Playgroups' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(Math.min(count, 3))
    for (const [index, card] of within(list).getAllByRole('listitem').entries()) {
      const item = api.state.groups[index]
      const overview = within(card).getByRole('button', { name: item.name })
      expect(overview).toHaveAccessibleDescription(`Übersicht, ${item.id}`)
      const record = within(card).getByRole('link', { name: `Spiel erfassen: ${item.name}, ${item.id}` })
      expect(record).toHaveAttribute('href', `/playgroups/${item.id}/games/new`)
      expect(overview.contains(record)).toBe(false)
    }
    expect(dashboard.queryByText(emptyMessage)).not.toBeInTheDocument()
  } else expect(dashboard.getByText(emptyMessage)).toBeInTheDocument()
  expect(dashboard.queryByText(/Deck|Einladungscode|Gruppenersteller|Mitglied|Playground/)).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/me', '/api/groups'])
  if (count > 3) {
    fireEvent.click(dashboard.getByRole('link', { name: 'Alle Playgroups anzeigen' }))
    await screen.findByRole('heading', { name: 'Playgroups' })
    expect(screen.getAllByRole('listitem')).toHaveLength(count)
    expect(window.location.pathname).toBe('/playgroups')
  } else expect(dashboard.queryByRole('link', { name: 'Alle Playgroups anzeigen' })).not.toBeInTheDocument()
})

test.each([1, 3])('Dashboard distinguishes duplicate names with the other entry at index %s', async duplicateIndex => {
  const api = setup()
  const first = { ...group, id: '11111111-1111-4111-8111-111111111111', name: 'Friday Commander' }
  const duplicate = { ...group, id: '22222222-2222-4222-8222-222222222222', name: 'Friday Commander' }
  api.state.groups = [first,
    { ...group, id: uid(41), name: 'Other A' },
    { ...group, id: uid(42), name: 'Other B' },
    { ...group, id: uid(43), name: 'Other C' }]
  api.state.groups[duplicateIndex] = duplicate
  show()
  const list = within(await screen.findByRole('list', { name: 'Deine Playgroups' }))
  const firstButton = list.getByRole('button', { name: 'Friday Commander ID: 11111111' })
  expect(firstButton).toHaveAccessibleDescription(`Übersicht, ${first.id}`)
  expect(list.queryByRole('button', { name: 'Friday Commander' })).not.toBeInTheDocument()
  const firstCard = firstButton.closest('li')!
  expect(within(firstCard).getByRole('link', { name: `Spiel erfassen: Friday Commander, ${first.id}` }))
    .toHaveAttribute('href', `/playgroups/${first.id}/games/new`)
  if (duplicateIndex === 1) {
    const secondButton = list.getByRole('button', { name: 'Friday Commander ID: 22222222' })
    expect(secondButton).toHaveAccessibleDescription(`Übersicht, ${duplicate.id}`)
  } else {
    expect(list.queryByRole('button', { name: 'Friday Commander ID: 22222222' })).not.toBeInTheDocument()
  }
})

test.each([0, 1])('contextual plus opens existing creation and acknowledged creation refreshes Dashboard (%s groups)', async count => {
  const api = setup(); api.state.groups = count ? [group] : []
  show()
  fireEvent.click(await screen.findByRole('link', { name: 'Playgroup erstellen' }))
  const dialog = await screen.findByRole('dialog', { name: 'Playgroup erstellen' })
  const name = within(dialog).getByRole('textbox', { name: 'Name der Playgroup' })
  await waitFor(() => expect(name).toHaveFocus())
  expect(window.location.pathname).toBe('/playgroups')
  expect(window.location.search).toBe('')
  fireEvent.change(name, { target: { value: 'New group' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Erstellen' }))
  await screen.findByRole('heading', { name: 'New group' })
  await goTo('Dashboard'); await screen.findByRole('button', { name: 'New group' })
  expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
})

test.each([false, true])('record opens the exact group editor after fresh authorization without own-deck gating (StrictMode: %s)', async strict => {
  const api = setup(); api.state.decks = []
  const other = { ...group, id: uid(7), name: 'Other group' }
  api.state.groups = [group, other]
  show('/dashboard', null, strict); await loaded()
  const pending = deferred()
  api.next(`/api/groups/${other.id}`, () => pending.promise.then(reply => reply.clone()))
  if (strict) api.next(`/api/groups/${other.id}`, () => pending.promise.then(reply => reply.clone()))
  fireEvent.click(screen.getByRole('link', { name: `Spiel erfassen: ${other.name}, ${other.id}` }))
  await waitFor(() => expect(window.location.pathname).toBe(`/playgroups/${other.id}/games/new`))
  expect(screen.queryByRole('heading', { name: 'Commander-Spiel erfassen' })).not.toBeInTheDocument()
  await act(async () => pending.resolve(response({ ...other, members: group.members })))
  await screen.findByRole('heading', { name: 'Commander-Spiel erfassen' })
  expect(api.fetchMock.mock.calls.some(([path]) => path === '/api/decks')).toBe(false)
})

test.each([403, 404, 503, 'invalid'] as const)('loading and failed read (%s) never claim empty membership; retry restores cards', async status => {
  const api = setup(), pending = deferred(); api.next('/api/groups', () => pending.promise)
  show(); await screen.findByText('Playgroups werden geladen…')
  expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
  await act(async () => pending.resolve(status === 'invalid' ? response([{ id: 'invalid' }]) : response({}, status)))
  await screen.findByText('Playgroups konnten nicht geladen werden.')
  expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
  expect(screen.getByRole('navigation')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups erneut laden' })); await loaded()
})

test('current groups 401 retires the session', async () => {
  const api = setup(); api.next('/api/groups', () => response({}, 401)); show()
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

test.each([200, 401])('retired Dashboard response (%s) cannot replace a fresh list or expire the session', async status => {
  const api = setup(), pending = deferred(); api.next('/api/groups', () => pending.promise)
  show(); await screen.findByText('Playgroups werden geladen…')
  const signal = api.fetchMock.mock.calls.find(([path]) => path === '/api/groups')![1]!.signal!
  await goTo('Playgroups'); await screen.findByRole('button', { name: group.name })
  expect(signal.aborted).toBe(true)
  api.state.groups = [{ ...group, name: 'Fresh group' }]
  await goTo('Dashboard'); await screen.findByRole('button', { name: 'Fresh group' })
  await act(async () => pending.resolve(response([group], status)))
  expect(screen.queryByRole('button', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
})

test.each([owner, { id: uid(4), username: 'Fourth' }])('logout and $username login retire pending Dashboard reads', async loginUser => {
  const api = setup(), pending = deferred(); api.state.loginUser = loginUser
  api.next('/api/groups', () => pending.promise); show()
  await screen.findByText('Playgroups werden geladen…')
  fireEvent.click(screen.getByRole('button', { name: owner.username }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
  await screen.findByText('Logged out.')
  api.state.groups = []
  await signIn(); await screen.findByText(emptyMessage)
  await act(async () => pending.resolve(response([group], 401)))
  expect(screen.queryByRole('button', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: loginUser.username })).toBeInTheDocument()
})
