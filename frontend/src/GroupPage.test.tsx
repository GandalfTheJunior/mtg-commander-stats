import { stubLanHttpCrypto } from './test/lanHttp'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { AppRouter } from './AppRouter'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { groupUnavailable, groupUrl } from './groupNavigation'
import { deckFor, deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'
import { goTo } from './test/renderApp'
import { selectGameDeck } from './test/gameEntry'
import { openCodeScreen, selectTab, showCode } from './test/groupEntry'
import type { CurrentUser, GroupDetails } from './api'
import { statistics } from './test/statisticsFixtures'

const actor = { id: uid(1), username: 'Owner' }
const other: GroupDetails = { ...group, id: uid(11), name: 'Sunday pod', role: 'MEMBER' }
const oldCode = 'abcdefghijklmnopqrstuv'
const newCode = 'ABCDEFGHIJKLMNOPQRSTUV'
const codePath = `/api/groups/${group.id}/join-code`
const detailPath = `/api/groups/${group.id}`
const leavePath = `/api/groups/${other.id}/membership`
function setup() {
  const base = gameApi([recorded()])
  const state = { user: actor as CurrentUser | null, loginUser: actor, groups: { [group.id]: { ...group }, [other.id]: { ...other } } as Record<string, GroupDetails>, code: oldCode }
  const replies = new Map<string, Array<() => Response | Promise<Response>>>()
  function next(path: string, reply: () => Response | Promise<Response>, method = 'GET') {
    const key = `${method} ${path}`
    replies.set(key, [...replies.get(key) ?? [], reply])
  }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET'
    const reply = replies.get(`${method} ${path}`)?.shift()
    if (reply) return reply()
    if (path === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (path === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (path === '/api/decks') return response([])
    if (path === '/api/groups') return response(Object.values(state.groups).map(({ id, name, role }) => ({ id, name, role })))
    if (path === '/api/groups/join') { state.groups[other.id] = { ...other }; return response(other) }
    if (path.endsWith('/membership') && method === 'DELETE') {
      const id = path.split('/')[3]; delete state.groups[id]
      return new Response(null, { status: 204 })
    }
    if (path.endsWith('/join-code')) {
      if (method === 'POST') state.code = newCode
      return response({ code: state.code })
    }
    const match = path.match(/^\/api\/groups\/([^/]+)$/)
    if (match) return response(state.groups[match[1]] ?? {}, state.groups[match[1]] ? 200 : 403)
    if (path === `/api/groups/${other.id}/games`) return response([])
    return base.fetchMock(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  const calls = (path: string, method = 'GET') => fetchMock.mock.calls.filter(([url, init]) => url === path && (init?.method ?? 'GET') === method)
  return { state, next, calls, fetchMock, games: base }
}
function show(path = groupUrl(group.id), state: unknown = null, strict = false) {
  window.history.replaceState(state == null ? null : { usr: state, key: 'test' }, '', path)
  const app = <AppThemeProvider><AppRouter><App /></AppRouter></AppThemeProvider>
  return render(strict ? <StrictMode>{app}</StrictMode> : app)
}
async function groupReady(name = group.name) {
  await screen.findByRole('heading', { name })
  await screen.findByRole('tab', { name: 'Spiele' })
}
async function menuAction(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppenaktionen' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
}
async function regenerate() {
  fireEvent.click(screen.getByRole('button', { name: 'Code regenerieren' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Regenerieren bestätigen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}
async function leave() {
  await menuAction('Gruppe verlassen')
  fireEvent.click(await screen.findByRole('button', { name: 'Verlassen bestätigen' }))
}
async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'owner@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
}
// Exercise navigation, guards and retirement with the capabilities of LAN HTTP.
beforeEach(stubLanHttpCrypto)

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

test.each([['', 'Spiele'], ['?tab=statistics', 'Statistiken'], ['?tab=members', 'Mitglieder']] as const)('direct group URL %s confirms membership and exposes only its selected tab', async (query, label) => {
  const api = setup(); show(groupUrl(group.id) + query)
  await groupReady()
  expect(screen.getByRole('tab', { name: label, selected: true })).toHaveAttribute('aria-controls', `group-panel-${label === 'Spiele' ? 'games' : label === 'Statistiken' ? 'statistics' : 'members'}`)
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  const panel = screen.getByRole('tabpanel', { name: label })
  expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: label }).id)
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Zurück zu Playgroups' })).toHaveAttribute('href', '/playgroups')
  expect(screen.getByRole('link', { name: 'Playgroups', current: 'page' })).toBeInTheDocument()
  expect(api.calls(detailPath)).toHaveLength(1)
  expect(api.calls(codePath)).toHaveLength(0)
  if (label === 'Statistiken') expect(await screen.findByRole('heading', { name: 'Statistiken' })).toBeInTheDocument()
  else expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
})

test('the group list has create/join and no selected group underneath, even with replayed Dashboard state', async () => {
  const api = setup(); show('/playgroups', { dashboardToken: 'old', kind: 'group', id: group.id })
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(api.calls(detailPath)).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: group.name }))
  await groupReady()
  expect(window.location.pathname).toBe(groupUrl(group.id))
  expect(api.calls(detailPath)).toHaveLength(1)
})

test.each(['nonsense', 'games', '', 'MEMBERS', 'members&tab=statistics'])('invalid/repeated tab %s is normalized using replace and never duplicates authorization', async value => {
  const api = setup(); const length = window.history.length
  show(`${groupUrl(group.id)}?tab=${value}`)
  await groupReady()
  await waitFor(() => expect(window.location.search).toBe(value === 'members&tab=statistics' ? '?tab=members' : ''))
  expect(window.history.length).toBe(length)
  expect(api.calls(detailPath)).toHaveLength(1)
})

