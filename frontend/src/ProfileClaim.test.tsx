import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { AppRouter } from './AppRouter'
import { AppThemeProvider } from './theme/AppThemeProvider'
import {
  acceptProfileInvitation, createProfileInvitation, getProfileInvitation, previewProfileInvitation, revokeProfileInvitation,
  type CurrentUser, type GroupMember, type GroupRole,
} from './api'
import { claimSegment, claimUrl, invitationUrl, qrGeometry } from './invitationLink'
import { memberActions } from './membersModel'
import { deferred, response, uid } from './test/gameFixtures'
import { stubLanHttpCrypto } from './test/lanHttp'

// #247 quick-profile claim invitations: issuer management in Members and the public /claim/:code journey.
const code = 'Qr5tUvWxYz0123456789_-'
const secondCode = 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7_'
const groupId = uid(10)
const groupName = 'Friday Commander'
const profileName = 'Hairy Zombie'
const owner: CurrentUser = { id: uid(1), username: 'Gandalf' }
const visitor: CurrentUser = { id: uid(50), username: 'Frodo' }
const other: CurrentUser = { id: uid(51), username: 'Samweis' }
const quick: GroupMember = { userId: uid(5), username: profileName, role: 'MEMBER', quickProfile: true }
const roster: GroupMember[] = [
  { userId: owner.id, username: owner.username, role: 'OWNER' },
  { userId: uid(2), username: 'Saruman', role: 'ADMIN' },
  { userId: uid(3), username: 'Aragorn', role: 'MEMBER' },
  quick,
]
const base = `/api/groups/${groupId}`
const invitationPath = `${base}/quick-profiles/${quick.userId}/invitation`
const previewPath = `/api/profile-invitations/${code}`
const acceptPath = `${previewPath}/accept`
const soon = () => new Date(Date.now() + 3_600_000).toISOString()
type Reply = (init?: RequestInit) => Response | Promise<Response>
const lost = (): Promise<Response> => Promise.reject(new TypeError('Failed to fetch'))

function server(initial: CurrentUser | null = owner, role: GroupRole = 'OWNER') {
  const state = {
    user: initial, loginUser: visitor, role, members: [...roster],
    status: { active: false, expiresAt: null } as { active: boolean; expiresAt: string | null },
    nextCode: code, expiresAt: soon(),
  }
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
    if (path === invitationPath && method === 'GET') return response(state.status)
    if (path === invitationPath && method === 'POST') {
      state.status = { active: true, expiresAt: state.expiresAt }
      return response({ code: state.nextCode, expiresAt: state.expiresAt }, 201)
    }
    if (path === invitationPath && method === 'DELETE') { state.status = { active: false, expiresAt: null }; return new Response(null, { status: 204 }) }
    if (path === previewPath) return response({ groupName, profileName })
    if (path === acceptPath) return new Response(null, { status: 204 })
    if (path === base) return response({ id: groupId, name: groupName, role: state.role, members: state.members })
    if (path === `${base}/ownership-transfer`) return response({}, 404)
    if (path === `${base}/ownership-transfer/notices`) return response([])
    if (path === '/api/groups') return response([{ id: groupId, name: groupName, role: 'MEMBER' }])
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
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'someone@example.test' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
}

const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'li span' })).closest('li')!
async function menuOf(name: string) {
  fireEvent.click(within(await rowOf(name)).getByRole('button', { name: new RegExp(`^Aktionen für ${name}`) }))
  return screen.findByRole('menu')
}
async function openClaim() {
  show(`/playgroups/${groupId}/members`)
  fireEvent.click(within(await menuOf(profileName)).getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }))
  return screen.findByRole('dialog', { name: 'Profilübernahme einladen' })
}
const writes = (api: ReturnType<typeof server>) => api.fetchMock.mock.calls.filter(([path, init]) => path === invitationPath && (init?.method ?? 'GET') !== 'GET')
const accepts = (api: ReturnType<typeof server>) => api.calls('POST', acceptPath)
const link = `${window.location.origin}/claim/${code}`

beforeEach(stubLanHttpCrypto)
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState(null, '', '/') })

// ---------------------------------------------------------------- API boundary

