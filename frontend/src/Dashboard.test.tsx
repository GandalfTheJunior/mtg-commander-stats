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
const deck: Deck = { id: uid(101), name: 'Alpha', commander: 'Karn', colorIdentity: [], archived: false, everUsed: false }
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
    if (path === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'dashboard-token' })
    if (path === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (path === '/api/decks' && method === 'GET') return response(state.decks)
    if (path === '/api/decks' && method === 'POST') {
      const created = { ...deck, ...JSON.parse(init!.body as string), id: uid(102) }
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
  await screen.findByRole('button', { name: deck.name })
  await screen.findByRole('button', { name: group.name })
}
async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
}
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test.each([0, 1, 3, 5])('%s groups retain API order, role labels and expand only beyond three', async count => {
  const api = setup()
  api.state.groups = Array.from({ length: count }, (_, index) => ({ id: uid(10 + index), name: `Group ${count - index}`, role: index % 2 ? 'MEMBER' : 'OWNER' }))
  show()
  await screen.findByRole('button', { name: deck.name })
  if (!count) {
    expect(screen.getByText(/Noch keine Playgroups/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Playgroup erstellen oder beitreten' })).toHaveAttribute('href', '/playgroups')
  } else {
    const list = screen.getByRole('list', { name: 'Deine Playgroups' })
    expect(within(list).getAllByRole('heading').map(item => item.textContent)).toEqual(api.state.groups.slice(0, 3).map(item => item.name))
    expect(within(list).getAllByText('Gruppenersteller')).toHaveLength(Math.ceil(Math.min(count, 3) / 2))
    if (count > 1) expect(within(list).getByText('Mitglied')).toBeInTheDocument()
  }
  if (count > 3) {
    fireEvent.click(screen.getByRole('button', { name: 'Alle Playgroups anzeigen', expanded: false }))
    expect(within(screen.getByRole('list', { name: 'Deine Playgroups' })).getAllByRole('heading').map(item => item.textContent)).toEqual(api.state.groups.map(item => item.name))
    fireEvent.click(screen.getByRole('button', { name: 'Weniger Playgroups anzeigen', expanded: true }))
    expect(within(screen.getByRole('list', { name: 'Deine Playgroups' })).getAllByRole('button')).toHaveLength(3)
  } else expect(screen.queryByRole('button', { name: 'Alle Playgroups anzeigen' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/me', '/api/groups', '/api/decks'])
})

test('all decks sort case/accent-insensitively with ID ties, accessible colors and lifecycle statuses', async () => {
  const api = setup()
  api.state.decks = [
    { ...deck, id: uid(105), name: 'zeta', archived: true, everUsed: true },
    { ...deck, id: uid(104), name: 'álpha', everUsed: true, colorIdentity: ['W', 'U', 'B', 'R', 'G'] },
    { ...deck, id: uid(103), name: 'alpha', commander: 'A very long commander '.repeat(15) },
    { ...deck, name: 'Alpha' },
  ]
  show()
  const list = await screen.findByRole('list', { name: 'Deine Decks' })
  expect(within(list).getAllByRole('heading').map(item => item.textContent)).toEqual(['Alpha', 'alpha', 'álpha', 'zeta'])
  const buttons = within(list).getAllByRole('button')
  expect(buttons[0]).toHaveAccessibleDescription(expect.stringContaining('Farblos'))
  expect(buttons[0]).toHaveAccessibleDescription(expect.stringContaining('Unbenutzt'))
  expect(buttons[0]).toHaveAccessibleDescription(expect.stringContaining(deck.id))
  expect(buttons[2]).toHaveAccessibleDescription(expect.stringContaining('W (Weiß) · U (Blau) · B (Schwarz) · R (Rot) · G (Grün)'))
  expect(buttons[2]).toHaveAccessibleDescription(expect.stringContaining('Bereits gespielt'))
  expect(buttons[3]).toHaveAccessibleDescription(expect.stringContaining('Archiviert'))
  const headings = screen.getAllByRole('heading').map(item => item.textContent)
  expect(headings.indexOf('Playgroups')).toBeLessThan(headings.indexOf('Decks'))
})

test('empty decks keep creation available before the empty state', async () => {
  const api = setup(); api.state.decks = []; show()
  const empty = await screen.findByText(/Noch keine Decks/)
  expect(screen.getByRole('button', { name: 'Deck erstellen' }).compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test.each(['groups', 'decks'] as const)('%s failure/loading/retry does not hide the other section', async section => {
  const api = setup(), pending = deferred()
  api.next(`/api/${section}`, () => pending.promise)
  show()
  await screen.findByRole('button', { name: section === 'groups' ? deck.name : group.name })
  expect(screen.getByText(section === 'groups' ? 'Playgroups werden geladen…' : 'Decks werden geladen…')).toBeInTheDocument()
  await act(async () => pending.resolve(response({}, 503)))
  fireEvent.click(await screen.findByRole('button', { name: section === 'groups' ? 'Playgroups erneut laden' : 'Decks erneut laden' }))
  await loaded()
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/${section}`)).toHaveLength(2)
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/${section === 'groups' ? 'decks' : 'groups'}`)).toHaveLength(1)
})

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
  expect(await screen.findByRole('button', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path]) => path.endsWith('/join-code'))).toBe(false)
})

test.each([false, true])('deck card opens the exact routed edit form including archived decks (%s)', async archived => {
  const api = setup(); api.state.decks = [{ ...deck, archived, everUsed: archived }, { ...deck, id: uid(102), name: 'Other deck' }]
  show(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: deck.name }))
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
  show(); await screen.findByRole('list', { name: 'Deine Decks' })
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  const form = await screen.findByRole('form', { name: 'Deck erstellen' })
  expect(screen.getByRole('heading', { name: 'Deck erstellen' })).toHaveFocus()
  expect(within(form).getByLabelText(/Deckname/)).toHaveValue('')
  expect(screen.queryByRole('form', { name: /^Deck .* bearbeiten$/ })).not.toBeInTheDocument()
})