test('session verification and a fresh details GET gate every protected group label and request', async () => {
  const api = setup(), me = deferred(), details = deferred()
  api.next('/api/me', () => me.promise); api.next(detailPath, () => details.promise)
  show(groupUrl(group.id, 'members'))
  expect(screen.getByText('Checking your session…')).toBeInTheDocument()
  expect(api.calls(detailPath)).toHaveLength(0)
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  await act(async () => me.resolve(response(actor)))
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${group.id}/games`)).toHaveLength(0)
  await act(async () => details.resolve(response(group)))
  expect(await screen.findByRole('list', { name: 'Aktive Mitglieder' })).toBeInTheDocument()
})

test.each(['', '?tab=statistics', '?tab=members', '/invitation-code'])('signed-out deep link %s resumes safely after login with fresh authorization', async suffix => {
  const api = setup(); api.state.user = null
  show(groupUrl(group.id) + suffix)
  await screen.findByText('Not signed in.')
  expect(api.calls(detailPath)).toHaveLength(0)
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  await signIn()
  if (suffix === '/invitation-code') await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  else await groupReady()
  expect(window.location.pathname + window.location.search).toBe(groupUrl(group.id) + suffix)
  expect(api.calls(detailPath)).toHaveLength(1)
  expect(api.calls(codePath)).toHaveLength(0)
})

test.each(['bad-id', 'abcdefghijklmnopqrstuv', uid(99)])('invalid, join-code-shaped or missing UUID %s falls back without private state', async id => {
  const api = setup(); show(groupUrl(id, 'members'))
  await screen.findByText(groupUnavailable)
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(window.location.pathname).toBe('/playgroups')
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${id}`)).toHaveLength(id === uid(99) ? 1 : 0)
})

test.each([400, 403, 404, 401])('details GET %s retires all protected content using the appropriate recovery', async status => {
  const api = setup(); api.next(detailPath, () => response({}, status))
  show(groupUrl(group.id))
  await screen.findByText(status === 401 ? 'Your session expired. Sign in again.' : groupUnavailable)
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  expect(api.calls(codePath)).toHaveLength(0)
  if (status !== 401) expect(await screen.findByRole('button', { name: 'Log out' })).toBeEnabled()
})

test.each(['network', 'malformed', 'wrong group'])('failed verification (%s) hides content until explicit successful retry', async kind => {
  const api = setup(); api.next(detailPath, () => {
    if (kind === 'network') throw new Error('offline')
    return response(kind === 'malformed' ? { ...group, members: 'invalid' } : other)
  })
  show(); fireEvent.click(await screen.findByRole('button', { name: 'Gruppe erneut laden' }))
  await groupReady()
  expect(api.calls(detailPath)).toHaveLength(2)
})

test.each([false, true])('Dashboard opens stable Spiele URL with server role, independent of old summary role (StrictMode %s)', async strict => {
  const api = setup(); show('/dashboard', null, strict)
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await groupReady()
  expect(window.location.pathname).toBe(groupUrl(group.id))
  expect(window.history.state.usr).toBeNull()
  expect(screen.getByRole('heading', { name: group.name })).toHaveFocus()
  api.state.groups[group.id] = { ...group, role: 'MEMBER' }
  await selectTab('Mitglieder')
  fireEvent.click(screen.getByRole('button', { name: 'Mitglieder aktualisieren' }))
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  await menuAction('Gruppe verlassen')
  expect(screen.queryByRole('menuitem', { name: 'Einladungscode verwalten' })).not.toBeInTheDocument()
  expect(await screen.findByRole('dialog', { name: 'Gruppe verlassen?' })).toBeInTheDocument()
})

test('tab history, Forward, reload and deterministic list return restore authorized destinations', async () => {
  const api = setup(); const view = show()
  await groupReady(); await selectTab('Statistiken'); await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  await selectTab('Mitglieder')
  expect(window.location.search).toBe('?tab=members')
  await act(async () => window.history.back())
  await screen.findByRole('tab', { name: 'Statistiken', selected: true })
  await act(async () => window.history.back())
  await screen.findByRole('tab', { name: 'Spiele', selected: true })
  await act(async () => window.history.forward())
  await screen.findByRole('tab', { name: 'Statistiken', selected: true })
  expect(api.calls(detailPath)).toHaveLength(1)
  view.unmount(); show(window.location.pathname + window.location.search)
  await screen.findByRole('tab', { name: 'Statistiken', selected: true })
  expect(api.calls(detailPath)).toHaveLength(2)
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' }))
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(window.location.pathname).toBe('/playgroups')
})

test('inline draft and eligible selections survive every same-group tab switch without duplicate game requests', async () => {
  const api = setup(); show(); await groupReady()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).not.toBeDisabled())
  fireEvent.change(screen.getByRole('combobox', { name: 'Deck für Spieler 1' }), { target: { value: deckFor(2).id } })
  const summary = screen.getByRole('button', { name: 'Spieler 1 bearbeiten' }); summary.focus()
  await selectTab('Statistiken'); await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Statistiken' })).toHaveFocus()
  await selectTab('Mitglieder'); expect(screen.queryByRole('heading', { name: 'Statistiken' })).not.toBeInTheDocument()
  await selectTab('Spiele')
  expect(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  expect(screen.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue(uid(2))
  expect(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).toHaveValue(deckFor(2).id)
  expect(api.calls(`/api/groups/${group.id}/games`)).toHaveLength(1)
  expect(api.calls(`/api/groups/${group.id}/members/${uid(2)}/decks`)).toHaveLength(1)
  expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(0)
})

test('member rows use only active details, roles, exact-ID Du and sufficient suffixes only for colliding names', async () => {
  const api = setup()
  api.state.groups[group.id] = { ...group, members: [
    { userId: uid(11111), username: 'Twin', role: 'OWNER' },
    { userId: uid(21111), username: 'Twin', role: 'MEMBER' },
    { userId: actor.id, username: actor.username, role: 'MEMBER' },
  ] }
  show(groupUrl(group.id, 'members'))
  const list = await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  const rows = within(list).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Twin◆ GruppenerstellerKennung: …11111')
  expect(rows[1]).toHaveTextContent('TwinMitgliedKennung: …21111')
  expect(rows[2]).toHaveTextContent('Owner · DuMitglied')
  expect(within(list).getAllByText(/Kennung:/)).toHaveLength(2)
  expect(list.textContent).not.toContain(actor.id)
  expect(list.textContent).not.toContain(uid(11111))
  expect(list.textContent).not.toContain('@')
})

test('direct invitation screen verifies OWNER without eager code GET; selectable case-sensitive code and copy failure stay honest', async () => {
  const api = setup(); show(`${groupUrl(group.id)}/invitation-code`)
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  expect(api.calls(codePath)).toHaveLength(0)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  expect(await screen.findByLabelText('Aktueller Einladungscode')).toHaveValue(oldCode)
  expect(screen.getByLabelText('Aktueller Einladungscode')).toHaveAttribute('readonly')
  expect(api.calls(codePath)[0][1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) })
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
  fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
  await screen.findByText(/manuell kopieren/)
  expect(screen.getByLabelText('Aktueller Einladungscode')).toHaveValue(oldCode)
  expect(screen.queryByText('Einladungscode kopiert.')).not.toBeInTheDocument()
})

