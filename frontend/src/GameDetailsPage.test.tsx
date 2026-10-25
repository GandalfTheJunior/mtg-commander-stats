import { stubLanHttpCrypto } from './test/lanHttp'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { AppRouter } from './AppRouter'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { selectTab } from './test/groupEntry'
import { statistics } from './test/statisticsFixtures'
import { gameAction, openGameDetails } from './test/gameEntry'
import { deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'
import { gameUnavailable, gameUrl } from './gamePresentation'
import { groupUnavailable, groupUrl } from './groupNavigation'
import type { CurrentUser, GroupDetails } from './api'

const groupPath = `/api/groups/${group.id}`
const gamePath = `${groupPath}/games/${uid(20)}`
const detailUrl = gameUrl(group.id, uid(20))
function setup() {
  const api = gameApi([recorded()])
  const state = { user: { id: uid(1), username: 'Owner' } as CurrentUser | null, loginUser: { id: uid(1), username: 'Owner' }, details: { ...group } as GroupDetails | null }
  const replies = new Map<string, Array<() => Response | Promise<Response>>>()
  const next = (path: string, reply: () => Response | Promise<Response>, method = 'GET') => {
    const key = `${method} ${path}`
    replies.set(key, [...replies.get(key) ?? [], reply])
  }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET'
    const reply = replies.get(`${method} ${url}`)?.shift()
    if (reply) return reply()
    if (url === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (url === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (url.toLowerCase() === groupPath) return response(state.details ?? {}, state.details ? 200 : 403)
    if (url === '/api/groups') return response(state.details ? [state.details] : [])
    if (url === '/api/decks') return response([])
    return api.fetchMock(url.toLowerCase(), init)
  })
  vi.stubGlobal('fetch', fetchMock)
  const calls = (url: string, method = 'GET') => fetchMock.mock.calls.filter(([path, init]) => path === url && (init?.method ?? 'GET') === method)
  return { ...api, server: state, next, calls, fetchMock }
}
function show(path = detailUrl, state: unknown = null, strict = false) {
  window.history.replaceState({ usr: state, key: 'test' }, '', path)
  const ui = <AppThemeProvider><AppRouter><App /></AppRouter></AppThemeProvider>
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}
async function login() {
  const form = within((await screen.findByRole('heading', { name: 'Sign in' })).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'user@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'a sufficient password' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText(/Signed in as/)
}
async function back() {
  act(() => window.history.back())
  await waitFor(() => expect(window.location.pathname).toBe(groupUrl(group.id)))
}
// Exercise navigation, guards and retirement with the capabilities of LAN HTTP.
beforeEach(stubLanHttpCrypto)

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test.each([false, true])('direct details verify session, group and game in order before exposing private fields (StrictMode %s)', async strict => {
  const api = setup(), me = deferred(), membership = deferred(), game = deferred()
  api.next('/api/me', () => me.promise.then(reply => reply.clone()))
  if (strict) api.next('/api/me', () => me.promise.then(reply => reply.clone()))
  api.next(groupPath, () => membership.promise)
  api.next(gamePath, () => game.promise)
  show(detailUrl, null, strict)
  expect(api.calls(groupPath)).toHaveLength(0)
  await act(async () => me.resolve(response(api.server.user)))
  await waitFor(() => expect(api.calls(groupPath).length).toBeGreaterThan(0))
  expect(api.calls(gamePath)).toHaveLength(0)
  expect(screen.queryByText('Deck 2')).not.toBeInTheDocument()
  await act(async () => membership.resolve(response(group)))
  await waitFor(() => expect(api.calls(gamePath)).toHaveLength(1))
  expect(screen.queryByRole('button', { name: 'Spielaktionen' })).not.toBeInTheDocument()
  await act(async () => game.resolve(response(recorded())))
  expect(await screen.findByRole('heading', { name: 'Spieldetails' })).toHaveFocus()
  expect(screen.getByText('Commander: Commander 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Spiele' }))
  await screen.findByRole('link', { name: /^Spieldetails:/ })
  expect(window.location.pathname).toBe(groupUrl(group.id))
  expect(api.calls(`${groupPath}/games`)).toHaveLength(strict ? 2 : 1)
})

test('signed-out details resume after login and a reload starts fresh verification', async () => {
  const api = setup(); api.server.user = null
  const view = show()
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(api.calls(groupPath)).toHaveLength(0)
  await login()
  await screen.findByRole('heading', { name: 'Spieldetails' })
  expect(window.location.pathname).toBe(detailUrl)
  view.unmount()
  show()
  await screen.findByRole('heading', { name: 'Spieldetails' })
  expect(api.calls(gamePath)).toHaveLength(2)
  expect(api.calls(groupPath)).toHaveLength(2)
})

test('UUID identity accepts mixed case without accepting other games or unsupported detail subpaths', async () => {
  const api = setup()
  const id = 'aabbccdd-1234-4abc-8def-abcdef123456'
  api.next(`${groupPath}/games/${id.toUpperCase()}`, () => response(recorded({ id })))
  const view = show(gameUrl(group.id.toUpperCase(), id.toUpperCase()))
  await screen.findByRole('heading', { name: 'Spieldetails' })
  view.unmount()
  show(`${detailUrl}/edit`)
  await screen.findByRole('heading', { name: 'Dashboard' })
  expect(api.calls(gamePath)).toHaveLength(0)
})

test.each(['group', 'game'])('invalid %s UUID never requests private game data', async which => {
  const api = setup()
  show(gameUrl(which === 'group' ? 'join-code' : group.id, which === 'game' ? 'not-a-uuid' : uid(20)))
  await screen.findByText(which === 'group' ? groupUnavailable : gameUnavailable)
  expect(api.calls(gamePath)).toHaveLength(0)
  expect(screen.queryByRole('heading', { name: 'Spieldetails' })).not.toBeInTheDocument()
})

test.each([403, 404])('group %s returns generically to Playgroups before requesting a game', async status => {
  const api = setup(); api.next(groupPath, () => response({}, status)); show()
  await screen.findByText(groupUnavailable)
  expect(window.location.pathname).toBe('/playgroups')
  expect(api.calls(gamePath)).toHaveLength(0)
})

test('game 404 in an accessible group returns to fresh games with generic feedback', async () => {
  const api = setup(); api.state.history = []; show()
  await screen.findByText(gameUnavailable)
  await screen.findByText('No recorded games yet.')
  expect(window.location.pathname).toBe(groupUrl(group.id))
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
})

test.each([403, 404])('game %s rechecks membership and distinguishes lost group access', async status => {
  const api = setup()
  api.next(groupPath, () => response(group)); api.next(groupPath, () => response({}, 403))
  api.next(gamePath, () => response({}, status)); show()
  await screen.findByText(groupUnavailable)
  expect(api.calls(groupPath)).toHaveLength(2)
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test.each(['group', 'game', 'malformed', 'wrong-group', 'wrong-game', 'network', 'forbidden'] as const)('unavailable/invalid %s keeps private data hidden until explicit safe retry', async failure => {
  const api = setup()
  if (failure === 'group') api.next(groupPath, () => response({}, 500))
  else api.next(gamePath, () => {
    if (failure === 'network') throw new Error('offline')
    if (failure === 'malformed') return response({ ...recorded(), participants: [] })
    if (failure === 'wrong-group') return response(recorded({ groupId: uid(99) }))
    if (failure === 'wrong-game') return response(recorded({ id: uid(99) }))
    return response({}, failure === 'forbidden' ? 403 : 500)
  })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Spieldetails erneut prüfen' }))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Spieldetails' })
  expect(screen.getByRole('button', { name: 'Spielaktionen' })).toBeInTheDocument()
})

test.each([['OWNER', 1, true], ['MEMBER', 2, true], ['MEMBER', 3, false]] as const)('fresh %s viewer %s has actions only when entitled', async (role, actor, allowed) => {
  const api = setup(); api.server.details = { ...group, role }; api.server.user = { id: uid(actor), username: 'Viewer' }; show()
  await screen.findByRole('heading', { name: 'Spieldetails' })
  expect(Boolean(screen.queryByRole('button', { name: 'Spielaktionen' }))).toBe(allowed)
  if (allowed) {
    fireEvent.click(screen.getByRole('button', { name: 'Spielaktionen' }))
    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(['Bearbeiten', 'Löschen'])
  }
})

test('historical names/ordered assignments, duplicate names, archived and colorless decks and neutral creator fallback are truthful', async () => {
  const api = setup(), game = recorded({ creatorId: uid(99), result: 'DRAW', winnerUserId: null })
  game.participants[0].deck.archived = true
  game.participants[0].deck.colorIdentity = []
  game.participants[1].deck.colorIdentity = ['W', 'U', 'B', 'R', 'G']
  api.state.history = [game]
  api.server.details = { ...group, members: group.members.filter(person => person.userId !== uid(2)) }
  show()
  await screen.findByRole('heading', { name: 'Unentschieden' })
  const assignments = within(screen.getByRole('list', { name: 'Teilnehmende und Decks' })).getAllByRole('listitem')
  expect(assignments[0]).toHaveTextContent('Same name (…0002)')
  expect(assignments[0]).toHaveTextContent('Ehemaliges Mitglied')
  expect(assignments[0]).toHaveTextContent('Archiviertes Deck')
  expect(assignments[0]).toHaveTextContent('Farbidentität: Farblos')
  expect(assignments[1]).toHaveTextContent('W (Weiß) · U (Blau) · B (Schwarz) · R (Rot) · G (Grün)')
  expect(screen.getByText(`Ersteller: ${uid(99)}`)).toBeInTheDocument()
  expect(screen.queryByText(/Gewonnen:/)).not.toBeInTheDocument()
  expect(screen.getByText(/Erfasst am/).querySelector('time')).toHaveAttribute('datetime', game.recordedAt)
})

test('cards retain exact API order, current winner/deck and correct recording semantics; active draft blocks detail entry', async () => {
  const api = setup()
  api.state.history = [recorded({ id: uid(21), result: 'DRAW', winnerUserId: null }), recorded()]
  show(groupUrl(group.id))
  const cards = await screen.findAllByRole('link', { name: /^Spieldetails:/ })
  expect(cards.map(card => card.getAttribute('href'))).toEqual([gameUrl(group.id, uid(21)), detailUrl])
  expect(cards[0]).toHaveTextContent('Unentschieden')
  expect(cards[1]).toHaveTextContent('WIN — Same name (…0002) · Deck 2')
  expect(cards[1]).toHaveTextContent('2 Teilnehmende')
  expect(cards[1]).toHaveTextContent('Erfasst am')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel erfassen' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  expect(window.location.pathname).toBe(groupUrl(group.id))
  expect(screen.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue(uid(2))
  expect(cards[1]).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /^Spieldetails:/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  fireEvent.click(await screen.findByRole('link', { name: new RegExp(`^Spieldetails:.*${uid(20)}$`) }))
  await screen.findByRole('heading', { name: 'Spieldetails' })
  await back()
  await screen.findByRole('link', { name: new RegExp(`^Spieldetails:.*${uid(20)}$`) })
  act(() => window.history.forward())
  await screen.findByRole('heading', { name: 'Spieldetails' })
  expect(api.calls(gamePath)).toHaveLength(2)
})

test.each(['rights', 'gone'])('edit intent validates new membership/history when target is %s', async change => {
  const api = setup(); show(); await screen.findByRole('heading', { name: 'Spieldetails' })
  if (change === 'rights') api.server.details = { ...group, role: 'MEMBER' }
  else api.state.history = []
  await gameAction('Bearbeiten', false)
  await screen.findByText(/Das Spiel kann nicht mehr bearbeitet werden/)
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
  expect(window.location.pathname).toBe(groupUrl(group.id))
})

test('edit intent is consumed once, cannot be forged/reloaded/replayed by Back and cancel restores safe games', async () => {
  setup(); show(groupUrl(group.id), { gameEditToken: 'forged', gameId: uid(20) })
  await screen.findByRole('link', { name: /^Spieldetails:/ })
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
  await selectTab('Mitglieder')
  fireEvent.click(screen.getByRole('button', { name: 'Mitglieder aktualisieren' }))
  await screen.findByRole('tab', { name: 'Spiele' })
  await selectTab('Spiele')
  await screen.findByRole('button', { name: 'Spiel erfassen' })
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
  await openGameDetails()
  await back()
  await screen.findByRole('button', { name: 'Spiel erfassen' })
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
})

test('cancel/Escape/backdrop send zero DELETEs and restore a reachable actions trigger', async () => {
  const api = setup(); show()
  for (const cancelBy of ['button', 'escape', 'backdrop']) {
    await gameAction('Löschen', false)
    const dialog = await screen.findByRole('dialog', { name: 'Spiel endgültig löschen?' })
    expect(dialog).toHaveTextContent(uid(20))
    expect(dialog).toHaveTextContent('endgültig')
    expect(dialog).toHaveTextContent('Decknutzung wird nicht zurückgesetzt')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())
    if (cancelBy === 'button') fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    else if (cancelBy === 'escape') fireEvent.keyDown(dialog, { key: 'Escape' })
    else { const backdrop = document.querySelector('.MuiDialog-container')!; fireEvent.mouseDown(backdrop); fireEvent.click(backdrop) }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spielaktionen' })).toHaveFocus())
  }
  expect(api.calls(gamePath, 'DELETE')).toHaveLength(0)
})

test('DELETE guards CSRF and write lifetime, accepts only 204, replaces detail entry, and Back refetches', async () => {
  const api = setup(), csrf = deferred(), write = deferred()
  show(groupUrl(group.id)); await openGameDetails(); await gameAction('Löschen', false)
  api.next('/api/csrf', () => csrf.promise)
  api.next(gamePath, () => write.promise, 'DELETE')
  const confirm = screen.getByRole('button', { name: 'Endgültig löschen' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
  await act(async () => csrf.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'token' })))
  await waitFor(() => expect(api.calls(gamePath, 'DELETE')).toHaveLength(1))
  api.state.history = []
  await act(async () => write.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.')
  await screen.findByText('No recorded games yet.')
  await back()
  await screen.findByText('No recorded games yet.')
  expect(api.calls(gamePath)).toHaveLength(1)
})

test.each([200, 400, 403, 404, 409, 500, 'network'] as const)('unacknowledged DELETE %s hides old content and safely rechecks membership/game once', async status => {
  const api = setup(), check = deferred()
  show(); await gameAction('Löschen', false)
  api.next(gamePath, () => { if (status === 'network') throw new Error('offline'); return response({}, status) }, 'DELETE')
  api.next(groupPath, () => check.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await waitFor(() => expect(api.calls(groupPath)).toHaveLength(2))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Spielaktionen' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
  await act(async () => check.resolve(response({ ...group, role: 'MEMBER' })))
  await screen.findByRole('heading', { name: 'Spieldetails' })
  expect(screen.queryByRole('button', { name: 'Spielaktionen' })).not.toBeInTheDocument()
  expect(screen.getByText(/Die Löschung wurde nicht bestätigt/)).toBeInTheDocument()
  expect(api.calls(gamePath, 'DELETE')).toHaveLength(1)
  expect(api.calls(gamePath)).toHaveLength(2)
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
})

test.each(['csrf', 'write'])('current %s 401 expires the session without exposing game data', async stage => {
  const api = setup(); show(); await gameAction('Löschen', false)
  api.next(stage === 'csrf' ? '/api/csrf' : gamePath, () => response({}, 401), stage === 'csrf' ? 'GET' : 'DELETE')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
})

test('ambiguous committed delete is inspected as gone and never automatically repeated or announced as success', async () => {
  const api = setup(); show(); await gameAction('Löschen', false)
  api.next(gamePath, () => { api.state.history = []; throw new Error('response lost') }, 'DELETE')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText(gameUnavailable)
  await screen.findByText('No recorded games yet.')
  expect(api.calls(gamePath, 'DELETE')).toHaveLength(1)
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
})

test.each(['denied', 'unavailable', 'invalid-game'])('failed delete recovery %s never restores stale details and explicit retry is read-only', async failure => {
  const api = setup(); show(); await gameAction('Löschen', false)
  api.next(gamePath, () => response({}, 403), 'DELETE')
  if (failure === 'denied') api.next(groupPath, () => response({}, 403))
  else if (failure === 'unavailable') api.next(groupPath, () => { throw new Error('offline') })
  else api.next(gamePath, () => response({ ...recorded(), creatorId: null }))
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  if (failure === 'denied') await screen.findByText(groupUnavailable)
  else {
    fireEvent.click(await screen.findByRole('button', { name: 'Spieldetails erneut prüfen' }))
    await screen.findByRole('heading', { name: 'Spieldetails' })
  }
  expect(api.calls(gamePath, 'DELETE')).toHaveLength(1)
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
})

test.each((['read', 'csrf', 'delete', 'retry'] as const).flatMap(stage => [200, 401].map(status => ({ stage, status }))))('late $stage/$status after route retirement cannot restore/expire private state or send a prepared write', async ({ stage, status }) => {
  const api = setup(), late = deferred()
  if (stage === 'read') api.next(gamePath, () => late.promise)
  show()
  if (stage === 'read') await waitFor(() => expect(api.calls(gamePath)).toHaveLength(1))
  else if (stage === 'retry') {
    api.next(gamePath, () => response({}, 403), 'DELETE')
    await gameAction('Löschen', false)
    api.next(groupPath, () => late.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(() => expect(api.calls(groupPath)).toHaveLength(2))
  } else {
    await gameAction('Löschen', false)
    api.next(stage === 'csrf' ? '/api/csrf' : gamePath, () => late.promise, stage === 'csrf' ? 'GET' : 'DELETE')
    fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(() => expect(api.calls(stage === 'csrf' ? '/api/csrf' : gamePath, stage === 'csrf' ? 'GET' : 'DELETE')).toHaveLength(1))
  }
  fireEvent.click(await screen.findByRole('link', { name: 'Decks' }))
  await screen.findByRole('button', { name: 'Deck erstellen' })
  await act(async () => late.resolve(response(stage === 'csrf' ? { headerName: 'X-CSRF-TOKEN', token: 'late' } : stage === 'read' ? recorded() : group, status)))
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Spieldetails' })).not.toBeInTheDocument()
  if (stage === 'csrf') expect(api.calls(gamePath, 'DELETE')).toHaveLength(0)
})

test.each([1, 4])('logout and same/different UUID login (%s) retire old game GET/401 and CSRF writes', async actor => {
  const api = setup(), late = deferred()
  api.next(gamePath, () => late.promise)
  show(); await waitFor(() => expect(api.calls(gamePath)).toHaveLength(1))
  fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  api.server.loginUser = { id: uid(actor), username: 'New session' }
  await login()
  await act(async () => late.resolve(response({}, 401)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('New session')
  fireEvent.click(screen.getByRole('link', { name: 'Playgroups' }))
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await gameAction('Löschen')
  const csrf = deferred()
  api.next('/api/csrf', () => csrf.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await waitFor(() => expect(api.calls('/api/csrf').length).toBeGreaterThan(0))
  fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  await login()
  await act(async () => csrf.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'retired' })))
  expect(api.calls(gamePath, 'DELETE')).toHaveLength(0)
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('New session')
})


test.each([1, 4].flatMap(actor => [204, 401].map(status => ({ actor, status }))))('retired DELETE $status cannot affect a new session with user $actor', async ({ actor, status }) => {
  const api = setup(), late = deferred()
  show(); await gameAction('Löschen', false)
  api.next(gamePath, () => late.promise, 'DELETE')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await waitFor(() => expect(api.calls(gamePath, 'DELETE')).toHaveLength(1))
  fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  api.server.loginUser = { id: uid(actor), username: 'Replacement session' }
  await login()
  await act(async () => late.resolve(status === 204 ? new Response(null, { status: 204 }) : response({}, status)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Replacement session')
  expect(screen.queryByText(/Spiel gelöscht/)).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Spieldetails' })).not.toBeInTheDocument()
  expect(api.calls(gamePath, 'DELETE')).toHaveLength(1)
})


test('handed-off edit preserves its draft across tabs and refreshes visited sorted statistics independently of pending history', async () => {
  const api = setup(), history = deferred()
  api.state.statistics = statistics()
  show(); await gameAction('Bearbeiten', false)
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  await selectTab('Statistiken')
  const first = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(first).getByRole('button', { name: 'Siege' }))
  await selectTab('Spiele')
  expect(screen.getByRole('combobox', { name: 'Spielergebnis' })).toHaveValue('DRAW')
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  expect(screen.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue(uid(2))
  api.state.statistics = { ...statistics(), players: [{ ...statistics().players[0], wins: 0, winRatePercent: 0 }] }
  api.next(`${groupPath}/games`, () => history.promise)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Spiel speichern' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game updated.')
  await selectTab('Statistiken')
  const updated = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(updated).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
  expect(within(updated).getByRole('row', { name: /Ada/ })).toHaveTextContent('1200%')
  expect(screen.getByText('Loading game history…')).not.toBeVisible()
  expect(api.calls(`${groupPath}/statistics`)).toHaveLength(2)
})

test.each([['OWNER', 1], ['MEMBER', 2]] as const)('LAN HTTP hands off %s game edits with fresh authorization, then prevents Forward replay', async (role, actor) => {
  const api = setup()
  api.server.user = { id: uid(actor), username: role === 'OWNER' ? 'Owner' : 'Creator' }
  api.server.details = { ...group, role }
  show(); await gameAction('Bearbeiten', false)
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  expect(window.location.pathname).toBe(groupUrl(group.id))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game updated.')
  expect(api.calls(gamePath, 'PUT')).toHaveLength(1)
  expect(JSON.parse(api.calls(gamePath, 'PUT')[0][1]!.body as string)).toMatchObject({ result: 'DRAW', alternateWinCon: false })
  act(() => window.history.back())
  await screen.findByRole('heading', { name: 'Spieldetails' })
  act(() => window.history.forward())
  await screen.findByRole('button', { name: 'Spiel erfassen' })
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
})

test.each([1, 4])('LAN HTTP logout and login as %s retire a game draft and its history token', async actor => {
  const api = setup()
  show(); await gameAction('Bearbeiten', false)
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  // Keep the original token-bearing Spiele entry behind the tab entry that logout replaces.
  await selectTab('Mitglieder')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  api.server.loginUser = { id: uid(actor), username: 'Replacement' }
  await login()
  await screen.findByRole('heading', { name: 'Dashboard' })
  act(() => window.history.back())
  await screen.findByRole('button', { name: 'Spiel erfassen' })
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
  expect(api.calls(gamePath, 'PUT')).toHaveLength(0)
})

test.each([
  { mode: 'normal', ranks: [2, 4, 1, 2], seats: [4, 2, 3, 1], order: [3, 4, 1, 2] },
  { mode: 'alternate', ranks: [4, 2, 4, 1, 2], seats: [2, 4, 5, 3, 1], order: [4, 5, 2, 1, 3] },
  { mode: 'draw', ranks: [null, null, null, null], seats: [4, 2, 3, 1], order: [4, 2, 3, 1] },
])('$mode orders by effective rank/start seat and labels results explicitly', async ({ mode, ranks, seats, order }) => {
  const api = setup()
  const participants = ranks.map((placement, i) => ({ ...recorded().participants[0], userId: uid(i + 1), username: `Player ${i + 1}`,
    placement, startPosition: seats[i], stillInGame: mode === 'draw' ? i % 2 === 0 : placement === 1 || (mode === 'alternate' && placement === 2),
  }))
  api.state.history = [recorded({ result: mode === 'draw' ? 'DRAW' : 'WIN', alternateWinCon: mode === 'alternate',
    winnerUserId: mode === 'draw' ? null : participants.find(p => p.placement === 1)!.userId, participants })]
  show()
  const list = await screen.findByRole('list', { name: 'Teilnehmende und Decks' })
  const cards = within(list).getAllByRole('listitem')
  expect(cards.map(card => within(card).getByRole('heading').textContent)).toEqual(order.map(i => `Player ${i}`))
  cards.forEach((card, i) => expect(card).toHaveTextContent(`Startplatz: ${seats[order[i] - 1]}`))
  if (mode === 'draw') {
    expect(within(list).queryByText(/Platzierung:/)).not.toBeInTheDocument()
    expect(within(list).queryByText(/Sieg/)).not.toBeInTheDocument()
    expect(within(list).getAllByText('Noch im Spiel')).toHaveLength(2)
    expect(within(list).getAllByText('Ausgeschieden')).toHaveLength(2)
  } else {
    expect(within(list).getAllByText('🏆 Sieg')).toHaveLength(1)
    expect(within(cards[1]).getByText('Platzierung: 2')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Platzierung: 2')).toBeInTheDocument()
    expect(getComputedStyle(cards[1]).marginLeft).toBe(getComputedStyle(cards[2]).marginLeft)
  }
})

test('fresh details use current deck snapshots, including one to two commanders and missing artwork', async () => {
  const api = setup(), game = recorded()
  game.participants[0].deck.commanders[0].artCropUrl = 'https://cards.scryfall.io/old.jpg'
  api.state.history = [game]
  const first = show()
  fireEvent.error(await screen.findByRole('img', { name: 'Illustration für Commander 2' }))
  first.unmount()
  const commander = game.participants[0].deck.commanders[0]
  const deck = { ...game.participants[0].deck, id: uid(999), commanders: [
    { ...commander, name: 'New first', artCropUrl: 'https://cards.scryfall.io/new.jpg' },
    { ...commander, name: 'New second', oracleId: uid(998), position: 2, artCropUrl: null },
  ] }
  api.state.history = [{ ...game, participants: [{ ...game.participants[0], deckId: deck.id, deck }, game.participants[1]] }]
  show()
  expect(await screen.findByRole('img', { name: 'Illustration für New first' })).toHaveAttribute('src', 'https://cards.scryfall.io/new.jpg')
  expect(screen.getByRole('img', { name: 'Keine Illustration für New second verfügbar' })).toBeInTheDocument()
  expect(screen.queryByText('Commander: Commander 2')).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path]) => path.includes('scryfall'))).toBe(false)
})