test('removed/revoked/other-account group target fails fresh authorization without exposing private details', async () => {
  const api = setup(); show(); await loaded()
  api.state.groups = []
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByText(groupUnavailable)
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(window.location.pathname).toBe('/playgroups')
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: /^Deck .* bearbeiten$/ })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(1)
  expect(window.history.state.usr).toBeNull()
})

test.each([{}, 'bad', { dashboardToken: 'replayed' }, { kind: 'group', id: group.id }])('obsolete navigation state %j never opens a group from the list URL', async state => {
  const api = setup(); show('/playgroups', state)
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path]) => path === `/api/groups/${group.id}`)).toBe(false)
})

test('group URL Back/Forward and reload verify and reopen the stable target', async () => {
  const api = setup(); const view = show(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByRole('tab', { name: 'Spiele', selected: true })
  await act(async () => window.history.back()); await loaded()
  await act(async () => window.history.forward())
  await screen.findByRole('tab', { name: 'Spiele', selected: true })
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(2)
  view.unmount(); show(window.location.pathname, window.history.state.usr)
  await screen.findByRole('tab', { name: 'Spiele', selected: true })
  expect(api.fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(3)
  expect(screen.queryByRole('button', { name: 'Gruppe erstellen' })).not.toBeInTheDocument()
})

test('leaving before editor loading retires that request; Back resolves the stable target afresh', async () => {
  const api = setup(), pending = deferred(); show(); await loaded()
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: deck.name }))
  await screen.findByText('Deck wird geladen…')
  await goTo('Playgroups'); await screen.findByRole('button', { name: 'Gruppe erstellen' })
  await act(async () => window.history.back())
  await screen.findByRole('form', { name: `Deck ${deck.name} bearbeiten` })
  await act(async () => pending.resolve(response([deck])))
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue(deck.name)
})

test.each(['groups', 'decks'] as const)('a current Dashboard %s 401 expires the session', async section => {
  const api = setup(); api.next(`/api/${section}`, () => response({}, 401)); show()
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Deine Decks' })).not.toBeInTheDocument()
})