test.each(['success', 'missing', 'rejected', 'missing writeText'] as const)('clipboard %s keeps selectable manual copy and reports only actual success', async outcome => {
  setup(); show(); await showCode(); await screen.findByDisplayValue(oldCode)
  const writeText = outcome === 'rejected' ? vi.fn().mockRejectedValue(new Error('Denied')) : vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', outcome === 'missing' ? {} : { clipboard: outcome === 'missing writeText' ? {} : { writeText } })
  fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
  await screen.findByText(outcome === 'success' ? 'Einladungscode kopiert.' : /sichtbaren Code im Feld auswählen und manuell kopieren/)
  if (outcome === 'success' || outcome === 'rejected') expect(writeText).toHaveBeenCalledWith(oldCode)
  else expect(writeText).not.toHaveBeenCalled()
  const field = screen.getByLabelText<HTMLInputElement>('Aktueller Einladungscode')
  expect(field).toHaveValue(oldCode)
  expect(field).toHaveAttribute('readonly')
  expect(field).toBeEnabled()
  field.focus(); field.select()
  expect(field.selectionStart).toBe(0)
  expect(field.selectionEnd).toBe(oldCode.length)
  if (outcome !== 'success') expect(screen.queryByText('Einladungscode kopiert.')).not.toBeInTheDocument()
})

test('copy success is announced only after writeText resolves and a subsequent rejection clears success', async () => {
  setup(); show(); await showCode(); await screen.findByDisplayValue(oldCode)
  const pending = deferred()
  const writeText = vi.fn().mockImplementationOnce(() => pending.promise).mockRejectedValue(new Error('Denied'))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
  expect(screen.queryByText('Einladungscode kopiert.')).not.toBeInTheDocument()
  await act(async () => pending.resolve(new Response()))
  await screen.findByText('Einladungscode kopiert.')
  fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
  await screen.findByText(/manuell kopieren/)
  expect(screen.queryByText('Einladungscode kopiert.')).not.toBeInTheDocument()
})

test('code return is limited to a session-confirmed originating tab; reload or forged state falls back to Spiele', async () => {
  setup(); const view = show(groupUrl(group.id, 'members'))
  await openCodeScreen()
  expect(screen.getByRole('link', { name: 'Zurück zur Gruppe' })).toHaveAttribute('href', groupUrl(group.id, 'members'))
  const path = window.location.pathname, state = window.history.state.usr
  expect(JSON.stringify(state)).not.toContain(oldCode)
  view.unmount(); show(path, { ...state, returnTo: 'https://example.com', tab: 'members' })
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  expect(screen.getByRole('link', { name: 'Zurück zur Gruppe' })).toHaveAttribute('href', groupUrl(group.id))
})