test('status reads never carry a code and reject malformed shapes', async () => {
  const api = server()
  await expect(getProfileInvitation(groupId, quick.userId)).resolves.toEqual({ active: false, expiresAt: null })
  expect(api.calls('GET', invitationPath)[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
  api.next(`GET ${invitationPath}`, () => response({ active: true, expiresAt: '2026-11-13T18:40:00Z', code }))
  await expect(getProfileInvitation(groupId, quick.userId)).resolves.toEqual({ active: true, expiresAt: '2026-11-13T18:40:00Z' })
  api.next(`GET ${invitationPath}`, () => response({ active: true, expiresAt: null }), () => response({ active: 'yes', expiresAt: null }))
  for (let i = 0; i < 2; i++) await expect(getProfileInvitation(groupId, quick.userId)).rejects.toThrow()
})

test('create and revoke send no body under CSRF without referrer or caching; malformed results are rejected', async () => {
  const api = server()
  await expect(createProfileInvitation(groupId, quick.userId)).resolves.toEqual({ code, expiresAt: api.state.expiresAt })
  await expect(revokeProfileInvitation(groupId, quick.userId)).resolves.toBeUndefined()
  for (const [, init] of writes(api)) {
    expect(init?.body).toBeUndefined()
    expect(init).toMatchObject({ cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'X-CSRF-TOKEN': 'csrf-token' } })
  }
  api.next(`POST ${invitationPath}`, () => response({ code: 'short', expiresAt: soon() }, 201), () => response({ code, expiresAt: 'later' }, 201),
    () => response({ code, expiresAt: soon() }, 200))
  for (let i = 0; i < 3; i++) await expect(createProfileInvitation(groupId, quick.userId)).rejects.toThrow()
})

test('public preview omits credentials, caches and referrer and keeps only the two names; accept is CSRF-protected', async () => {
  const api = server(null)
  api.next(`GET ${previewPath}`, () => response({ groupName, profileName, groupId, decks: ['leak'] }))
  await expect(previewProfileInvitation(code)).resolves.toEqual({ groupName, profileName })
  expect(api.calls('GET', previewPath)[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  await expect(acceptProfileInvitation(code)).resolves.toBeUndefined()
  expect(accepts(api)[0][1]).toMatchObject({ method: 'POST', referrerPolicy: 'no-referrer', headers: { 'X-CSRF-TOKEN': 'csrf-token' } })
  expect(accepts(api)[0][1]?.body).toBeUndefined()
  api.next(`POST ${acceptPath}`, () => new Response('{}', { status: 429, headers: { 'Retry-After': '9' } }),
    () => response({ code: 'PROFILE_CLAIM_SAME_GAME' }, 409), () => response({}, 200))
  await expect(acceptProfileInvitation(code)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 9 })
  await expect(acceptProfileInvitation(code)).rejects.toMatchObject({ status: 409, code: 'PROFILE_CLAIM_SAME_GAME' })
  await expect(acceptProfileInvitation(code)).rejects.not.toHaveProperty('status')
})

test('claim links are same-origin, distinct from Playgroup invitations, and segments are matched strictly', () => {
  expect(claimUrl(code)).toBe(link)
  expect(claimUrl(code, 'https://commander.example')).toBe(`https://commander.example/claim/${code}`)
  expect(invitationUrl(code)).not.toBe(claimUrl(code))
  expect(claimSegment(`/claim/${code}`)).toBe(code)
  for (const path of [`/invite/${code}`, `/claim/${code}/x`, '/claim/', `/claims/${code}`]) expect(claimSegment(path)).toBeNull()
})

// ---------------------------------------------------------------- issuer permissions and status

test('only OWNER and ADMIN viewers get the claim entry, appended after the existing quick-profile actions', () => {
  for (const role of ['OWNER', 'ADMIN'] as const) expect(memberActions(role, owner.id, quick, false).at(-1)).toBe('claim')
  expect(memberActions('MEMBER', uid(3), quick, false)).not.toContain('claim')
  for (const target of roster.filter(member => !member.quickProfile)) expect(memberActions('OWNER', owner.id, target, false)).not.toContain('claim')
})

test.each(['OWNER', 'ADMIN'] as const)('an active %s opens the dialog with a read-only status GET and no link', async role => {
  const api = server(owner, role)
  const dialog = await openClaim()
  expect(await within(dialog).findByText('Keine aktive Einladung')).toBeInTheDocument()
  expect(within(dialog).getByText(profileName)).toBeInTheDocument()
  expect(within(dialog).getByText('Erstelle einen einmalig verwendbaren Einladungslink. Er ist ab Erstellung 1 Stunde gültig.')).toBeInTheDocument()
  expect(api.calls('GET', invitationPath)).toHaveLength(1)
  expect(writes(api)).toHaveLength(0)
  // Menu interaction never triggered row navigation to the read-only deck view.
  expect(window.location.pathname).toBe(`/playgroups/${groupId}/members`)
})

test('a MEMBER keeps the ordinary quick-profile actions but never sees the claim entry', async () => {
  const api = server(owner, 'MEMBER')
  show(`/playgroups/${groupId}/members`)
  const items = within(await menuOf(profileName)).getAllByRole('menuitem').map(item => item.textContent)
  expect(items).toEqual(['Schnellprofil umbenennen', 'Deck erstellen'])
  expect(api.fetchMock.mock.calls.some(([path]) => String(path).includes('/invitation'))).toBe(false)
})

test('an existing invitation shows only its server expiry; the code cannot be retrieved', async () => {
  const api = server()
  const expiresAt = soon()
  api.state.status = { active: true, expiresAt }
  const dialog = await openClaim()
  expect(await within(dialog).findByText('Aktive Einladung')).toBeInTheDocument()
  expect(within(dialog).getByText('Der bestehende Link kann nicht erneut angezeigt werden.')).toBeInTheDocument()
  expect(dialog.querySelector('time')).toHaveAttribute('dateTime', expiresAt)
  expect(dialog.textContent).not.toContain('/claim/')
  expect(within(dialog).queryByRole('button', { name: 'Link kopieren' })).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Neue Einladung erstellen' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Einladung widerrufen' })).toBeInTheDocument()
})