test.each([403, 404])('Dashboard %s is a local failure, not sign-out', async status => {
  const api = setup(); api.next('/api/groups', () => response({}, status)); show()
  await screen.findByText('Playgroups konnten nicht geladen werden.')
  expect(await screen.findByRole('button', { name: deck.name })).toBeInTheDocument()
  expect(screen.getByRole('navigation')).toBeInTheDocument()
})

test.each([200, 401])('retired Dashboard response %s is aborted/ignored after leaving and revisiting', async status => {
  const api = setup(), pending = deferred(); api.next('/api/decks', () => pending.promise); show()
  await screen.findByRole('button', { name: group.name })
  const signal = api.fetchMock.mock.calls.find(([path]) => path === '/api/decks')![1]!.signal!
  await goTo('Playgroups'); await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(signal.aborted).toBe(true)
  api.state.decks = [{ ...deck, name: 'Fresh deck' }]
  await goTo('Dashboard'); await screen.findByRole('button', { name: 'Fresh deck' })
  await act(async () => pending.resolve(response([deck], status)))
  expect(screen.queryByRole('button', { name: deck.name })).not.toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
})

test.each([owner, { id: uid(4), username: 'Fourth' }])('logout and $username login fence late Dashboard data', async loginUser => {
  const api = setup(), pending = deferred(), logout = deferred(); api.state.loginUser = loginUser
  api.next('/api/decks', () => pending.promise); show()
  await screen.findByRole('button', { name: group.name })
  api.next('/api/session', () => logout.promise, 'DELETE')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  api.state.groups = []; api.state.decks = []
  await act(async () => logout.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Logged out.'); await signIn()
  await screen.findByText(/Noch keine Decks/)
  await act(async () => pending.resolve(response([deck])))
  expect(screen.queryByRole('button', { name: deck.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: group.name })).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent(loginUser.username)
})

test.each(['create', 'join'])('Dashboard refreshes after acknowledged group %s', async operation => {
  setup(); show(); await loaded(); await goTo('Playgroups')
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  fireEvent.change(screen.getByLabelText(operation === 'create' ? /Gruppenname/ : /Einladungscode/), { target: { value: operation === 'create' ? 'New group' : 'abcdefghijklmnopqrstuv' } })
  fireEvent.click(screen.getByRole('button', { name: operation === 'create' ? 'Gruppe erstellen' : 'Gruppe beitreten' }))
  await screen.findByText(operation === 'create' ? 'New group wurde erstellt.' : 'New group: Beitritt bestätigt.')
  await goTo('Dashboard')
  expect(await screen.findByRole('button', { name: 'New group' })).toHaveAccessibleDescription(operation === 'create' ? 'Gruppenersteller' : 'Mitglied')
})

test.each(['create', 'rename', 'archive', 'delete'])('Dashboard reloads all decks after acknowledged %s', async operation => {
  const api = setup()
  if (operation === 'archive') api.state.decks = [{ ...deck, everUsed: true }]
  show(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: operation === 'create' ? 'Deck erstellen' : deck.name }))
  const form = await screen.findByRole('form', { name: operation === 'create' ? 'Deck erstellen' : `Deck ${deck.name} bearbeiten` })
  if (operation === 'create' || operation === 'rename') {
    fireEvent.change(within(form).getByLabelText(/Deckname/), { target: { value: 'New deck' } })
    if (operation === 'create') fireEvent.change(within(form).getByLabelText(/Commander/), { target: { value: 'Karn' } })
    fireEvent.submit(form)
    await screen.findByText(`New deck wurde ${operation === 'create' ? 'erstellt' : 'gespeichert'}.`)
  } else {
    await openDeckAction(operation === 'archive' ? 'Archivieren' : 'Löschen')
    fireEvent.click(screen.getByRole('button', { name: operation === 'archive' ? 'Archivieren bestätigen' : 'Löschen bestätigen' }))
    await screen.findByText(`Alpha wurde ${operation === 'archive' ? 'archiviert' : 'gelöscht'}.`)
  }
  await screen.findByRole('heading', { name: 'Dashboard' })
  if (operation === 'delete') await screen.findByText(/Noch keine Decks/)
  else {
    const card = await screen.findByRole('button', { name: operation === 'archive' ? deck.name : 'New deck' })
    if (operation === 'archive') expect(card).toHaveAccessibleDescription(expect.stringContaining('Archiviert'))
  }
})