test('ordinary MEMBER direct code URL is freshly rejected, retaining authorized group access without fetching a code', async () => {
  const api = setup(); show(`${groupUrl(other.id)}/invitation-code`)
  await groupReady(other.name)
  expect(window.location.pathname).toBe(groupUrl(other.id))
  expect(screen.queryByRole('button', { name: 'Einladungscode anzeigen' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith('/join-code'))).toBe(false)
  await menuAction('Gruppe verlassen')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test.each(['Abbrechen', 'Escape'])('regeneration %s sends no POST and restores focus', async action => {
  const api = setup(); show(); await showCode(); await screen.findByDisplayValue(oldCode)
  const trigger = screen.getByRole('button', { name: 'Code regenerieren' })
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Einladungscode regenerieren?' })
  expect(dialog).toHaveTextContent('sofort ungültig')
  expect(dialog).toHaveTextContent('Bestehende Mitglieder bleiben')
  expect(dialog).toHaveTextContent('erneutes Beitreten')
  if (action === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' })
  else fireEvent.click(within(dialog).getByRole('button', { name: action }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  expect(api.calls(codePath, 'POST')).toHaveLength(0)
  expect(screen.getByDisplayValue(oldCode)).toBeInTheDocument()
})

test('only acknowledged regeneration displays its new code; duplicate confirmation cannot resend', async () => {
  const api = setup(), pending = deferred(); show(); await showCode(); await screen.findByDisplayValue(oldCode)
  api.next(codePath, () => pending.promise, 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Code regenerieren' }))
  const confirm = await screen.findByRole('button', { name: 'Regenerieren bestätigen' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(api.calls(codePath, 'POST')).toHaveLength(1))
  expect(screen.queryByDisplayValue(oldCode)).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(newCode)).not.toBeInTheDocument()
  await act(async () => pending.resolve(response({ code: newCode })))
  await screen.findByDisplayValue(newCode)
  expect(screen.getByText(/Der neue Einladungscode wurde bestätigt/)).toBeInTheDocument()
  expect(api.calls(codePath, 'POST')).toHaveLength(1)
})

test.each(['network', 'abort', 'malformed', 'invalid JSON', 'unexpected status', 403, 404, 500])('unconfirmed regeneration (%s) removes old code, safely revalidates, never repeats POST, and offers explicit current GET', async failure => {
  const api = setup(); show(); await showCode(); await screen.findByDisplayValue(oldCode)
  api.next(codePath, () => {
    if (failure === 'network') throw new Error('response lost')
    if (failure === 'abort') throw new DOMException('Aborted', 'AbortError')
    if (failure === 'invalid JSON') return new Response('bad JSON', { status: 200 })
    return response(failure === 'malformed' ? { code: 'invalid' } : {}, typeof failure === 'number' ? failure : failure === 'unexpected status' ? 201 : 200)
  }, 'POST')
  await regenerate()
  await screen.findByText(/Die Codeänderung wurde nicht bestätigt/)
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  expect(screen.queryByDisplayValue(oldCode)).not.toBeInTheDocument()
  expect(screen.queryByText(/Der neue Einladungscode wurde bestätigt/)).not.toBeInTheDocument()
  expect(api.calls(codePath)).toHaveLength(1)
  expect(api.calls(codePath, 'POST')).toHaveLength(1)
  expect(api.calls(detailPath)).toHaveLength(3) // group entry, code entry, safe recovery
  api.state.code = newCode
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  await screen.findByDisplayValue(newCode)
  expect(api.calls(codePath, 'POST')).toHaveLength(1)
})

test.each(['OWNER', 'MEMBER', 'lost', '401', 'unavailable'] as const)('code GET 403 revalidates group as %s without treating denial as logout', async outcome => {
  const api = setup(); show(`${groupUrl(group.id)}/invitation-code`)
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  api.next(codePath, () => response({}, 403))
  api.next(detailPath, () => response(outcome === 'OWNER' || outcome === 'MEMBER' ? { ...group, role: outcome } : {}, outcome === 'lost' ? 403 : outcome === '401' ? 401 : outcome === 'unavailable' ? 500 : 200))
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  if (outcome === '401') await screen.findByText('Your session expired. Sign in again.')
  else if (outcome === 'lost') await screen.findByText(groupUnavailable)
  else if (outcome === 'unavailable') await screen.findByRole('button', { name: 'Gruppe erneut laden' })
  else if (outcome === 'MEMBER') {
    api.state.groups[group.id].role = 'MEMBER'
    await groupReady()
    expect(window.location.pathname).toBe(groupUrl(group.id))
  } else await screen.findByText(/Codeaktion wurde abgelehnt/)
  expect(screen.queryByLabelText('Aktueller Einladungscode')).not.toBeInTheDocument()
  expect(api.calls(codePath)).toHaveLength(1)
  if (outcome !== '401') expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled()
})

test.each(['retrieve', 'regenerate', 'csrf'] as const)('code %s 401 invokes the existing safe session-expiry path', async operation => {
  const api = setup(); show(); await openCodeScreen()
  api.next(operation === 'csrf' ? '/api/csrf' : codePath, () => response({}, 401), operation === 'regenerate' ? 'POST' : 'GET')
  if (operation === 'retrieve') fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  else await regenerate()
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  if (operation === 'csrf') expect(api.calls(codePath, 'POST')).toHaveLength(0)
})

test.each(['Abbrechen', 'Escape'])('MEMBER departure %s sends no DELETE and restores overflow focus', async action => {
  const api = setup(); show(groupUrl(other.id)); await menuAction('Gruppe verlassen')
  const dialog = await screen.findByRole('dialog', { name: 'Gruppe verlassen?' })
  expect(dialog).toHaveTextContent('sofort den aktiven Zugriff')
  expect(dialog).toHaveTextContent('Historische Spiele und Statistiken bleiben erhalten')
  expect(dialog).toHaveTextContent('aktuellen gültigen Einladungscode')
  if (action === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' })
  else fireEvent.click(within(dialog).getByRole('button', { name: action }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Gruppenaktionen' })).toHaveFocus()
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(0)
})

test('OWNER has only code management in overflow and cannot submit departure', async () => {
  const api = setup(); show(); await groupReady()
  fireEvent.click(screen.getByRole('button', { name: 'Gruppenaktionen' }))
  expect(await screen.findByRole('menuitem', { name: 'Einladungscode verwalten' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitem', { name: 'Gruppe verlassen' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Verlassen bestätigen' })).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${group.id}/membership`, 'DELETE')).toHaveLength(0)
})

test('204 departure replaces history, retires data, reauthorizes obsolete Back and rejoin opens fresh MEMBER data', async () => {
  const api = setup(); show('/dashboard')
  fireEvent.click(await screen.findByRole('button', { name: other.name }))
  await groupReady(other.name)
  await selectTab('Mitglieder') // older Spiele entry remains, but can never reveal old data
  const length = window.history.length
  await leave()
  await screen.findByText(/Du hast die Gruppe verlassen/)
  await screen.findByRole('button', { name: 'Gruppe beitreten' })
  expect(window.location.pathname).toBe('/playgroups')
  expect(window.history.length).toBe(length)
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  await act(async () => window.history.back())
  await screen.findByText(groupUnavailable)
  expect(screen.queryByRole('heading', { name: other.name })).not.toBeInTheDocument()
  await screen.findByRole('button', { name: 'Gruppe beitreten' })
  fireEvent.change(screen.getByLabelText(/Einladungscode/), { target: { value: oldCode } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe beitreten' }))
  fireEvent.click(await screen.findByRole('button', { name: other.name }))
  await groupReady(other.name)
  await menuAction('Gruppe verlassen')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(1)
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith('/join-code'))).toBe(false)
})

test.each(['network', 'abort', 200, 400, 403, 500])('failed/ambiguous departure (%s) never claims success or repeats DELETE and rechecks current membership', async failure => {
  const api = setup(); show(groupUrl(other.id)); await groupReady(other.name)
  api.next(leavePath, () => {
    if (failure === 'network') throw new Error('offline')
    if (failure === 'abort') throw new DOMException('Aborted', 'AbortError')
    return response({}, typeof failure === 'number' ? failure : 500)
  }, 'DELETE')
  await leave()
  await screen.findByText(/Der Austritt wurde nicht bestätigt/)
  await groupReady(other.name)
  expect(screen.queryByText(/Du hast die Gruppe verlassen/)).not.toBeInTheDocument()
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(1)
  expect(api.calls(`/api/groups/${other.id}`)).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled()
})

test('ambiguous committed departure falls back after revalidation without a false success claim', async () => {
  const api = setup(); show(groupUrl(other.id)); await groupReady(other.name)
  api.next(leavePath, () => { delete api.state.groups[other.id]; throw new Error('lost response') }, 'DELETE')
  await leave(); await screen.findByText(groupUnavailable)
  expect(screen.queryByText(/Du hast die Gruppe verlassen/)).not.toBeInTheDocument()
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(1)
})

test.each([true, false])('leave duplicate guard and %s CSRF outcome preserve exact-204 success semantics', async succeeds => {
  const api = setup(), csrf = deferred(); show(groupUrl(other.id)); await groupReady(other.name)
  api.next('/api/csrf', () => csrf.promise)
  await leave()
  await waitFor(() => expect(api.calls('/api/csrf')).toHaveLength(1))
  expect(screen.queryByRole('button', { name: 'Gruppenaktionen' })).not.toBeInTheDocument()
  expect(screen.getByText('Austritt wird bestätigt…')).toBeInTheDocument()
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(0)
  await act(async () => csrf.resolve(succeeds ? response({ headerName: 'X-CSRF-TOKEN', token: 'fresh' }) : response({}, 403)))
  await screen.findByText(succeeds ? /Du hast die Gruppe verlassen/ : /Der Austritt wurde nicht bestätigt/)
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(succeeds ? 1 : 0)
})

test.each(['details', 'code GET', 'code POST', 'code CSRF', 'leave', 'leave CSRF'] as const)('retired %s responses are aborted/ignored after route changes, including late 401 and prepared writes', async resource => {
  const api = setup(), pending = deferred()
  const leaveOp = resource.startsWith('leave')
  if (resource === 'details') api.next(detailPath, () => pending.promise)
  show(groupUrl(leaveOp ? other.id : group.id))
  if (resource === 'details') await screen.findByText('Gruppenberechtigung wird geprüft…')
  else if (leaveOp) {
    await groupReady(other.name)
    api.next(resource === 'leave CSRF' ? '/api/csrf' : leavePath, () => pending.promise, resource === 'leave CSRF' ? 'GET' : 'DELETE')
    await leave()
  } else {
    await openCodeScreen()
    api.next(resource === 'code CSRF' ? '/api/csrf' : codePath, () => pending.promise, resource === 'code POST' ? 'POST' : 'GET')
    if (resource === 'code GET') fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
    else await regenerate()
  }
  const pendingPath = resource.endsWith('CSRF') ? '/api/csrf' : resource === 'details' ? detailPath : leaveOp ? leavePath : codePath
  const method = resource === 'code POST' ? 'POST' : resource === 'leave' ? 'DELETE' : 'GET'
  await waitFor(() => expect(api.calls(pendingPath, method)).toHaveLength(1))
  const signal = api.calls(pendingPath, method)[0][1]!.signal!
  await goTo('Playgroups'); await screen.findByRole('button', { name: 'Gruppe erstellen' })
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(resource.endsWith('CSRF') ? response({ headerName: 'X-CSRF-TOKEN', token: 'retired' }) : response({}, 401)))
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Aktueller Einladungscode')).not.toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  if (resource.endsWith('CSRF')) expect(api.calls(leaveOp ? leavePath : codePath, leaveOp ? 'DELETE' : 'POST')).toHaveLength(0)
})

test.each([actor, { id: uid(4), username: 'Fourth' }].flatMap(loginUser => ['GET', 'POST'].map(method => ({ loginUser, method }))))('same/different UUID login ($loginUser.username) cannot revive a late code $method, role, or return context', async ({ loginUser, method }) => {
  const api = setup(), pending = deferred(); show(groupUrl(group.id, 'members'))
  await openCodeScreen(); api.next(codePath, () => pending.promise, method)
  if (method === 'POST') await regenerate()
  else fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  await waitFor(() => expect(api.calls(codePath, method)).toHaveLength(1))
  api.state.loginUser = loginUser
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.'); await signIn()
  await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await openCodeScreen()
  expect(screen.getByRole('link', { name: 'Zurück zur Gruppe' })).toHaveAttribute('href', groupUrl(group.id))
  await act(async () => pending.resolve(response({ code: oldCode })))
  expect(screen.queryByLabelText('Aktueller Einladungscode')).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent(loginUser.username)
})

test.each(['OWNER', 'MEMBER', 401, 403, 404, 500] as const)('regeneration CSRF/authorization 403 hides the old code during safe recheck and handles %s', async outcome => {
  const api = setup(), check = deferred(); show(); await showCode(); await screen.findByDisplayValue(oldCode)
  api.next(codePath, () => response({}, 403), 'POST')
  api.next(detailPath, () => check.promise)
  await regenerate()
  await screen.findByText('Gruppenberechtigung wird geprüft…')
  expect(screen.queryByDisplayValue(oldCode)).not.toBeInTheDocument()
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Einladungscode anzeigen' })).not.toBeInTheDocument()
  if (typeof outcome === 'string') api.state.groups[group.id].role = outcome
  await act(async () => check.resolve(response(typeof outcome === 'string' ? api.state.groups[group.id] : {}, typeof outcome === 'number' ? outcome : 200)))
  if (outcome === 401) await screen.findByText('Your session expired. Sign in again.')
  else if (outcome === 403 || outcome === 404) await screen.findByText(groupUnavailable)
  else if (outcome === 500) await screen.findByRole('button', { name: 'Gruppe erneut laden' })
  else if (outcome === 'MEMBER') {
    await groupReady()
    await menuAction('Gruppe verlassen')
    expect(screen.queryByRole('button', { name: 'Einladungscode anzeigen' })).not.toBeInTheDocument()
  } else await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  expect(screen.queryByDisplayValue(oldCode)).not.toBeInTheDocument()
  expect(api.calls(codePath)).toHaveLength(1)
  expect(api.calls(codePath, 'POST')).toHaveLength(1)
})

test.each(['DELETE', 'CSRF'] as const)('departure %s 401 hides protected state and expires the current session', async operation => {
  const api = setup(); show(groupUrl(other.id)); await groupReady(other.name)
  api.next(operation === 'CSRF' ? '/api/csrf' : leavePath, () => response({}, 401), operation === 'CSRF' ? 'GET' : 'DELETE')
  await leave(); await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByText(other.name)).not.toBeInTheDocument()
  expect(screen.queryByText(/Du hast die Gruppe verlassen/)).not.toBeInTheDocument()
  if (operation === 'CSRF') expect(api.calls(leavePath, 'DELETE')).toHaveLength(0)
})

test.each([401, 403, 404, 500, 'OWNER'] as const)('unconfirmed departure followed by group recheck %s restores only freshly authorized actions', async outcome => {
  const api = setup(); show(groupUrl(other.id)); await groupReady(other.name)
  api.next(leavePath, () => response({}, 403), 'DELETE')
  if (outcome === 'OWNER') api.state.groups[other.id].role = 'OWNER'
  else api.next(`/api/groups/${other.id}`, () => response({}, outcome))
  await leave()
  if (outcome === 401) await screen.findByText('Your session expired. Sign in again.')
  else if (outcome === 403 || outcome === 404) await screen.findByText(groupUnavailable)
  else if (outcome === 500) await screen.findByRole('button', { name: 'Gruppe erneut laden' })
  else {
    await groupReady(other.name)
    fireEvent.click(screen.getByRole('button', { name: 'Gruppenaktionen' }))
    expect(await screen.findByRole('menuitem', { name: 'Einladungscode verwalten' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Gruppe verlassen' })).not.toBeInTheDocument()
  }
  expect(screen.queryByText(/Du hast die Gruppe verlassen/)).not.toBeInTheDocument()
  expect(api.calls(leavePath, 'DELETE')).toHaveLength(1)
})

test.each(['details', 'code GET', 'code POST'] as const)('late successful %s cannot restore a previous group after switching to a MEMBER group', async resource => {
  const api = setup(), late = deferred()
  if (resource === 'details') api.next(detailPath, () => late.promise)
  show()
  if (resource !== 'details') {
    await openCodeScreen()
    api.next(codePath, () => late.promise, resource === 'code POST' ? 'POST' : 'GET')
    if (resource === 'code POST') await regenerate()
    else fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
    await waitFor(() => expect(api.calls(codePath, resource === 'code POST' ? 'POST' : 'GET')).toHaveLength(1))
  } else await screen.findByText('Gruppenberechtigung wird geprüft…')
  await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: other.name }))
  await groupReady(other.name)
  await act(async () => late.resolve(response(resource === 'details' ? group : { code: newCode })))
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue(newCode)).not.toBeInTheDocument()
  await menuAction('Gruppe verlassen')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('member refresh ignores statistics roster and replaces changed usernames and role only after safe verification', async () => {
  const api = setup(), checking = deferred(); show(groupUrl(group.id, 'members'))
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  api.next(detailPath, () => checking.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Mitglieder aktualisieren' }))
  expect(screen.queryByRole('list', { name: 'Aktive Mitglieder' })).not.toBeInTheDocument()
  await act(async () => checking.resolve(response({ ...group, role: 'MEMBER', members: [{ userId: actor.id, username: 'Renamed', role: 'MEMBER' }] })))
  const list = await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(list).toHaveTextContent('Renamed · DuMitglied')
  expect(list).not.toHaveTextContent('Same name')
  await menuAction('Gruppe verlassen')
  expect(screen.queryByRole('menuitem', { name: 'Einladungscode verwalten' })).not.toBeInTheDocument()
})

test('MUI tabs support roving keyboard focus and overflow Escape safely restores the trigger', async () => {
  setup(); show(); await groupReady()
  const games = screen.getByRole('tab', { name: 'Spiele' })
  games.focus()
  fireEvent.keyDown(games, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Statistiken' })).toHaveFocus()
  expect(games).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: 'Statistiken' }))
  await screen.findByText(/Noch keine (Spieler|Deck)statistiken/)
  expect(screen.getByRole('tab', { name: 'Statistiken', selected: true })).toHaveFocus()
  const trigger = screen.getByRole('button', { name: 'Gruppenaktionen' }); trigger.focus(); fireEvent.click(trigger)
  const menu = await screen.findByRole('menu')
  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})


test.each(['network', 'malformed', 'invalid JSON', 500])('code retrieval failure (%s) displays no code and requires a fresh manual GET after safe verification', async failure => {
  const api = setup(); show(`${groupUrl(group.id)}/invitation-code`)
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  api.next(codePath, () => {
    if (failure === 'network') throw new Error('offline')
    if (failure === 'invalid JSON') return new Response('invalid JSON', { status: 200 })
    return response({ code: 'invalid' }, typeof failure === 'number' ? failure : 200)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  await screen.findByText(/aktuelle Einladungscode konnte nicht bestätigt werden/)
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
  expect(screen.queryByLabelText('Aktueller Einladungscode')).not.toBeInTheDocument()
  expect(api.calls(codePath)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
  await screen.findByDisplayValue(oldCode)
  expect(api.calls(codePath)).toHaveLength(2)
  expect(api.calls(codePath, 'POST')).toHaveLength(0)
})


test.each(['pending', 'server', 'network', 'malformed'])('direct statistics load remains independent of %s game history and tab changes do not refetch statistics', async outcome => {
  const api = setup(), history = deferred()
  api.games.state.statistics = statistics()
  api.next(`/api/groups/${group.id}/games`, () => {
    if (outcome === 'pending') return history.promise
    if (outcome === 'network') throw new Error('History offline')
    return response(outcome === 'server' ? {} : { games: [] }, outcome === 'server' ? 500 : 200)
  })
  show(groupUrl(group.id, 'statistics'))
  const table = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(table).toHaveTextContent('Ada')
  if (outcome === 'pending') expect(screen.getByText('Loading game history…')).not.toBeVisible()
  else expect(screen.queryByText('Loading game history…')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.calls(detailPath)).toHaveLength(1)
  fireEvent.click(within(table).getByRole('button', { name: 'Siege' }))
  await selectTab('Spiele')
  if (outcome === 'pending') await screen.findByText('Loading game history…')
  else {
    const gamesPanel = screen.getByRole('tabpanel', { name: 'Spiele' })
    expect(await within(gamesPanel).findByRole('alert')).toHaveTextContent('Refresh games')
    expect(within(gamesPanel).getByRole('button', { name: 'Refresh games' })).toBeEnabled()
  }
  await selectTab('Mitglieder'); await selectTab('Statistiken')
  expect(screen.getByRole('table', { name: 'Spielerstatistiken' })).toBe(table)
  expect(within(table).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(1)
  expect(api.calls(`/api/groups/${group.id}/games`)).toHaveLength(1)
})

test('failed history retries independently while healthy statistics retain sorting and load before retry completes', async () => {
  const api = setup(), retry = deferred()
  api.games.state.statistics = statistics()
  api.next(`/api/groups/${group.id}/games`, () => response({}, 500))
  show(groupUrl(group.id, 'statistics'))
  const table = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(table).getByRole('button', { name: 'Siege' }))
  await selectTab('Spiele'); await screen.findByRole('alert')
  api.next(`/api/groups/${group.id}/games`, () => retry.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await selectTab('Statistiken')
  const refreshed = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(refreshed).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
  expect(screen.getByText('Loading game history…')).not.toBeVisible()
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(2)
  await act(async () => retry.resolve(response([recorded()])))
  await selectTab('Spiele')
  await screen.findByRole('article', { name: `Game ${recorded().id}` })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await selectTab('Statistiken')
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(2)
})

const lowercaseId = 'aabbccdd-1234-4abc-8def-abcdef123456'
test.each([lowercaseId.toUpperCase(), 'AaBbCcDd-1234-4aBc-8dEf-AbCdEf123456'])('group URL %s accepts the same server UUID in lowercase', async routeId => {
  const api = setup(), confirmed = { ...group, id: lowercaseId, name: 'Case-insensitive group' }
  api.next(`/api/groups/${routeId}`, () => response(confirmed))
  api.next(`/api/groups/${lowercaseId}/games`, () => response([]))
  show(groupUrl(routeId, 'members'))
  await groupReady(confirmed.name)
  expect(await screen.findByRole('list', { name: 'Aktive Mitglieder' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Gruppe erneut laden' })).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${routeId}`)).toHaveLength(1)
})

test('mixed-case group URL still rejects a genuinely different response UUID before rendering private state', async () => {
  const api = setup(), routeId = lowercaseId.toUpperCase()
  api.next(`/api/groups/${routeId}`, () => response({ ...group, id: uid(99), name: 'Different private group' }))
  show(groupUrl(routeId, 'members'))
  await screen.findByRole('button', { name: 'Gruppe erneut laden' })
  expect(screen.queryByText('Different private group')).not.toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${uid(99)}/games`)).toHaveLength(0)
})


test('acknowledged game save refreshes sorted statistics even while the replacement history is pending', async () => {
  const api = setup(), history = deferred()
  api.games.state.statistics = statistics()
  show(groupUrl(group.id, 'statistics'))
  const table = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  fireEvent.click(within(table).getByRole('button', { name: 'Siege' }))
  await selectTab('Spiele')
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  const editor = within(screen.getByRole('form', { name: 'Spiel erfassen' }))
  for (const slot of [4, 3]) {
    const card = within(editor.getByRole('region', { name: `Spieler ${slot}` }))
    fireEvent.click(card.getByRole('button', { name: `Spieler ${slot} entfernen` }))
  }
  for (const n of [1, 2]) {
    const card = within(editor.getByRole('region', { name: `Spieler ${n}` }))
    fireEvent.change(card.getByRole('combobox', { name: `Spieler ${n}` }), { target: { value: uid(n + 1) } })
  }
  for (const n of [1, 2]) await selectGameDeck(n, deckFor(n + 1))
  fireEvent.change(editor.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  await waitFor(() => expect(editor.getByRole('button', { name: 'Spiel speichern' })).toBeEnabled())
  api.next(`/api/groups/${group.id}/games`, () => response(recorded({ result: 'DRAW', winnerUserId: null }), 201), 'POST')
  api.next(`/api/groups/${group.id}/games`, () => history.promise)
  api.games.state.statistics = { ...statistics(), players: [{ ...statistics().players[0], wins: 0, winRatePercent: 0 }] }
  fireEvent.click(editor.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game recorded.')
  await selectTab('Statistiken')
  const refreshed = await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(within(refreshed).getByRole('row', { name: /Ada/ })).toHaveTextContent('1200%')
  expect(within(refreshed).getByRole('columnheader', { name: 'Siege' })).toHaveAttribute('aria-sort', 'descending')
  expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(1)
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(2)
  expect(screen.getByText('Loading game history…')).not.toBeVisible()
  await selectTab('Mitglieder'); await selectTab('Statistiken')
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(2)
})

test('statistics authorization denial retires pending history and requires manual retry after safe revalidation without a fetch loop', async () => {
  const api = setup(), history = deferred(), check = deferred()
  api.next(`/api/groups/${group.id}/games`, () => history.promise)
  api.next(`/api/groups/${group.id}/statistics`, () => response({}, 403))
  // Initial authorization succeeds, the subsequent access check is held open.
  api.next(detailPath, () => response(group))
  api.next(detailPath, () => check.promise)
  show(groupUrl(group.id, 'statistics'))
  await screen.findByText('Checking group access…')
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${group.id}/games`)[0][1]!.signal!.aborted).toBe(true)
  await act(async () => check.resolve(response(group)))
  await screen.findByText('Gruppenzugriff bestätigt. Bitte Statistiken aktualisieren, um den Serverstand zu prüfen.')
  await selectTab('Spiele'); await selectTab('Statistiken')
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(1)
  api.next(`/api/groups/${group.id}/statistics`, () => response({}, 403))
  fireEvent.click(screen.getByRole('button', { name: 'Statistiken aktualisieren' }))
  await screen.findByText('Gruppenzugriff bestätigt. Bitte Statistiken aktualisieren, um den Serverstand zu prüfen.')
  expect(api.calls(`/api/groups/${group.id}/statistics`)).toHaveLength(2)
  expect(api.calls(detailPath)).toHaveLength(3)
  await act(async () => history.resolve(response({}, 401)))
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

// #77 Variant A: preserve the whole in-memory editor, including its presentation
// and validation state, through actual BrowserRouter POPs within this group.
test('visible tabs and native same-group Back/Forward preserve summaries, expansion, winner and validation without a prompt', async () => {
  const api = setup(); show(); await groupReady()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  const editor = within(screen.getByRole('form', { name: 'Spiel erfassen' }))
  fireEvent.click(within(editor.getByRole('region', { name: 'Spieler 4' })).getByRole('button', { name: 'Spieler 4 entfernen' }))
  // No card movement in this scenario: retain roots, but re-query controls after each render.
  const cards = editor.getAllByRole('region', { name: /^Spieler \d$/ }).map((root, index) => {
    expect(root).toHaveAccessibleName(`Spieler ${index + 1}`)
    return within(root)
  })
  expect(cards).toHaveLength(3)
  const card = (n: number) => cards[n - 1]
  for (const n of [1, 2]) {
    fireEvent.change(card(n).getByRole('combobox', { name: `Spieler ${n}` }), { target: { value: uid(n + 1) } })
    await waitFor(() => expect(card(n).getByRole('combobox', { name: `Deck für Spieler ${n}` })).toBeEnabled())
    fireEvent.change(card(n).getByRole('combobox', { name: `Deck für Spieler ${n}` }), { target: { value: deckFor(n + 1).id } })
  }
  fireEvent.click(card(2).getByRole('button', { name: 'Spieler 2 bearbeiten' }))
  fireEvent.change(card(3).getByRole('combobox', { name: 'Spieler 3' }), { target: { value: uid(4) } })
  await waitFor(() => expect(card(3).getByRole('combobox', { name: 'Deck für Spieler 3' })).toBeEnabled())
  for (const n of [1, 2]) {
    const placement = within(card(n).getByRole('group', { name: 'Platzierung' }))
    fireEvent.click(placement.getByRole('button', { name: `Platz ${n}` }))
  }
  fireEvent.click(editor.getByRole('button', { name: 'Spiel speichern' }))
  expect(card(3).getByRole('combobox', { name: 'Deck für Spieler 3' })).toHaveFocus()
  await selectTab('Statistiken'); await selectTab('Mitglieder')
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => window.history.back())
  await screen.findByRole('tab', { name: 'Statistiken', selected: true })
  await act(async () => window.history.back())
  await screen.findByRole('tab', { name: 'Spiele', selected: true })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // Resolve new roots from the visible document after native history traversal.
  const restored = within(screen.getByRole('form', { name: 'Spiel erfassen' }))
  const restoredCard = (n: number) => within(restored.getByRole('region', { name: `Spieler ${n}` }))
  expect(restoredCard(1).getByRole('button', { name: 'Spieler 1 bearbeiten' })).toBeInTheDocument()
  expect(restoredCard(2).getByRole('combobox', { name: 'Spieler 2' })).toHaveValue(uid(3))
  expect(restoredCard(2).getByRole('combobox', { name: 'Deck für Spieler 2' })).toHaveValue(deckFor(3).id)
  expect(restoredCard(3).getByRole('combobox', { name: 'Deck für Spieler 3' })).toHaveAttribute('aria-invalid', 'true')
  expect(restoredCard(1).getByRole('button', { name: 'Platz 1' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('form')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('Spieler 3:')
  await act(async () => window.history.forward())
  await screen.findByRole('tab', { name: 'Statistiken', selected: true })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${group.id}/games`)).toHaveLength(1)
  expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(0)
})

test('empty slot edits and reverted values stay clean; material changes guard unload and cancellation with focus restoration', async () => {
  setup(); show(); await groupReady()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  const editor = within(screen.getByRole('form', { name: 'Spiel erfassen' }))
  fireEvent.click(editor.getByRole('button', { name: 'Spieler hinzufügen' }))
  fireEvent.click(within(editor.getByRole('region', { name: 'Spieler 1' })).getByRole('button', { name: 'Spieler 1 entfernen' }))
  const firstCard = within(editor.getByRole('region', { name: 'Spieler 1' }))
  fireEvent.change(editor.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  fireEvent.change(editor.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'WIN' } })
  let unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(false)
  fireEvent.change(firstCard.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
  const cancel = editor.getByRole('button', { name: 'Abbrechen' }); cancel.focus(); fireEvent.click(cancel)
  const dialog = within(await screen.findByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(cancel).toHaveFocus())
  expect(firstCard.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue(uid(2))
  fireEvent.click(firstCard.getByRole('button', { name: 'Spieler 1 leeren' }))
  unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(false)
  fireEvent.click(cancel)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
})

test.each(['games', 'members', 'code', 'global'] as const)('dirty %s exit stays intact on cancellation and truly retires the editor on discard', async destination => {
  const api = setup(); show(); await groupReady()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  async function exit() {
    if (destination === 'games') fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
    if (destination === 'members') fireEvent.click(screen.getByRole('button', { name: 'Mitglieder aktualisieren' }))
    if (destination === 'code') await menuAction('Einladungscode verwalten')
    if (destination === 'global') fireEvent.click(screen.getByRole('link', { name: 'Decks' }))
  }
  if (destination === 'members') await selectTab('Mitglieder')
  await exit()
  fireEvent.click(await screen.findByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await selectTab('Spiele')
  expect(screen.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue(uid(2))
  if (destination === 'members') await selectTab('Mitglieder')
  await exit()
  fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.queryByRole('form', { name: 'Spiel erfassen', hidden: true })).not.toBeInTheDocument()
  if (destination === 'code') {
    await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
    fireEvent.click(screen.getByRole('link', { name: 'Zurück zur Gruppe' }))
  } else if (destination === 'global') {
    await screen.findByRole('heading', { name: 'Meine Decks' })
    fireEvent.click(screen.getByRole('link', { name: 'Playgroups' }))
    fireEvent.click(await screen.findByRole('button', { name: group.name }))
  }
  await groupReady(); await selectTab('Spiele')
  await screen.findByRole('button', { name: 'Spiel erfassen' })
  expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(0)
})

test('native Back out of a dirty group stays on cancel; discard and Forward fetch a fresh group without resurrecting the draft', async () => {
  const api = setup(); show('/playgroups')
  const listIndex = window.history.state.idx
  fireEvent.click(await screen.findByRole('button', { name: group.name }))
  await groupReady()
  const groupIndex = window.history.state.idx
  const historyLength = window.history.length
  expect(groupIndex).toBe(listIndex + 1)
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  const field = screen.getByLabelText('Spieler 1', { exact: true, selector: 'select' })
  fireEvent.change(field, { target: { value: uid(2) } }); field.focus()
  // Await both native restoration and the dialog's exit.
  // Focus can return while the old dialog/buttons are still mounted in MUI.
  await act(async () => window.history.back())
  const dialog = await screen.findByRole('dialog')
  const stay = within(dialog).getByRole('button', { name: 'Im Editor bleiben' })
  const discard = within(dialog).getByRole('button', { name: 'Verwerfen und verlassen' })
  fireEvent.click(stay)
  expect(discard).toBeDisabled()
  fireEvent.click(discard) // A click on the exiting dialog cannot retire the draft.
  await waitFor(() => {
    expect(discard).not.toBeInTheDocument()
    expect(window.location.pathname).toBe(groupUrl(group.id))
    expect(window.history.state.idx).toBe(groupIndex)
    expect(field).toHaveFocus()
    expect(field).toHaveValue(uid(2))
    expect(field.closest('form')).toBeInTheDocument()
  })
  expect(window.history.length).toBe(historyLength)
  await act(async () => window.history.back())
  const nextDialog = await screen.findByRole('dialog')
  fireEvent.click(within(nextDialog).getByRole('button', { name: 'Verwerfen und verlassen' }))
  await waitFor(() => {
    expect(field).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/playgroups')
    expect(window.history.state.idx).toBe(listIndex)
  })
  await screen.findByRole('button', { name: 'Gruppe erstellen' })
  await waitFor(() => expect(nextDialog).not.toBeInTheDocument())
  await act(async () => window.history.forward())
  await groupReady()
  await screen.findByRole('button', { name: 'Spiel erfassen' })
  expect(window.location.pathname).toBe(groupUrl(group.id))
  expect(window.history.state.idx).toBe(groupIndex)
  expect(window.history.length).toBe(historyLength)
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(api.calls(detailPath)).toHaveLength(2)
  expect(api.calls(`/api/groups/${group.id}/games`)).toHaveLength(2)
  expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(0)
})

test.each([1, 4])('late saved-game success/401 cannot mutate a replacement session (user %s), including same UUID re-login', async user => {
  const api = setup(), late = deferred()
  show(); await groupReady()
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  const editor = within(screen.getByRole('form', { name: 'Spiel erfassen' }))
  for (const slot of [4, 3]) {
    const card = within(editor.getByRole('region', { name: `Spieler ${slot}` }))
    fireEvent.click(card.getByRole('button', { name: `Spieler ${slot} entfernen` }))
  }
  for (const n of [1, 2]) {
    const card = within(editor.getByRole('region', { name: `Spieler ${n}` }))
    fireEvent.change(card.getByRole('combobox', { name: `Spieler ${n}` }), { target: { value: uid(n + 1) } })
    await selectGameDeck(n, deckFor(n + 1))
  }
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  api.next(`/api/groups/${group.id}/games`, () => late.promise, 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await waitFor(() => expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(1))
  const signal = api.calls(`/api/groups/${group.id}/games`, 'POST')[0][1]!.signal
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  expect(signal?.aborted).toBe(true)
  api.state.loginUser = { id: uid(user), username: 'Replacement game session' }
  await signIn()
  await act(async () => late.resolve(user === 1 ? response({}, 401) : response(recorded(), 201)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Replacement game session')
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(api.calls(`/api/groups/${group.id}/games`, 'POST')).toHaveLength(1)
})