test('a failed status read offers retry/close without claiming any state', async () => {
  const api = server()
  api.next(`GET ${invitationPath}`, () => response({}, 503))
  const dialog = await openClaim()
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Der Einladungsstatus konnte nicht geladen werden.')
  expect(within(dialog).queryByText('Keine aktive Einladung')).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Einladung erstellen' })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Erneut versuchen' }))
  expect(await within(dialog).findByText('Keine aktive Einladung')).toBeInTheDocument()
  expect(api.calls('GET', invitationPath)).toHaveLength(2)
  expect(writes(api)).toHaveLength(0)
})

// ---------------------------------------------------------------- create, share, replace, revoke

test('one deliberate create reveals the code once; share, copy and QR use the identical claim URL', async () => {
  const shared: unknown[] = []
  const writeText = vi.fn(() => Promise.resolve())
  vi.stubGlobal('navigator', { ...navigator, share: (data: unknown) => { shared.push(data); return Promise.resolve() }, canShare: () => true, clipboard: { writeText } })
  const api = server()
  const pending = deferred()
  api.next(`POST ${invitationPath}`, () => pending.promise)
  const dialog = await openClaim()
  const create = await within(dialog).findByRole('button', { name: 'Einladung erstellen' })
  fireEvent.click(create)
  fireEvent.click(create)
  expect(await within(dialog).findByRole('button', { name: 'Einladung wird erstellt…' })).toBeDisabled()
  for (const close of within(dialog).getAllByRole('button', { name: 'Schließen' })) expect(close).toBeDisabled()
  await act(async () => pending.resolve(response({ code, expiresAt: api.state.expiresAt }, 201)))
  expect(await within(dialog).findByText('Neue Einladung erstellt')).toHaveFocus()
  expect(writes(api)).toHaveLength(1)
  expect(within(dialog).getByLabelText('Einladungslink')).toHaveValue(link)
  expect(within(dialog).getByText('Einmalig verwendbar · 1 Stunde')).toBeInTheDocument()
  expect(dialog.querySelector('time')).toHaveAttribute('dateTime', api.state.expiresAt)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Teilen' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Link kopieren' }))
  expect(await within(dialog).findByText('Link kopiert')).toBeInTheDocument()
  expect(shared).toEqual([{ title: 'Profilübernahme', url: link }])
  expect(writeText).toHaveBeenCalledWith(link)
  const toggle = within(dialog).getByRole('button', { name: 'QR-Code anzeigen' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)
  const qr = await within(dialog).findByRole('img', { name: 'QR-Code mit dem Einladungslink' })
  expect(qr.querySelector('path')).toHaveAttribute('d', qrGeometry(link).path)
  expect(qr.querySelector('rect')).toHaveAttribute('fill', '#FFFFFF')
  expect(qr.querySelector('path')).toHaveAttribute('fill', '#000000')
  expect(within(dialog).getByRole('button', { name: 'QR-Code verbergen' })).toHaveAttribute('aria-expanded', 'true')
  // No external QR or other service received the code.
  expect(api.fetchMock.mock.calls.every(([path]) => !String(path).includes(code) || String(path).startsWith('/api/'))).toBe(true)
})

test('without native share, copying is primary and a denied clipboard selects the visible link instead of claiming success', async () => {
  vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
  server()
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung erstellen' }))
  const copy = await within(dialog).findByRole('button', { name: 'Link kopieren' })
  expect(within(dialog).queryByRole('button', { name: 'Teilen' })).not.toBeInTheDocument()
  fireEvent.click(copy)
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Der Link konnte nicht automatisch kopiert werden.')
  expect(within(dialog).queryByText('Link kopiert')).not.toBeInTheDocument()
  expect(within(dialog).getByLabelText('Einladungslink')).toHaveFocus()
})

test('closing discards the one-time code; reopening shows only the active status', async () => {
  const api = server()
  let dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung erstellen' }))
  expect(await within(dialog).findByLabelText('Einladungslink')).toHaveValue(link)
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Schließen' })[0])
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(document.body.textContent).not.toContain(code)
  fireEvent.click(within(await menuOf(profileName)).getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }))
  dialog = await screen.findByRole('dialog', { name: 'Profilübernahme einladen' })
  expect(await within(dialog).findByText('Aktive Einladung')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain(code)
  expect(writes(api)).toHaveLength(1)
})