test('reload while an editor loads resolves the stable target from a fresh list', async () => {
  const api = setup(), pending = deferred(); const view = show(); await loaded()
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: deck.name }))
  await screen.findByText('Deck wird geladen…')
  const path = window.location.pathname, state = window.history.state.usr
  view.unmount(); show(path, state)
  await screen.findByRole('form', { name: `Deck ${deck.name} bearbeiten` })
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue(deck.name)
  await act(async () => pending.resolve(response([deck])))
})

test('a failed destination details request hides private data until an explicit fresh check', async () => {
  const api = setup(); show(); await loaded()
  api.next(`/api/groups/${group.id}`, () => response({}, 503))
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByText(/Gruppenberechtigung konnte nicht geprüft werden/)
  expect(window.history.state.usr).toBeNull()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erneut laden' }))
  await screen.findByRole('tab', { name: 'Spiele', selected: true })
})

test.each([401, 200])('logout recovery (%s) rejects late Dashboard failures and refreshes confirmed data', async status => {
  const api = setup(), old = deferred(), checking = deferred()
  api.next('/api/decks', () => old.promise)
  show(); await screen.findByRole('button', { name: group.name })
  api.next('/api/session', () => response({}, 500), 'DELETE')
  api.next('/api/me', () => checking.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await waitFor(() => expect(api.fetchMock.mock.calls.filter(([path]) => path === '/api/me')).toHaveLength(2))
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  await act(async () => old.resolve(response({}, 401)))
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  api.state.decks = []; api.state.groups = []
  await act(async () => checking.resolve(response(status === 200 ? owner : {}, status)))
  if (status === 401) {
    await screen.findByText('Not signed in.'); await signIn()
  }
  await screen.findByText(/Noch keine Decks/)
  expect(screen.queryByRole('button', { name: group.name })).not.toBeInTheDocument()
})

test('expired-session login with the same UUID cannot revive a pending target or delayed Dashboard 401', async () => {
  const api = setup(), pending = deferred(), old = deferred()
  api.next('/api/decks', () => old.promise)
  show(); await screen.findByRole('button', { name: group.name })
  api.next(`/api/groups/${group.id}`, () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  await act(async () => pending.resolve(response({}, 401)))
  await screen.findByText('Your session expired. Sign in again.')
  await signIn(); await screen.findByRole('tab', { name: 'Spiele' })
  await goTo('Playgroups'); await screen.findByRole('button', { name: 'Gruppe erstellen' })
  await act(async () => old.resolve(response({}, 401)))
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
})

test('invalid list payloads use localized retry feedback independently', async () => {
  const api = setup(); api.next('/api/decks', () => response([{ ...deck, colorIdentity: ['R', 'W'] }]))
  show()
  await screen.findByText('Decks konnten nicht geladen werden.')
  expect(screen.getByRole('button', { name: group.name })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Decks erneut laden' }))
  await screen.findByRole('button', { name: deck.name })
})

test.each([owner, { id: uid(4), username: 'Fourth' }])('pending deck entry is retired before logout and $username re-login', async loginUser => {
  const api = setup(), pending = deferred(); show(); await loaded()
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('button', { name: deck.name }))
  await screen.findByText('Deck wird geladen…')
  api.state.loginUser = loginUser
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.'); await signIn(); await loaded()
  await goTo('Decks'); await screen.findByRole('heading', { name: 'Meine Decks' })
  await act(async () => pending.resolve(response([deck])))
  expect(screen.queryByRole('form', { name: /^Deck .* bearbeiten$/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent(loginUser.username)
})
