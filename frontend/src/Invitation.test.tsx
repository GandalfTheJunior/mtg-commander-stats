import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { AppRouter } from './AppRouter'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { createInvitation, previewInvitation, retryAfterSeconds, type CurrentUser, type GroupRole } from './api'
import { formatExpiry, inviteCode, invitationUrl, publicOrigin, qrGeometry } from './invitationLink'
import { deferred, group, response, uid } from './test/gameFixtures'
import { emptyStatistics } from './test/statisticsFixtures'
import { stubLanHttpCrypto } from './test/lanHttp'
import { clickAccountLogout } from './test/accountActions'

// #200 single-use invitation sharing, public preview, auth return and explicit join.
const code = 'AbCdEfGhIjKlMnOpQrSt_-'
const secondCode = 'ZyXwVuTsRqPoNmLkJiHg01'
const expiresAt = '2026-11-13T18:40:00Z'
const owner: CurrentUser = { id: uid(1), username: 'Owner' }
const visitor: CurrentUser = { id: uid(50), username: 'Visitor' }
const base = `/api/groups/${group.id}`
type Reply = (init?: RequestInit) => Response | Promise<Response>

function server(initial: CurrentUser | null = visitor, role: GroupRole = 'OWNER') {
  const state = { user: initial, loginUser: visitor, role, member: false }
  const queues = new Map<string, Reply[]>()
  const next = (key: string, ...replies: Reply[]) => queues.set(key, [...queues.get(key) ?? [], ...replies])
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const queued = queues.get(`${method} ${path}`)?.shift()
    if (queued) return queued(init)
    if (path === '/api/me') return response(state.user ?? {}, state.user ? 200 : 401)
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'csrf-token' })
    if (path === '/api/session') {
      state.user = method === 'DELETE' ? null : state.loginUser
      return method === 'DELETE' ? new Response(null, { status: 204 }) : response(state.user)
    }
    if (path === '/api/users' && method === 'POST') return response(state.loginUser, 201)
    if (path === `/api/invitations/${code}`) return response({ groupName: group.name })
    if (path === '/api/groups/join') {
      if (state.member) return response({ detail: 'Already a member.' }, 409)
      state.member = true
      return response({ id: group.id, name: group.name, role: 'MEMBER' })
    }
    if (path === `${base}/invitations` && method === 'POST') return response({ code, expiresAt }, 201)
    if (path === base) return response({ ...group, role: state.role })
    if (path === `${base}/ownership-transfer`) return response({}, 404)
    if (path === `${base}/ownership-transfer/notices`) return response([])
    if (path === `${base}/games/history`) return response({ games: [], nextCursor: null })
    if (path === `${base}/statistics`) return response(emptyStatistics())
    if (path === '/api/groups') return response([])
    throw new Error(`Unexpected request ${method} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const calls = (method: string, path: string) => fetchMock.mock.calls.filter(([p, init]) => p === path && (init?.method ?? 'GET') === method)
  return { state, next, fetchMock, calls }
}

function show(path: string, state: unknown = null) {
  window.history.replaceState(state === null ? null : { usr: state, key: 'restored', idx: 0 }, '', path)
  return render(<AppThemeProvider><AppRouter><App /></AppRouter></AppThemeProvider>)
}

async function signIn() {
  const form = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'visitor@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
}

async function openInvite() {
  fireEvent.click(await screen.findByRole('button', { name: /Spieler einladen/ }))
  return screen.findByRole('dialog', { name: 'Spieler einladen' })
}

const joinCalls = (api: ReturnType<typeof server>) => api.calls('POST', '/api/groups/join')
const url = `${window.location.origin}/invite/${code}`

beforeEach(stubLanHttpCrypto)
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); window.history.replaceState(null, '', '/') })

// ---------------------------------------------------------------- helpers and API

test('invitation codes are validated locally before any request', () => {
  expect(inviteCode(code)).toBe(code)
  for (const bad of ['short', `${code}x`, 'AbCdEfGhIjKlMnOpQrSt%2F', '%E0%A4%A', 'AbCdEfGhIjKlMnOpQrSt=='])
    expect(inviteCode(bad)).toBeNull()
})

test('the share URL is same-origin by default and uses only the origin of a configured public base', () => {
  expect(invitationUrl(code)).toBe(url)
  expect(publicOrigin('https://commander.example/some/path?x=1', 'http://192.168.0.2:5173')).toBe('https://commander.example')
  for (const unusable of [undefined, '', 'javascript:alert(1)', 'not a url', 42])
    expect(publicOrigin(unusable, 'http://192.168.0.2:5173')).toBe('http://192.168.0.2:5173')
  expect(invitationUrl(code, 'https://commander.example')).toBe(`https://commander.example/invite/${code}`)
})