test('replace needs its own named confirmation; cancel, X and Escape send nothing', async () => {
  const api = server()
  api.state.status = { active: true, expiresAt: soon() }
  api.state.nextCode = secondCode
  const dialog = await openClaim()
  const replace = await within(dialog).findByRole('button', { name: 'Neue Einladung erstellen' })
  for (const dismiss of ['Abbrechen', 'Schließen', 'Escape']) {
    fireEvent.click(replace)
    const confirm = await screen.findByRole('dialog', { name: 'Einladung ersetzen?' })
    expect(within(confirm).getByText(profileName)).toBeInTheDocument()
    expect(within(confirm).getByText('Der bisherige Einladungslink wird sofort ungültig – auch wenn du ihn bereits geteilt hast.')).toBeInTheDocument()
    if (dismiss === 'Escape') fireEvent.keyDown(confirm, { key: 'Escape' })
    else fireEvent.click(within(confirm).getByRole('button', { name: dismiss }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Einladung ersetzen?' })).not.toBeInTheDocument())
  }
  expect(writes(api)).toHaveLength(0)
  fireEvent.click(replace)
  const confirm = await screen.findByRole('dialog', { name: 'Einladung ersetzen?' })
  const create = within(confirm).getByRole('button', { name: 'Neuen Link erstellen' })
  fireEvent.click(create)
  fireEvent.click(create)
  expect(await within(dialog).findByLabelText('Einladungslink')).toHaveValue(`${window.location.origin}/claim/${secondCode}`)
  expect(writes(api)).toHaveLength(1)
})

test('revoke needs its own confirmation and a confirmed 204 returns to no active invitation', async () => {
  const api = server()
  api.state.status = { active: true, expiresAt: soon() }
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung widerrufen' }))
  const confirm = await screen.findByRole('dialog', { name: 'Einladung widerrufen?' })
  expect(within(confirm).getByText('Das Schnellprofil, seine Decks und seine Spiele bleiben unverändert.')).toBeInTheDocument()
  expect(api.calls('DELETE', invitationPath)).toHaveLength(0)
  fireEvent.click(within(confirm).getByRole('button', { name: 'Einladung widerrufen' }))
  expect(await within(dialog).findByText('Keine aktive Einladung')).toBeInTheDocument()
  expect(await within(dialog).findByRole('status')).toHaveTextContent('Die Einladung wurde widerrufen.')
  expect(api.calls('DELETE', invitationPath)).toHaveLength(1)
})

test('a definite create rejection shows no link and keeps the previous state', async () => {
  const api = server()
  api.state.status = { active: true, expiresAt: soon() }
  api.next(`POST ${invitationPath}`, () => response({}, 409))
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Neue Einladung erstellen' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Einladung ersetzen?' })).getByRole('button', { name: 'Neuen Link erstellen' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Es wurde kein neuer Link erstellt.')
  expect(within(dialog).getByText('Aktive Einladung')).toBeInTheDocument()
  expect(within(dialog).queryByLabelText('Einladungslink')).not.toBeInTheDocument()
})

test.each([
  ['lost response', lost],
  ['5xx', () => response({}, 502)],
  ['malformed 201', () => response({ code: 'nope' }, 201)],
])('an ambiguous replacement (%s) retires the old state, never retries and recovers only through a status GET', async (_label, reply) => {
  const api = server()
  api.state.status = { active: true, expiresAt: soon() }
  api.next(`POST ${invitationPath}`, reply)
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Neue Einladung erstellen' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Einladung ersetzen?' })).getByRole('button', { name: 'Neuen Link erstellen' }))
  expect(await within(dialog).findByText('Erstellung nicht bestätigt')).toHaveFocus()
  expect(within(dialog).queryByText('Aktive Einladung')).not.toBeInTheDocument()
  expect(within(dialog).queryByLabelText('Einladungslink')).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: /erstellen/ })).not.toBeInTheDocument()
  expect(writes(api)).toHaveLength(1)
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Status prüfen' }))
  expect(await within(dialog).findByText('Aktive Einladung')).toBeInTheDocument()
  expect(within(dialog).getByText(/Ein möglicherweise gerade erstellter Link lässt sich nicht abrufen/)).toBeInTheDocument()
  expect(writes(api)).toHaveLength(1)
})

