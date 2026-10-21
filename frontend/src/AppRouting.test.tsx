import { stubLanHttpCrypto } from './test/lanHttp'
import { showCode } from './test/groupEntry'
import { openNewDeck } from './test/editorEntry'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppRouter as BrowserRouter } from './AppRouter'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { deferred, group, recorded, response, uid } from './test/gameFixtures'
import { goTo } from './test/renderApp'
import type { CurrentUser } from './api'

const owner = { id: uid(1), username: 'Owner' }
const deck = { id: uid(101), name: 'Current deck', commander: 'Karn', colorIdentity: [], everUsed: false, archived: false }
const code = 'abcdefghijklmnopqrstuv'

function setup() {
  const state = { user: owner as CurrentUser | null, loginUser: owner, groups: [group], decks: [deck] }
  const pending = new Map<string, Array<() => Response | Promise<Response>>>()
  function next(path: string, reply: () => Response | Promise<Response>, method = 'GET') {
    const key = `${method} ${path}`
    pending.set(key, [...pending.get(key) ?? [], reply])
  }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const reply = pending.get(`${method} ${path}`)?.shift()
    if (reply) return reply()
    if (path === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'routing-token' })
    if (path === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (path === '/api/decks') return response(state.decks)
    if (path === '/api/groups') return response(state.groups)
    if (path === `/api/groups/${group.id}`) return response(group)
    if (path.endsWith('/join-code')) return response({ code })
    if (path.endsWith('/games')) return response([recorded()])
    if (path.endsWith('/statistics')) return response({ players: [], decks: [] })
    throw new Error(`Unexpected request ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { state, fetchMock, next }
}

function show(path: string) {
  window.history.replaceState(null, '', path)
  return render(<AppThemeProvider><BrowserRouter><App /></BrowserRouter></AppThemeProvider>)
}

async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
}

function hidden() {
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
}

async function destination(name: 'Dashboard' | 'Playgroups' | 'Decks') {
  const link = await screen.findByRole('link', { name, current: 'page' })
  expect(link).toHaveAttribute('href', `/${name.toLowerCase()}`)
  const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(navigation).getAllByRole('link')).toHaveLength(3)
  expect(within(navigation).getAllByRole('link', { current: 'page' })).toHaveLength(1)
}

// Exercise navigation, guards and retirement with the capabilities of LAN HTTP.
beforeEach(stubLanHttpCrypto)

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test.each([
  ['/', 'Dashboard'], ['/dashboard', 'Dashboard'], ['/decks', 'Decks'], ['/playgroups', 'Playgroups'],
  ['/unknown', 'Dashboard'], ['/decks/123', 'Dashboard'], ['/playgroups/123', 'Playgroups'],
] as const)('signed-out %s is safe and sign-in opens only the valid destination %s', async (path, target) => {
  const api = setup(); api.state.user = null
  show(path)
  await screen.findByText('Not signed in.')
  hidden()
  expect(api.fetchMock).toHaveBeenCalledTimes(1)
  await signIn()
  await destination(target)
  if (target === 'Decks') await screen.findByText(deck.name)
  else if (target === 'Playgroups') await screen.findByRole('button', { name: group.name })
  else {
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    await screen.findByRole('button', { name: deck.name })
    expect(api.fetchMock.mock.calls.some(([url]) => url === '/api/decks')).toBe(true)
    expect(api.fetchMock.mock.calls.some(([url]) => url === '/api/groups')).toBe(true)
  }
})

test.each([
  ['/', 'Dashboard'], ['/dashboard', 'Dashboard'], ['/decks', 'Decks'], ['/playgroups', 'Playgroups'],
  ['/missing', 'Dashboard'], ['/playgroups/id/games', 'Dashboard'],
] as const)('restores %s only after confirming the session, canonicalizing with replace', async (path, target) => {
  const api = setup(), checking = deferred()
  api.next('/api/me', () => checking.promise)
  const length = window.history.length
  show(path)
  expect(screen.getByText('Checking your session…')).toBeInTheDocument()
  hidden()
  await act(async () => checking.resolve(response(owner)))
  await destination(target)
  expect(window.location.pathname).toBe(`/${target.toLowerCase()}`)
  expect(window.history.length).toBe(length)
})

test('Back and Forward follow the URL and remount only the destination manager with fresh data', async () => {
  const api = setup(); show('/dashboard'); await destination('Dashboard')
  await goTo('Decks'); await screen.findByText(deck.name)
  expect(screen.queryByRole('heading', { name: 'Playgroups' })).not.toBeInTheDocument()
  await goTo('Playgroups'); await screen.findByRole('button', { name: group.name })
  expect(screen.queryByRole('heading', { name: 'Meine Decks' })).not.toBeInTheDocument()
  api.state.decks = [{ ...deck, name: 'Refreshed deck' }]
  await act(async () => window.history.back())
  await destination('Decks'); await screen.findByText('Refreshed deck')
  api.state.groups = [{ ...group, name: 'Refreshed group' }]
  await act(async () => window.history.forward())
  await destination('Playgroups')
  // Route selection can commit before the remounted manager's request effect.
  // Wait for fresh response content before checking exact request counts.
  await screen.findByRole('button', { name: 'Refreshed group' })
  expect(screen.queryByText('Refreshed deck')).not.toBeInTheDocument()
  // The Dashboard now also loads both lists once before the manager visits.
  expect(api.fetchMock.mock.calls.filter(([url]) => url === '/api/decks')).toHaveLength(3)
  expect(api.fetchMock.mock.calls.filter(([url]) => url === '/api/groups')).toHaveLength(3)
})

test.each(['Decks', 'Playgroups'] as const)('a current %s route 401 retires the session; Back still shows only safe authentication', async name => {
  const api = setup()
  show('/dashboard'); await destination('Dashboard')
  await screen.findByRole('button', { name: deck.name })
  api.next(`/api/${name === 'Decks' ? 'decks' : 'groups'}`, () => response({}, 401))
  await goTo(name)
  await screen.findByText('Your session expired. Sign in again.'); hidden()
  await act(async () => window.history.back())
  await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  hidden()
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})

test('Playgroup entries require fresh authorization and returning refetches the list', async () => {
  const api = setup(), checking = deferred()
  const detailPath = `/api/groups/${group.id}`
  show('/playgroups')
  const entry = await screen.findByRole('button', { name: group.name })
  expect(entry).toHaveAccessibleDescription('Gruppenersteller')
  expect(api.fetchMock.mock.calls.some(([url]) => url === detailPath || url.endsWith('/join-code') || url.endsWith('/games'))).toBe(false)

  api.next(detailPath, () => checking.promise)
  fireEvent.click(entry)
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  expect(window.location.pathname).toBe(`/playgroups/${group.id}`)
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith('/join-code') || url.endsWith('/games'))).toBe(false)
  await act(async () => checking.resolve(response(group)))
  await screen.findByRole('heading', { name: group.name })

  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' }))
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await screen.findByRole('heading', { name: group.name })
  expect(api.fetchMock.mock.calls.filter(([url]) => url === '/api/groups')).toHaveLength(2)
  expect(api.fetchMock.mock.calls.filter(([url]) => url === detailPath)).toHaveLength(2)
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith('/join-code'))).toBe(false)
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method && init.method !== 'GET')).toBe(false)
})

test('a successful login POST does not expose navigation until rotated CSRF and identity are verified', async () => {
  const api = setup(), csrf = deferred()
  api.state.user = null
  show('/playgroups'); await screen.findByText('Not signed in.')
  api.next('/api/csrf', () => response({ headerName: 'X-CSRF-TOKEN', token: 'before-login' }))
  api.next('/api/csrf', () => csrf.promise)
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Your session identity could not be confirmed.')
  hidden()
  expect(api.fetchMock.mock.calls.some(([url]) => url === '/api/groups')).toBe(false)
  await act(async () => csrf.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'after-login' })))
  await destination('Playgroups')
})

test('group access loss clears details and invitation code without logging out the confirmed account', async () => {
  const api = setup()
  show('/playgroups')
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await showCode()
  await screen.findByDisplayValue(code)
  api.next(`/api/groups/${group.id}`, () => response({}, 403))
  api.next('/api/groups', () => response([]))
  api.next(`/api/groups/${group.id}/join-code`, () => response({}, 403))
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  await screen.findByText(/Diese Playgroup ist nicht verfügbar/)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
  await destination('Playgroups')
  expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled()
})

test('logout clears protected content and destination while pending; Back cannot resurrect prior data', async () => {
  const api = setup(), pending = deferred()
  show('/dashboard'); await destination('Dashboard'); await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await showCode()
  await screen.findByDisplayValue(code)
  api.next('/api/session', () => pending.promise, 'DELETE')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  hidden(); expect(window.location.pathname).toBe('/')
  expect(screen.getByText('Logging out…')).toBeInTheDocument()
  await act(async () => window.history.back())
  await waitFor(() => expect(window.location.pathname).toBe(`/playgroups/${group.id}`))
  hidden()
  api.state.user = null
  await act(async () => pending.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Logged out.')
  expect(window.location.pathname).toBe('/')
  await signIn(); await destination('Dashboard')
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
})

test.each([owner, { id: uid(4), username: 'Fourth' }])('re-login as $username discards old route state and late invitation data', async loginUser => {
  const api = setup(), pending = deferred()
  api.state.loginUser = loginUser
  api.next(`/api/groups/${group.id}/join-code`, () => pending.promise)
  show('/playgroups'); await destination('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await showCode()
  await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith('/join-code'))).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.'); await signIn(); await destination('Dashboard')
  await goTo('Playgroups'); await destination('Playgroups')
  await act(async () => pending.resolve(response({ code })))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent(loginUser.username)
  expect(screen.queryByDisplayValue(code)).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
})

test('ambiguous logout gates navigation during recovery and confirms a fresh identity before the dashboard', async () => {
  const api = setup(), checking = deferred()
  show('/decks'); await screen.findByText(deck.name)
  api.next('/api/session', () => response({}, 403), 'DELETE')
  api.next('/api/me', () => checking.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  hidden()
  await waitFor(() => expect(api.fetchMock.mock.calls.filter(([url]) => url === '/api/me')).toHaveLength(2))
  await act(async () => checking.resolve(response({ id: uid(4), username: 'Fourth' })))
  await destination('Dashboard')
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Fourth')
  expect(screen.getByText(/Logout could not be confirmed/)).toBeInTheDocument()
  expect(screen.queryByText('Logged out.')).not.toBeInTheDocument()
})

test('failed restoration and uncertain logout recovery never enable protected navigation', async () => {
  const api = setup()
  api.next('/api/me', () => response({}, 503))
  show('/decks'); await screen.findByText('Your session identity could not be confirmed.'); hidden()
  fireEvent.click(screen.getByRole('button', { name: 'Check session' }))
  await screen.findByText(deck.name)
  api.next('/api/session', () => response({}, 500), 'DELETE')
  api.next('/api/me', () => response({}, 503))
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logout could not be confirmed. Check your session before continuing.'); hidden()
  fireEvent.click(screen.getByRole('button', { name: 'Check session' }))
  await destination('Dashboard')
})

test.each([200, 401])('a retired deck list (%s) cannot overwrite the reopened manager or expire its session', async status => {
  const api = setup(), pending = deferred()
  api.next('/api/decks', () => pending.promise)
  show('/decks'); await destination('Decks')
  await screen.findByText('Decks werden geladen…')
  const signal = api.fetchMock.mock.calls.find(([url]) => url === '/api/decks')![1]!.signal!
  await goTo('Playgroups'); await destination('Playgroups')
  expect(signal.aborted).toBe(true)
  api.state.decks = [{ ...deck, name: 'Fresh deck' }]
  await goTo('Decks'); await screen.findByText('Fresh deck')
  await act(async () => pending.resolve(response([deck], status)))
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  await destination('Decks')
})

test.each([200, 401])('a retired Playgroups list (%s) cannot overwrite the reopened manager or expire its session', async status => {
  const api = setup(), pending = deferred()
  api.next('/api/groups', () => pending.promise)
  show('/playgroups'); await destination('Playgroups')
  await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => url === '/api/groups')).toBe(true))
  const signal = api.fetchMock.mock.calls.find(([url]) => url === '/api/groups')![1]!.signal!
  await goTo('Decks'); await destination('Decks')
  expect(signal.aborted).toBe(true)
  api.state.groups = [{ ...group, name: 'Fresh Playgroup' }]
  await goTo('Playgroups'); await screen.findByRole('button', { name: 'Fresh Playgroup' })
  await act(async () => pending.resolve(response([group], status)))
  expect(screen.queryByRole('button', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  await destination('Playgroups')
})

test.each([
  ['Decks', 'create'], ['Playgroups', 'create'], ['Playgroups', 'join'],
] as const)('leaving %s during CSRF preparation prevents a retired %s write', async (name, operation) => {
  const api = setup(), csrf = deferred()
  show(`/${name.toLowerCase()}`); await destination(name)
  if (name === 'Decks') {
    await screen.findByText(deck.name)
    fireEvent.change(await openNewDeck(), { target: { value: 'Retired write' } })
    fireEvent.change(screen.getByLabelText(/Commander/), { target: { value: 'Karn' } })
  } else {
    await screen.findByRole('button', { name: 'Gruppe erstellen' })
    fireEvent.change(screen.getByLabelText(operation === 'create' ? /Gruppenname/ : /Einladungscode/), { target: { value: operation === 'create' ? 'Retired write' : code } })
  }
  api.next('/api/csrf', () => csrf.promise)
  fireEvent.click(screen.getByRole('button', { name: name === 'Decks' ? 'Deck erstellen' : operation === 'create' ? 'Gruppe erstellen' : 'Gruppe beitreten' }))
  await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => url === '/api/csrf')).toBe(true))
  await goTo('Dashboard')
  if (name === 'Decks') {
    fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  }
  await destination('Dashboard')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' })); await screen.findByText('Logged out.')
  api.state.loginUser = { id: uid(4), username: 'Fourth' }
  await signIn()
  await act(async () => csrf.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'retired-token' })))
  const writePath = name === 'Decks' ? '/api/decks' : operation === 'create' ? '/api/groups' : '/api/groups/join'
  expect(api.fetchMock.mock.calls.some(([url, init]) => url === writePath && init?.method === 'POST')).toBe(false)
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Fourth')
})