test('expiry is the server instant formatted in the local time zone without a countdown', () => {
  const local = new Date(expiresAt)
  const two = (value: number) => String(value).padStart(2, '0')
  expect(formatExpiry(expiresAt)).toBe(`${two(local.getDate())}.${two(local.getMonth() + 1)}., ${two(local.getHours())}:${two(local.getMinutes())} Uhr`)
})

test('Retry-After accepts delay seconds and HTTP dates', () => {
  expect(retryAfterSeconds('60')).toBe(60)
  expect(retryAfterSeconds(new Date(Date.UTC(2026, 0, 1, 0, 0, 30)).toUTCString(), Date.UTC(2026, 0, 1))).toBe(30)
  expect(retryAfterSeconds(null)).toBeUndefined()
  expect(retryAfterSeconds('soon')).toBeUndefined()
})

test('creation posts without a body under CSRF and rejects an invented or malformed response', async () => {
  const api = server()
  await expect(createInvitation(group.id)).resolves.toEqual({ code, expiresAt })
  const [, init] = api.calls('POST', `${base}/invitations`)[0]
  expect(init?.body).toBeUndefined()
  expect(init?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'csrf-token' })
  api.next(`POST ${base}/invitations`, () => response({ code: 'short', expiresAt }, 201), () => response({ code, expiresAt: 'later' }, 201),
    () => response({ code, expiresAt }, 200))
  for (let i = 0; i < 3; i++) await expect(createInvitation(group.id)).rejects.toThrow()
})

test('the public preview omits credentials, caching and referrer, and reports Retry-After on 429', async () => {
  const api = server()
  await expect(previewInvitation(code)).resolves.toEqual({ groupName: group.name })
  expect(api.calls('GET', `/api/invitations/${code}`)[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  api.next(`GET /api/invitations/${code}`, () => new Response('{}', { status: 429, headers: { 'Retry-After': '17' } }))
  await expect(previewInvitation(code)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 17 })
  api.next(`GET /api/invitations/${code}`, () => response({ groupName: group.name, members: ['leak'] }))
  await expect(previewInvitation(code)).resolves.toEqual({ groupName: group.name })
})

// ---------------------------------------------------------------- invitation dialog in Members

test.each(['OWNER', 'ADMIN', 'MEMBER'] as const)('an active %s creates exactly one invitation per deliberate tap', async role => {
  const api = server(owner, role)
  const pending = deferred()
  api.next(`POST ${base}/invitations`, () => pending.promise)
  show(`/playgroups/${group.id}/members`)
  const trigger = await screen.findByRole('button', { name: /Spieler einladen/ })
  fireEvent.click(trigger)
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Spieler einladen' })
  expect(within(dialog).getByRole('status')).toHaveTextContent('Einladung wird erstellt…')
  expect(within(dialog).queryByRole('button', { name: /Link/ })).not.toBeInTheDocument()
  expect(trigger).toHaveAttribute('aria-disabled', 'true')
  await act(async () => pending.resolve(response({ code, expiresAt }, 201)))
  expect(await within(dialog).findByText('Einladung erstellt')).toBeInTheDocument()
  expect(within(dialog).getByText('Einmalig verwendbar')).toBeInTheDocument()
  expect(within(dialog).getByText(formatExpiry(expiresAt))).toHaveAttribute('datetime', expiresAt)
  expect(api.calls('POST', `${base}/invitations`)).toHaveLength(1)
  expect(screen.queryByText(code)).not.toBeInTheDocument()
})

test('without native share, Link kopieren is the primary action and success is reported only after the clipboard confirms', async () => {
  server(owner)
  const clipboard = deferred()
  const writeText = vi.fn(() => clipboard.promise.then(() => undefined))
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
  show(`/playgroups/${group.id}/members`)
  const dialog = await openInvite()
  const copy = await within(dialog).findByRole('button', { name: 'Link kopieren' })
  expect(within(dialog).queryByRole('button', { name: 'Link teilen' })).not.toBeInTheDocument()
  expect(copy).toHaveClass('MuiButton-contained')
  fireEvent.click(copy)
  expect(writeText).toHaveBeenCalledWith(url)
  expect(within(dialog).queryByText('Link kopiert')).not.toBeInTheDocument()
  await act(async () => clipboard.resolve(new Response()))
  expect(await within(dialog).findByText('Link kopiert')).toBeInTheDocument()
})

test('clipboard denial or absence offers the exact link for manual copying', async () => {
  server(owner)
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) } })
  show(`/playgroups/${group.id}/members`)
  const dialog = await openInvite()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Link kopieren' }))
  const field = await within(dialog).findByRole('textbox', { name: 'Einladungslink' })
  expect(field).toHaveValue(url)
  expect(field).toHaveAttribute('readonly')
  await waitFor(() => expect(field).toHaveFocus())
  expect(within(dialog).queryByText('Link kopiert')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('alert')).toHaveTextContent('nicht automatisch kopiert')
})