test('an ambiguous revoke makes no success claim and a status GET decides', async () => {
  const api = server()
  api.state.status = { active: true, expiresAt: soon() }
  api.next(`DELETE ${invitationPath}`, () => { api.state.status = { active: false, expiresAt: null }; return lost() })
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung widerrufen' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Einladung widerrufen?' })).getByRole('button', { name: 'Einladung widerrufen' }))
  expect(await within(dialog).findByText('Widerruf nicht bestätigt')).toBeInTheDocument()
  expect(within(dialog).queryByText('Die Einladung wurde widerrufen.')).not.toBeInTheDocument()
  api.next(`GET ${invitationPath}`, () => response({}, 503))
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Status prüfen' }))
  expect(await within(dialog).findByText('Der Status konnte nicht geprüft werden. Bitte versuche es erneut.')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Status prüfen' }))
  expect(await within(dialog).findByText('Keine aktive Einladung')).toBeInTheDocument()
  expect(api.calls('DELETE', invitationPath)).toHaveLength(1)
})

test.each([
  [403, 'Diese Aktion ist für dich nicht mehr erlaubt. Die Mitgliederliste wurde aktualisiert.'],
  [404, 'Dieses Mitglied ist nicht mehr aktiv. Die Mitgliederliste wurde aktualisiert.'],
] as const)('a %s on an issuer operation retires the dialog and re-reads the roster', async (status, message) => {
  const api = server()
  api.next(`POST ${invitationPath}`, () => {
    // The server changed meanwhile: demoted to MEMBER (403) or the profile was claimed/deleted (404).
    if (status === 403) api.state.role = 'MEMBER'
    else api.state.members = roster.filter(member => !member.quickProfile)
    return response({}, status)
  })
  const dialog = await openClaim()
  const reads = api.calls('GET', base).length
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung erstellen' }))
  expect(await screen.findByText(message)).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.calls('GET', base).length).toBeGreaterThan(reads)
  expect(window.location.pathname).toBe(`/playgroups/${groupId}/members`)
  if (status === 403) expect(within(await menuOf(profileName)).queryByRole('menuitem', { name: 'Zur Profilübernahme einladen' })).not.toBeInTheDocument()
  else expect(screen.queryByText(profileName, { selector: 'li span' })).not.toBeInTheDocument()
})

test('a 403 on the status read is also authoritative', async () => {
  const api = server()
  api.next(`GET ${invitationPath}`, () => { api.state.role = 'MEMBER'; return response({}, 403) })
  await openClaim()
  expect(await screen.findByText('Diese Aktion ist für dich nicht mehr erlaubt. Die Mitgliederliste wurde aktualisiert.')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(writes(api)).toHaveLength(0)
})

test('a 401 ends the session without exposing invitation state', async () => {
  const api = server()
  api.next(`GET ${invitationPath}`, () => { api.state.user = null; return response({}, 401) })
  await openClaim()
  expect(await screen.findByText('Your session expired. Sign in again.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Profilübernahme einladen' })).not.toBeInTheDocument()
})

test('a late creation result after logout never reveals a code to the next session', async () => {
  const api = server()
  const pending = deferred()
  api.next(`POST ${invitationPath}`, () => pending.promise)
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung erstellen' }))
  await within(dialog).findByRole('button', { name: 'Einladung wird erstellt…' })
  // Logout is still reachable through the shell; the dialog's lifetime ends with the session.
  fireEvent.click(within(screen.getByRole('banner', { hidden: true })).getByRole('button', { hidden: true }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden', hidden: true }))
  expect(await screen.findByText('Logged out.')).toBeInTheDocument()
  await act(async () => pending.resolve(response({ code, expiresAt: soon() }, 201)))
  expect(document.body.textContent).not.toContain(code)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('reaching the server expiry discards a created link without a countdown', async () => {
  const api = server()
  api.state.expiresAt = new Date(Date.now() + 300).toISOString()
  const dialog = await openClaim()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Einladung erstellen' }))
  expect(await within(dialog).findByLabelText('Einladungslink')).toHaveValue(link)
  expect(await within(dialog).findByText('Die Einladung ist abgelaufen.', {}, { timeout: 3000 })).toBeInTheDocument()
  expect(within(dialog).getByText('Keine aktive Einladung')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain(code)
})

// ---------------------------------------------------------------- public preview and authentication

test('a signed-out direct load shows only group and profile names and the existing auth choices', async () => {
  const api = server(null)
  show(`/claim/${code}`)
  expect(await screen.findByRole('heading', { level: 2, name: groupName })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Profilübernahme' })).toBeInTheDocument()
  expect(screen.getByText(profileName)).toBeInTheDocument()
  expect(screen.getByText('Melde dich an oder erstelle ein Konto, um dieses Schnellprofil zu übernehmen.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Registrieren' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Profil übernehmen' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Gültig bis/)).not.toBeInTheDocument()
  expect(screen.queryByText(groupId)).not.toBeInTheDocument()
  expect(accepts(api)).toHaveLength(0)
  // Distinct from the ordinary Playgroup invitation preview.
  expect(api.calls('GET', `/api/invitations/${code}`)).toHaveLength(0)
})

test('registration then the separate login return to the identical claim link without accepting', async () => {
  const api = server(null)
  const view = show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrieren' }))
  await waitFor(() => expect(document.getElementById('auth-register-email')).toHaveFocus())
  expect(screen.getByRole('heading', { name: 'Profilübernahme' })).toBeInTheDocument()
  // Reloading keeps the auth detour for the same link.
  view.unmount()
  show(`/claim/${code}`, { inviteAuth: 'register' })
  const form = within((await screen.findByRole('heading', { name: 'Create an account' })).closest('section')!)
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'frodo@example.test' } })
  fireEvent.change(form.getByLabelText('Username'), { target: { value: 'Frodo' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(form.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByText('Account created for Frodo. Sign in separately to continue.')).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/claim/${code}`)
  await signIn()
  expect(await screen.findByRole('button', { name: 'Profil übernehmen' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/claim/${code}`)
  expect(screen.getByText(visitor.username)).toBeInTheDocument()
  expect(accepts(api)).toHaveLength(0)
})

test('Zurück zur Einladung leaves the claim auth detour for the preview', async () => {
  server(null)
  show(`/claim/${code}`, { inviteAuth: 'login' })
  fireEvent.click(await screen.findByRole('link', { name: 'Zurück zur Einladung' }))
  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/claim/${code}`)
})

test('a malformed code is unavailable without any request', async () => {
  const api = server(null)
  show('/claim/not-a-valid-code')
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/')
  expect(api.fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/profile-invitations'))).toBe(false)
})

// ---------------------------------------------------------------- signed-in choices, confirmation and success

test('Nicht übernehmen leaves for Playgroups without any mutation', async () => {
  const api = server(visitor)
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('link', { name: 'Nicht übernehmen' }))
  await waitFor(() => expect(window.location.pathname).toBe('/playgroups'))
  expect(accepts(api)).toHaveLength(0)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')).toHaveLength(0)
})

test('Profil übernehmen only opens the confirmation; Abbrechen, X and Escape send nothing', async () => {
  const api = server(visitor)
  show(`/claim/${code}`)
  const start = await screen.findByRole('button', { name: 'Profil übernehmen' })
  expect(screen.getByText('Angemeldet als')).toBeInTheDocument()
  expect(screen.getByText(visitor.username)).toBeInTheDocument()
  for (const dismiss of ['Abbrechen', 'Schließen', 'Escape']) {
    fireEvent.click(start)
    const confirm = await screen.findByRole('dialog', { name: 'Schnellprofil übernehmen?' })
    expect(within(confirm).getByText(profileName)).toBeInTheDocument()
    expect(within(confirm).getByText(`Playgroup: ${groupName}`)).toBeInTheDocument()
    expect(within(confirm).getByText(visitor.username)).toBeInTheDocument()
    expect(within(confirm).getByText('Das Schnellprofil wird dauerhaft entfernt. Die Übernahme kann nicht rückgängig gemacht werden.')).toBeInTheDocument()
    if (dismiss === 'Escape') fireEvent.keyDown(confirm, { key: 'Escape' })
    else fireEvent.click(within(confirm).getByRole('button', { name: dismiss }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  }
  expect(accepts(api)).toHaveLength(0)
})

test('only Jetzt übernehmen accepts, once; a confirmed 204 opens fresh Playgroups with the exact success message', async () => {
  const api = server(visitor)
  const pending = deferred()
  api.next(`POST ${acceptPath}`, () => pending.promise)
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  const confirm = await screen.findByRole('dialog', { name: 'Schnellprofil übernehmen?' })
  const now = within(confirm).getByRole('button', { name: 'Jetzt übernehmen' })
  fireEvent.click(now)
  fireEvent.click(now)
  expect(await within(confirm).findByRole('button', { name: 'Übernahme läuft…' })).toBeDisabled()
  expect(within(confirm).getByRole('button', { name: 'Abbrechen' })).toBeDisabled()
  fireEvent.keyDown(confirm, { key: 'Escape' })
  expect(screen.getByRole('dialog', { name: 'Schnellprofil übernehmen?' })).toBeInTheDocument()
  // No optimistic success while the POST is pending.
  expect(screen.queryByText('Schnellprofil erfolgreich übernommen.')).not.toBeInTheDocument()
  const groupReads = api.calls('GET', '/api/groups').length
  await act(async () => pending.resolve(new Response(null, { status: 204 })))
  await waitFor(() => expect(window.location.pathname).toBe('/playgroups'))
  expect(await screen.findByText('Schnellprofil erfolgreich übernommen.')).toBeInTheDocument()
  expect(await screen.findByText(groupName)).toBeInTheDocument()
  expect(api.calls('GET', '/api/groups').length).toBeGreaterThan(groupReads)
  expect(accepts(api)).toHaveLength(1)
})

test('a 400 on accept shows the generic unavailable state and discards the names', async () => {
  const api = server(visitor)
  api.next(`POST ${acceptPath}`, () => response({}, 400))
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toHaveFocus()
  expect(screen.queryByText(groupName)).not.toBeInTheDocument()
  expect(screen.queryByText(profileName)).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText(/erfolgreich/)).not.toBeInTheDocument()
})

test('a same-game 409 changes nothing; a manual re-check is read-only and a new accept needs a new confirmation', async () => {
  const api = server(visitor)
  api.next(`POST ${acceptPath}`, () => response({ type: 'about:blank', status: 409, code: 'PROFILE_CLAIM_SAME_GAME' }, 409))
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  expect(await screen.findByRole('heading', { name: 'Übernahme noch nicht möglich' })).toHaveFocus()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText(`Schnellprofil: ${profileName}`)).toBeInTheDocument()
  expect(screen.getByText('Es wurden keine Daten verändert. Der Link bleibt bis zum Ablauf gültig.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Zur Playgroups-Übersicht' })).toHaveAttribute('href', '/playgroups')
  const previews = api.calls('GET', previewPath).length
  fireEvent.click(screen.getByRole('button', { name: 'Erneut prüfen' }))
  const start = await screen.findByRole('button', { name: 'Profil übernehmen' })
  expect(api.calls('GET', previewPath)).toHaveLength(previews + 1)
  expect(accepts(api)).toHaveLength(1)
  // After an OWNER/ADMIN corrected the game, the same valid token is accepted only after a new confirmation.
  fireEvent.click(start)
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  expect(await screen.findByText('Schnellprofil erfolgreich übernommen.')).toBeInTheDocument()
  expect(accepts(api)).toHaveLength(2)
})

test.each([
  ['lost response', lost],
  ['5xx', () => response({}, 503)],
  ['unexpected 200', () => response({}, 200)],
])('an ambiguous accept (%s) claims nothing, never re-posts, and a usable re-check needs a fresh confirmation', async (_label, reply) => {
  const api = server(visitor)
  api.next(`POST ${acceptPath}`, reply)
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  expect(await screen.findByRole('heading', { name: 'Übernahme konnte nicht bestätigt werden' })).toHaveFocus()
  expect(screen.getByText('Status unklar')).toBeInTheDocument()
  expect(screen.queryByText(groupName)).not.toBeInTheDocument()
  expect(screen.queryByText(/erfolgreich/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Einladung erneut prüfen' }))
  expect(await screen.findByRole('button', { name: 'Profil übernehmen' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(accepts(api)).toHaveLength(1)
})

test('after an ambiguous accept, an unusable link infers neither success nor failure', async () => {
  const api = server(visitor)
  api.next(`POST ${acceptPath}`, lost)
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  await screen.findByRole('heading', { name: 'Übernahme konnte nicht bestätigt werden' })
  api.next(`GET ${previewPath}`, () => response({}, 400))
  fireEvent.click(screen.getByRole('button', { name: 'Einladung erneut prüfen' }))
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toBeInTheDocument()
  expect(screen.getByText('Ob deine letzte Übernahme ausgeführt wurde, lässt sich hier nicht feststellen. Prüfe deine Playgroups.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Zur Playgroups-Übersicht' })).toHaveAttribute('href', '/playgroups')
  expect(screen.queryByText(/erfolgreich/)).not.toBeInTheDocument()
  expect(accepts(api)).toHaveLength(1)
})

test('a definite 403 on accept (e.g. CSRF) reports no change and does not end the session', async () => {
  const api = server(visitor)
  api.next(`POST ${acceptPath}`, () => response({}, 403))
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Die Übernahme wurde nicht ausgeführt. Es wurde nichts verändert.')
  expect(screen.getByText(visitor.username)).toBeInTheDocument()
  expect(screen.queryByText('Your session expired. Sign in again.')).not.toBeInTheDocument()
  expect(accepts(api)).toHaveLength(1)
})

test('a 401 on accept expires the session and the following login never accepts automatically', async () => {
  const api = server(visitor)
  api.next(`POST ${acceptPath}`, () => { api.state.user = null; return response({}, 401) })
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  expect(await screen.findByText('Your session expired. Sign in again.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Einladung nicht verfügbar' })).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Anmelden' }))
  await signIn()
  expect(await screen.findByRole('button', { name: 'Profil übernehmen' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(accepts(api)).toHaveLength(1)
})

test('Anderes Konto verwenden logs out, returns to the same link and the next account must confirm again', async () => {
  const api = server(visitor)
  api.state.loginUser = other
  show(`/claim/${code}`)
  expect(await screen.findByText(visitor.username)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Anderes Konto verwenden' }))
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Profilübernahme' })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/claim/${code}`)
  expect(api.calls('DELETE', '/api/session')).toHaveLength(1)
  expect(screen.queryByText(visitor.username)).not.toBeInTheDocument()
  await signIn()
  expect(await screen.findByText(other.username)).toBeInTheDocument()
  expect(screen.queryByText(visitor.username)).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(accepts(api)).toHaveLength(0)
})

test('a late accept result after leaving the link is ignored', async () => {
  const api = server(visitor)
  const pending = deferred()
  api.next(`POST ${acceptPath}`, () => pending.promise)
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  await screen.findByRole('button', { name: 'Übernahme läuft…' })
  // Browser history moves elsewhere while the POST is in flight.
  act(() => { window.history.pushState(null, '', '/dashboard'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schnellprofil übernehmen?' })).not.toBeInTheDocument())
  await act(async () => pending.resolve(new Response(null, { status: 204 })))
  expect(window.location.pathname).toBe('/dashboard')
  expect(screen.queryByText('Schnellprofil erfolgreich übernommen.')).not.toBeInTheDocument()
})

// ---------------------------------------------------------------- preview errors and rate limits

test('a failed preview hides names, keeps the token and retries only on request', async () => {
  const api = server(null)
  api.next(`GET ${previewPath}`, lost)
  show(`/claim/${code}`)
  expect(await screen.findByRole('heading', { name: 'Einladung konnte nicht geladen werden' })).toHaveFocus()
  expect(screen.getByText('Vorschau nicht geladen')).toBeInTheDocument()
  expect(screen.queryByText(groupName)).not.toBeInTheDocument()
  expect(api.calls('GET', previewPath)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  expect(await screen.findByRole('heading', { level: 2, name: groupName })).toBeInTheDocument()
  expect(window.location.pathname).toBe(`/claim/${code}`)
})

test('a malformed preview body is a transient failure, not a usable preview', async () => {
  const api = server(null)
  api.next(`GET ${previewPath}`, () => response({ groupName }))
  show(`/claim/${code}`)
  expect(await screen.findByRole('heading', { name: 'Einladung konnte nicht geladen werden' })).toBeInTheDocument()
  expect(screen.queryByText(groupName)).not.toBeInTheDocument()
})

test('a 400 preview never reveals the reason and offers a safe exit', async () => {
  const api = server(visitor)
  api.next(`GET ${previewPath}`, () => response({ detail: 'This invitation is unavailable.' }, 400))
  show(`/claim/${code}`)
  expect(await screen.findByRole('heading', { name: 'Einladung nicht verfügbar' })).toBeInTheDocument()
  expect(screen.getByText('Dieser Link ist ungültig, abgelaufen oder kann nicht mehr verwendet werden.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/dashboard')
  expect(accepts(api)).toHaveLength(0)
})

test.each(['preview', 'accept'])('a 429 on %s shows the rate-limit state and honors Retry-After before a manual re-check', async source => {
  const api = server(visitor)
  const limited = () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } })
  if (source === 'preview') api.next(`GET ${previewPath}`, limited)
  else api.next(`POST ${acceptPath}`, limited)
  show(`/claim/${code}`)
  if (source === 'accept') {
    fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  }
  expect(await screen.findByRole('heading', { name: 'Bitte später erneut versuchen' })).toBeInTheDocument()
  expect(screen.getByText('Zu viele Anfragen')).toBeInTheDocument()
  expect(screen.queryByText(groupName)).not.toBeInTheDocument()
  const retry = screen.getByRole('button', { name: 'Erneut versuchen' })
  expect(retry).toBeDisabled()
  expect(screen.getByText('Wiederholen erst nach Ablauf der Wartezeit')).toBeInTheDocument()
  await waitFor(() => expect(retry).toBeEnabled(), { timeout: 3000 })
  fireEvent.click(retry)
  expect(await screen.findByRole('button', { name: 'Profil übernehmen' })).toBeInTheDocument()
  // Recovery is a read-only preview; any accept still needs a new confirmation.
  expect(accepts(api)).toHaveLength(source === 'accept' ? 1 : 0)
})

// ---------------------------------------------------------------- token protection

test('the token never reaches storage, logs or non-API requests during the full journey', async () => {
  const logged: unknown[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, method).mockImplementation((...args) => { logged.push(...args) })
  const api = server(visitor)
  show(`/claim/${code}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Profil übernehmen' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Jetzt übernehmen' }))
  await screen.findByText('Schnellprofil erfolgreich übernommen.')
  const stored = [...Object.values({ ...localStorage }), ...Object.values({ ...sessionStorage })].join()
  expect(stored).not.toContain(code)
  expect(JSON.stringify(logged)).not.toContain(code)
  const tokenRequests = api.fetchMock.mock.calls.filter(([path, init]) => String(path).includes(code) || String(init?.body ?? '').includes(code))
  expect(tokenRequests.map(([path]) => path)).toEqual([previewPath, acceptPath])
  // The consumed link was replaced in history.
  expect(window.location.pathname).toBe('/playgroups')
  vi.restoreAllMocks()
})