test('native share sends the same URL; dismissing the sheet is not an error', async () => {
  server(owner)
  const share = vi.fn().mockRejectedValueOnce(new DOMException('cancelled', 'AbortError')).mockRejectedValueOnce(new Error('broken'))
  vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText: vi.fn() } })
  show(`/playgroups/${group.id}/members`)
  const dialog = await openInvite()
  const shareButton = await within(dialog).findByRole('button', { name: 'Link teilen' })
  expect(within(dialog).getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument()
  fireEvent.click(shareButton)
  await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Playgroup-Einladung', url }))
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(shareButton)
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Teilen ist fehlgeschlagen')
})

test('the collapsible QR code encodes the identical URL locally and toggling issues no request', async () => {
  const api = server(owner)
  vi.stubGlobal('navigator', { ...navigator, share: vi.fn(), canShare: () => true, clipboard: { writeText: vi.fn() } })
  show(`/playgroups/${group.id}/members`)
  const dialog = await openInvite()
  const reveal = await within(dialog).findByRole('button', { name: 'QR-Code anzeigen' })
  expect(reveal).toHaveAttribute('aria-expanded', 'false')
  expect(within(dialog).queryByRole('img', { name: 'QR-Code mit dem Einladungslink' })).not.toBeInTheDocument()
  const requestsBefore = api.fetchMock.mock.calls.length
  fireEvent.click(reveal)
  const qr = within(dialog).getByRole('img', { name: 'QR-Code mit dem Einladungslink' })
  const expected = qrGeometry(url)
  expect(qr.querySelector('path')).toHaveAttribute('d', expected.path)
  expect(qr.querySelector('path')).toHaveAttribute('fill', '#000000')
  expect(qr.querySelector('rect')).toHaveAttribute('fill', '#FFFFFF')
  expect(qr).toHaveAttribute('viewBox', `0 0 ${expected.size} ${expected.size}`)
  expect(within(dialog).getByRole('button', { name: 'Link teilen' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument()
  const hide = within(dialog).getByRole('button', { name: 'QR-Code ausblenden' })
  expect(hide).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(hide)
  expect(within(dialog).queryByRole('img')).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.length).toBe(requestsBefore)
  expect(within(dialog).getByText(formatExpiry(expiresAt))).toBeInTheDocument()
})

test('closing discards the presentation; reopening creates a new independent invitation', async () => {
  const api = server(owner)
  api.next(`POST ${base}/invitations`, () => response({ code, expiresAt }, 201), () => response({ code: secondCode, expiresAt: '2026-11-13T19:00:00Z' }, 201))
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
  show(`/playgroups/${group.id}/members`)
  let dialog = await openInvite()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'QR-Code anzeigen' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  dialog = await openInvite()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Link kopieren' }))
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/invite/${secondCode}`))
  expect(within(dialog).queryByRole('img')).not.toBeInTheDocument()
  expect(api.calls('POST', `${base}/invitations`)).toHaveLength(2)
})

test('creation failure offers explicit retry and close, never a link', async () => {
  const api = server(owner)
  const retried = deferred()
  api.next(`POST ${base}/invitations`, () => response({ detail: 'boom' }, 500), () => retried.promise)
  show(`/playgroups/${group.id}/members`)
  const dialog = await openInvite()
  expect(await within(dialog).findByText('Einladung konnte nicht erstellt werden')).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: /Link|QR/ })).not.toBeInTheDocument()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(api.calls('POST', `${base}/invitations`)).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Erneut versuchen' }))
  // While the retry is pending no second creation can be started.
  expect(within(dialog).queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Spieler einladen/, hidden: true })).toHaveAttribute('aria-disabled', 'true')
  expect(await within(dialog).findByText('Einladung wird erstellt…')).toBeInTheDocument()
  await act(async () => retried.resolve(response({ code, expiresAt }, 201)))
  expect(await within(dialog).findByText('Einladung erstellt')).toBeInTheDocument()
  expect(api.calls('POST', `${base}/invitations`)).toHaveLength(2)
})

test('a lost membership during creation reuses the group access handling', async () => {
  const api = server(owner)
  api.next(`POST ${base}/invitations`, () => response({ detail: 'Forbidden' }, 403))
  show(`/playgroups/${group.id}/members`)
  fireEvent.click(await screen.findByRole('button', { name: /Spieler einladen/ }))
  await waitFor(() => expect(window.location.pathname).toBe('/playgroups'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByText('Du hast keinen Zugriff mehr auf diese Playgroup.')).toBeInTheDocument()
})

test('logout and an account switch leave no invitation of the previous account behind', async () => {
  const api = server(owner)
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } })
  show(`/playgroups/${group.id}/members`)
  const dialog = await openInvite()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Link kopieren' }))
  expect(await screen.findByDisplayValue(url)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  clickAccountLogout()
  await screen.findByText('Logged out.')
  api.state.loginUser = { id: uid(60), username: 'Other' }
  window.history.pushState(null, '', `/playgroups/${group.id}/members`)
  act(() => window.dispatchEvent(new PopStateEvent('popstate')))
  await signIn()
  expect(await screen.findByRole('button', { name: /Spieler einladen/ })).toBeEnabled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.innerHTML).not.toContain(code)
})

// ---------------------------------------------------------------- public preview and auth return

test('signed-out direct load shows only the group name and the existing auth choices, without joining', async () => {
  const api = server(null)
  show(`/invite/${code}`)
  expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Playgroup-Einladung' })).toBeInTheDocument()
  expect(screen.getByText('Nur der Playgroup-Name ist öffentlich')).toBeInTheDocument()
  expect(screen.getByText('Du bist nicht angemeldet.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Registrieren' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Playgroup beitreten' })).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(joinCalls(api)).toHaveLength(0)
  expect(api.fetchMock.mock.calls.filter(([path]) => path.startsWith('/api/groups'))).toHaveLength(0)
})

test('the group name is rendered as escaped text', async () => {
  const api = server(null)
  api.next(`GET /api/invitations/${code}`, () => response({ groupName: '<img src=x onerror=alert(1)>' }))
  show(`/invite/${code}`)
  expect(await screen.findByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeInTheDocument()
  expect(document.querySelector('img')).toBeNull()
})

test('login returns to the identical invitation and requires an explicit join', async () => {
  const api = server(null)
  show(`/invite/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Anmelden' }))
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/invite/${code}`)
  expect(screen.getByRole('heading', { name: 'Playgroup-Einladung' })).toBeInTheDocument()
  expect(screen.getByText('Nach der Anmeldung kehrst du zu dieser Einladung zurück.')).toBeInTheDocument()
  await waitFor(() => expect(document.getElementById('auth-login-email')).toHaveFocus())
  await signIn()
  expect(await screen.findByRole('button', { name: 'Playgroup beitreten' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/invite/${code}`)
  expect(screen.getByText('Du bist angemeldet.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(joinCalls(api)).toHaveLength(0)
  // The returned preview is revalidated under the new session.
  expect(api.calls('GET', `/api/invitations/${code}`)).toHaveLength(2)
})

test('registration followed by the separate required login returns to the same invitation, surviving a reload', async () => {
  const api = server(null)
  const view = show(`/invite/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrieren' }))
  await waitFor(() => expect(document.getElementById('auth-register-email')).toHaveFocus())
  // Interrupted registration: reloading keeps the auth detour for the same invitation.
  view.unmount()
  show(`/invite/${code}`, { inviteAuth: 'register' })
  const form = within((await screen.findByRole('heading', { name: 'Create an account' })).closest('section')!)
  expect(screen.getByRole('heading', { name: 'Playgroup-Einladung' })).toBeInTheDocument()
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'visitor@example.test' } })
  fireEvent.change(form.getByLabelText('Username'), { target: { value: 'Visitor' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByText('Account created for Visitor. Sign in separately to continue.')).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/invite/${code}`)
  expect(screen.queryByRole('button', { name: 'Playgroup beitreten' })).not.toBeInTheDocument()
  await signIn()
  expect(await screen.findByRole('button', { name: 'Playgroup beitreten' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/invite/${code}`)
  expect(joinCalls(api)).toHaveLength(0)
})

test('Zurück zur Einladung leaves the auth detour for the preview', async () => {
  server(null)
  show(`/invite/${code}`, { inviteAuth: 'login' })
  fireEvent.click(await screen.findByRole('link', { name: 'Zurück zur Einladung' }))
  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/invite/${code}`)
})

test('an explicit join posts only the code under CSRF and opens the group Overview with a brief notice', async () => {
  const api = server(visitor)
  const pending = deferred()
  api.next('POST /api/groups/join', () => pending.promise)
  show(`/invite/${code}`)
  const join = await screen.findByRole('button', { name: 'Playgroup beitreten' })
  fireEvent.click(join)
  fireEvent.click(join)
  expect(await screen.findByText('Beitritt läuft…')).toBeInTheDocument()
  expect(join).toBeDisabled()
  await act(async () => pending.resolve(response({ id: group.id, name: group.name, role: 'MEMBER' })))
  await waitFor(() => expect(window.location.pathname).toBe(`/playgroups/${group.id}`))
  expect(await screen.findByText('Du bist der Playgroup beigetreten.')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument()
  expect(joinCalls(api)).toHaveLength(1)
  const [, init] = joinCalls(api)[0]
  expect(JSON.parse(String(init?.body))).toEqual({ code })
  expect(init?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'csrf-token' })
  fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }))
  expect(screen.queryByText('Du bist der Playgroup beigetreten.')).not.toBeInTheDocument()
})

test('a restored Overview history entry never replays the join notice', async () => {
  server(visitor)
  show(`/playgroups/${group.id}`, { groupJoined: 'stale-token' })
  expect(await screen.findByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument()
  expect(screen.queryByText('Du bist der Playgroup beigetreten.')).not.toBeInTheDocument()
})

test('an already active member gets the distinct notice without a second join', async () => {
  const api = server(visitor)
  api.state.member = true
  show(`/invite/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup beitreten' }))
  expect(await screen.findByRole('heading', { name: 'Du bist bereits Mitglied' })).toHaveFocus()
  expect(screen.getByText(group.name)).toBeInTheDocument()
  expect(screen.getByText('Die Einladung wurde nicht verwendet. Sie bleibt für andere gültig.')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Zu meinen Playgroups' }).at(-1)).toHaveAttribute('href', '/playgroups')
  expect(screen.queryByRole('button', { name: 'Playgroup beitreten' })).not.toBeInTheDocument()
  expect(joinCalls(api)).toHaveLength(1)
})

test('a token consumed or expired after the preview shows the shared unavailable state without the group name', async () => {
  const api = server(visitor)
  api.next('POST /api/groups/join', () => response({ detail: 'This invitation is unavailable.' }, 400))
  show(`/invite/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup beitreten' }))
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toBeInTheDocument()
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Zu meinen Playgroups' })[0]).toHaveAttribute('href', '/playgroups')
})

test.each([
  ['unknown', () => response({ detail: 'This invitation is unavailable.' }, 400)],
])('a %s token is unavailable for signed-out visitors, leading back to the start page', async (_name, reply) => {
  const api = server(null)
  api.next(`GET /api/invitations/${code}`, reply)
  show(`/invite/${code}`)
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toBeInTheDocument()
  expect(screen.getByText('Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Zurück zur Startseite' })[0]).toHaveAttribute('href', '/')
  expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument()
  expect(joinCalls(api)).toHaveLength(0)
})

test('a transient preview failure is retryable with the same token', async () => {
  const api = server(null)
  api.next(`GET /api/invitations/${code}`, () => response({ detail: 'down' }, 503), () => Promise.reject(new TypeError('offline')))
  show(`/invite/${code}`)
  expect(await screen.findByRole('heading', { name: 'Einladung konnte nicht geladen werden' })).toBeInTheDocument()
  expect(screen.queryByText('Einladung nicht verfügbar')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  expect(await screen.findByRole('heading', { name: 'Einladung konnte nicht geladen werden' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(api.calls('GET', `/api/invitations/${code}`)).toHaveLength(3)
})

test('a rate-limited preview honours Retry-After before allowing a manual retry', async () => {
  const api = server(null)
  api.next(`GET /api/invitations/${code}`, () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }))
  show(`/invite/${code}`)
  const retry = await screen.findByRole('button', { name: 'Erneut versuchen' })
  expect(retry).toBeDisabled()
  expect(screen.getByText('Bitte warte etwa 1 Sekunden, bevor du es erneut versuchst.')).toBeInTheDocument()
  await waitFor(() => expect(retry).toBeEnabled(), { timeout: 2500 })
  expect(api.calls('GET', `/api/invitations/${code}`)).toHaveLength(1)
  fireEvent.click(retry)
  expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
})

test('a rate-limited or interrupted join stays retryable and is not mistaken for an invalid invitation', async () => {
  const api = server(visitor)
  api.next('POST /api/groups/join', () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }), () => Promise.reject(new TypeError('offline')))
  show(`/invite/${code}`)
  const join = await screen.findByRole('button', { name: 'Playgroup beitreten' })
  fireEvent.click(join)
  expect(await screen.findByRole('alert')).toHaveTextContent('Bitte warte etwa 1 Minute, bevor du es erneut versuchst.')
  expect(join).toBeDisabled()
  expect(screen.getByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(joinCalls(api)).toHaveLength(1)
})

test('an expired session during join is not treated as a consumed invitation', async () => {
  const api = server(visitor)
  api.next('POST /api/groups/join', () => { api.state.user = null; return response({}, 401) })
  show(`/invite/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup beitreten' }))
  expect(await screen.findByText('Your session expired. Sign in again.')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(screen.queryByText('Einladung nicht verfügbar')).not.toBeInTheDocument()
})

test.each(['/invite/a/b', '/invite/'])('a malformed route %s never reaches the invitation API', async path => {
  const api = server(null)
  show(path)
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  expect(api.fetchMock.mock.calls.some(([p]) => p.startsWith('/api/invitations'))).toBe(false)
})

test('signed-in visitors with a malformed token return to Playgroups', async () => {
  const api = server(visitor)
  show('/invite/not-a-valid-token')
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([p]) => p.startsWith('/api/invitations'))).toBe(false)
})

test('browser Back from the auth detour returns to the preview', async () => {
  server(null)
  show(`/invite/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Anmelden' }))
  await screen.findByRole('heading', { name: 'Sign in' })
  act(() => window.history.back())
  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
})
