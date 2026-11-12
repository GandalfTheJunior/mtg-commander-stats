import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import GroupPage from './GroupPage'
import QuickProfileDeckPage from './QuickProfileDeckPage'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { groupUrl } from './groupNavigation'
import { memberActions } from './membersModel'
import { response, uid } from './test/gameFixtures'
import type { GroupDetails, GroupMember, GroupRole } from './api'

const groupId = uid(10)
const base = `/api/groups/${groupId}`
const transferBase = `${base}/ownership-transfer`
const owner: GroupMember = { userId: uid(1), username: 'Gandalf', role: 'OWNER' }
const admin: GroupMember = { userId: uid(2), username: 'Saruman', role: 'ADMIN' }
const aragorn: GroupMember = { userId: uid(3), username: 'Aragorn', role: 'MEMBER' }
const frodo: GroupMember = { userId: uid(4), username: 'Frodo', role: 'MEMBER' }
const quick: GroupMember = { userId: uid(5), username: 'Flinker Waschbär', role: 'MEMBER', quickProfile: true }
const roster = [owner, admin, aragorn, quick, frodo]
const details = (role: GroupRole, members = roster): GroupDetails => ({ id: groupId, name: 'Commander-Runde', role, members })
const pendingTransfer = (state = 'PENDING') => ({ id: uid(70), groupId, requesterId: owner.userId, requesterUsername: owner.username,
  targetUserId: admin.userId, targetUsername: admin.username, state, createdAt: '2026-11-01T10:00:00Z', resolvedAt: null })

type Handler = (init?: RequestInit) => Response | Promise<Response>
/** Routes `METHOD path` to queued replies (last one repeats); unknown requests fail the test loudly. */
function api(routes: Record<string, Handler | Handler[]>) {
  const queues = new Map(Object.entries(routes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]))
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'test' })
    const queue = queues.get(`${method} ${path}`)
    if (!queue?.length) throw new Error(`Unexpected ${method} ${path}`)
    return (queue.length > 1 ? queue.shift()! : queue[0])(init)
  })
  vi.stubGlobal('fetch', fetchMock)
  const calls = (method: string, path: string) => fetchMock.mock.calls.filter(([p, init]) => p === path && (init?.method ?? 'GET') === method)
  return { fetchMock, calls, body: (method: string, path: string, index = 0) => JSON.parse(String(calls(method, path)[index][1]!.body)) as unknown }
}
const reads = (role: GroupRole, members = roster, transfer: unknown = null) => ({
  [`GET ${base}`]: () => response(details(role, members)),
  [`GET ${transferBase}`]: () => transfer ? response(transfer) : response({}, 404),
  [`GET ${transferBase}/notices`]: () => response([]),
})

function RouteLabel() { const location = useLocation(); return <p>Route {location.pathname}</p> }
function show(viewer: GroupMember = owner, entry: string | { pathname: string; state: unknown } = groupUrl(groupId, 'members'), tab: 'members' | 'overview' = 'members') {
  const unauthorized = vi.fn(), notice = vi.fn()
  const page = (current: 'members' | 'overview') => <GroupPage tab={current} currentUser={{ id: viewer.userId, username: viewer.username }} onUnauthorized={unauthorized} onNotice={notice} />
  render(<AppThemeProvider><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/playgroups/:groupId/members" element={page('members')} />
    <Route path="/playgroups/:groupId" element={page('overview')} />
    <Route path="*" element={<RouteLabel />} />
  </Routes></MemoryRouter></AppThemeProvider>)
  void tab
  return { unauthorized, notice }
}
const rows = () => within(screen.getByRole('list', { name: 'Aktive Mitglieder' })).getAllByRole('listitem')
const rowOf = (name: string) => rows().find(row => row.textContent?.includes(name))!
async function openMenu(name: string) {
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: new RegExp(`^Aktionen für ${name}`) }))
  return screen.getAllByRole('menuitem').map(item => item.textContent)
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

test('permission matrix offers only the approved actions per actor and target', () => {
  const ownerAdmin = { ...admin }, member = { ...frodo }
  expect(memberActions('OWNER', owner.userId, member, false)).toEqual(['promote', 'remove'])
  expect(memberActions('OWNER', owner.userId, ownerAdmin, false)).toEqual(['demote', 'transfer'])
  expect(memberActions('OWNER', owner.userId, ownerAdmin, true)).toEqual(['demote'])
  expect(memberActions('OWNER', owner.userId, owner, false)).toEqual([])
  expect(memberActions('ADMIN', admin.userId, member, false)).toEqual(['remove'])
  expect(memberActions('ADMIN', admin.userId, owner, false)).toEqual([])
  expect(memberActions('ADMIN', admin.userId, { ...aragorn, role: 'ADMIN', userId: uid(9) }, false)).toEqual([])
  expect(memberActions('ADMIN', admin.userId, admin, false)).toEqual([])
  for (const role of ['OWNER', 'ADMIN'] as const) expect(memberActions(role, uid(1), quick, false)).toEqual(['rename', 'deck', 'delete'])
  expect(memberActions('MEMBER', frodo.userId, quick, false)).toEqual(['rename', 'deck'])
  for (const target of [owner, admin, aragorn, frodo]) expect(memberActions('MEMBER', frodo.userId, target, false)).toEqual([])
})

test('combined roster keeps server order, labels, (Du), same-row actions and hides empty menus', async () => {
  api(reads('OWNER'))
  show()
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(rows().map(row => row.textContent?.replace(/›/g, '').trim())).toEqual([
    'Gandalf (Du)Owner', 'SarumanAdmin', 'AragornMitglied', 'Flinker WaschbärSchnellprofil', 'FrodoMitglied'])
  expect(within(rowOf('Gandalf')).queryByRole('button', { name: /Aktionen/ })).not.toBeInTheDocument()
  expect(within(rowOf('Saruman')).getByRole('button', { name: 'Aktionen für Saruman' })).toBeInTheDocument()
  const invite = screen.getByRole('button', { name: /Spieler einladen/ })
  const create = screen.getByRole('button', { name: /Schnellprofil erstellen/ })
  expect(invite.parentElement).toBe(create.parentElement)
  expect(screen.getByRole('group', { name: 'Mitglieder filtern' })).toBeInTheDocument()
  // Five members fit: no search control for a short roster, and the OWNER has no leave action.
  expect(screen.queryByRole('searchbox', { name: 'Mitglieder suchen' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Playgroup verlassen' })).not.toBeInTheDocument()
})

test('ordinary members see no registered-member menus but may rename quick profiles and create their decks', async () => {
  api(reads('MEMBER'))
  show(frodo)
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  for (const name of ['Gandalf', 'Saruman', 'Aragorn', 'Frodo']) expect(within(rowOf(name)).queryByRole('button', { name: /Aktionen/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Playgroup verlassen' })).toBeInTheDocument()
  expect(await openMenu('Flinker Waschbär')).toEqual(['Schnellprofil umbenennen', 'Deck erstellen'])
})

test('OWNER and ADMIN menus follow the matrix; ADMIN can delete quick profiles', async () => {
  api(reads('OWNER'))
  show()
  expect(await openMenu('Saruman')).toEqual(['Zum Mitglied zurückstufen', 'Eigentümerschaft übertragen'])
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(await openMenu('Frodo')).toEqual(['Zum Admin ernennen', 'Aus Gruppe entfernen'])
  vi.unstubAllGlobals()
})

test('ADMIN viewer can only remove ordinary members and sees the leave action', async () => {
  api(reads('ADMIN'))
  show(admin)
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(within(rowOf('Gandalf')).queryByRole('button', { name: /Aktionen/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Playgroup verlassen' })).toBeInTheDocument()
  expect(await openMenu('Frodo')).toEqual(['Aus Gruppe entfernen'])
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(await openMenu('Flinker Waschbär')).toEqual(['Schnellprofil umbenennen', 'Deck erstellen', 'Schnellprofil löschen'])
})

test('whole-row activation opens the member deck route; the three-dot trigger never navigates', async () => {
  api(reads('OWNER'))
  show()
  await openMenu('Frodo')
  expect(screen.queryByText(/^Route/)).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  fireEvent.click(within(rowOf('Flinker Waschbär')).getByRole('button', { name: /^Flinker Waschbär/ }))
  expect(await screen.findByText(`Route /playgroups/${groupId}/members/${quick.userId}/decks`)).toBeInTheDocument()
})

test('duplicate visible names get the #192 eight-character UUID prefix; unique names none', async () => {
  const twin = (n: number): GroupMember => ({ userId: `abcdef12-${n}000-4000-8000-00000000000${n}`, username: 'Sam', role: 'MEMBER' })
  api(reads('MEMBER', [owner, twin(1), twin(2), frodo]))
  show(frodo)
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(rows()[1]).toHaveTextContent('Sam · ID: abcdef121')
  expect(rows()[2]).toHaveTextContent('Sam · ID: abcdef122')
  expect(rowOf('Frodo')).not.toHaveTextContent('ID:')
})

test('quick-profile filter has its own empty state; search appears for long rosters and resets only the term', async () => {
  const many = Array.from({ length: 10 }, (_, i): GroupMember => ({ userId: uid(30 + i), username: `Spieler ${i}`, role: 'MEMBER' }))
  api(reads('OWNER', [owner, ...many]))
  show()
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  fireEvent.click(screen.getByRole('button', { name: 'Nur Schnellprofile' }))
  expect(screen.getByText('Keine Schnellprofile vorhanden')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Alle Mitglieder anzeigen' }))
  expect(screen.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Nur registrierte Nutzer' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Mitglieder suchen' }), { target: { value: 'Darth Vader' } })
  expect(screen.getByText('Keine Mitglieder gefunden')).toBeInTheDocument()
  expect(screen.getByText('Für „Darth Vader“ gibt es keine Treffer.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Suche zurücksetzen' }))
  expect(screen.getByRole('searchbox', { name: 'Mitglieder suchen' })).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Nur registrierte Nutzer' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Mitglieder suchen' }), { target: { value: 'spieler 3' } })
  expect(rows().map(row => row.dataset.member)).toEqual([uid(33)])
})

test('Back restores the remembered filter and search from the Members history entry', async () => {
  api(reads('OWNER'))
  show(owner, { pathname: groupUrl(groupId, 'members'), state: { membersDirectory: { filter: 'quick', search: 'flink', listScroll: 0, pageScroll: 0 } } })
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(screen.getByRole('button', { name: 'Nur Schnellprofile' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('searchbox', { name: 'Mitglieder suchen' })).toHaveValue('flink')
  expect(rows().map(row => row.dataset.member)).toEqual([quick.userId])
})

test('promotion requires confirmation, sends only the role and refreshes from the server', async () => {
  const promoted = roster.map(member => member.userId === frodo.userId ? { ...member, role: 'ADMIN' as const } : member)
  const server = api({ ...reads('OWNER'), [`GET ${base}`]: [() => response(details('OWNER')), () => response(details('OWNER', promoted))],
    [`PATCH ${base}/members/${frodo.userId}/role`]: () => response({ ...frodo, role: 'ADMIN', quickProfile: false }) })
  show()
  await openMenu('Frodo')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Zum Admin ernennen' }))
  const dialog = screen.getByRole('dialog', { name: 'Zum Admin ernennen?' })
  expect(dialog).toHaveTextContent('Möchtest du Frodo zum Admin ernennen?')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  expect(server.calls('PATCH', `${base}/members/${frodo.userId}/role`)).toHaveLength(0)
  await openMenu('Frodo')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Zum Admin ernennen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ernennung bestätigen' }))
  await waitFor(() => expect(rowOf('Frodo')).toHaveTextContent('Admin'))
  expect(server.body('PATCH', `${base}/members/${frodo.userId}/role`)).toEqual({ role: 'ADMIN' })
  expect(await screen.findByText('Frodo ist jetzt Admin.')).toBeInTheDocument()
})

test('confirmed removal drops the row; a repeated click cannot send a second DELETE', async () => {
  const server = api({ ...reads('ADMIN'), [`GET ${base}`]: [() => response(details('ADMIN')), () => response(details('ADMIN', roster.filter(m => m !== frodo)))],
    [`DELETE ${base}/members/${frodo.userId}`]: () => new Response(null, { status: 204 }) })
  show(admin)
  await openMenu('Frodo')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Aus Gruppe entfernen' }))
  const dialog = screen.getByRole('dialog', { name: 'Mitglied entfernen?' })
  expect(dialog).toHaveTextContent('Ein späterer Beitritt ist mit einer neuen, gültigen Einladung möglich.')
  const confirm = within(dialog).getByRole('button', { name: 'Mitglied entfernen' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(screen.queryByText('Frodo')).not.toBeInTheDocument())
  expect(server.calls('DELETE', `${base}/members/${frodo.userId}`)).toHaveLength(1)
})

test.each([
  [409, 'Die Playgroup wurde zwischenzeitlich geändert.'],
  [404, 'Dieses Mitglied ist nicht mehr aktiv.'],
  [403, 'Diese Aktion ist für dich nicht mehr erlaubt.'],
])('removal %s reconciles with an authoritative read and never claims success', async (status, message) => {
  const server = api({ ...reads('OWNER'), [`DELETE ${base}/members/${frodo.userId}`]: () => response({}, status) })
  show()
  await openMenu('Frodo')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Aus Gruppe entfernen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mitglied entfernen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(server.calls('GET', base)).toHaveLength(2)
  expect(screen.queryByText(/wurde aus der Playgroup entfernt/)).not.toBeInTheDocument()
})

test('stale authorization: 403 followed by lost membership retires the group', async () => {
  api({ ...reads('OWNER'), [`GET ${base}`]: [() => response(details('OWNER')), () => response({}, 403)],
    [`PATCH ${base}/members/${admin.userId}/role`]: () => response({}, 403) })
  const { notice } = show()
  await openMenu('Saruman')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Zum Mitglied zurückstufen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zurückstufung bestätigen' }))
  expect(await screen.findByText('Route /playgroups')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledWith({ kind: 'error', message: 'Du hast keinen Zugriff mehr auf diese Playgroup.' })
})

test('a 401 during a write uses session recovery', async () => {
  api({ ...reads('OWNER'), [`DELETE ${base}/members/${frodo.userId}`]: () => response({}, 401) })
  const { unauthorized } = show()
  await openMenu('Frodo')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Aus Gruppe entfernen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mitglied entfernen' }))
  await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce())
})

test('quick-profile creation shows the persisted server name; changing the name and cancelling never deletes it', async () => {
  const created: GroupMember = { userId: uid(6), username: 'Hairy Zombie', role: 'MEMBER', quickProfile: true }
  const withNew = [...roster, created]
  const server = api({ ...reads('MEMBER'), [`GET ${base}`]: [() => response(details('MEMBER')), () => response(details('MEMBER', withNew))],
    [`POST ${base}/quick-profiles`]: () => response({ ...created }, 201) })
  show(frodo)
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  fireEvent.click(screen.getByRole('button', { name: 'Nur registrierte Nutzer' }))
  fireEvent.click(screen.getByRole('button', { name: /Schnellprofil erstellen/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Schnellprofil erstellt' })
  expect(dialog).toHaveTextContent('„Hairy Zombie“')
  expect(server.calls('POST', `${base}/quick-profiles`)[0][1]!.body).toBeUndefined()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Namen ändern' }))
  const rename = await screen.findByRole('dialog', { name: 'Schnellprofil umbenennen' })
  fireEvent.click(within(rename).getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  // New profiles reset to Alle with a cleared search so the profile is visible.
  expect(screen.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true')
  expect(rowOf('Hairy Zombie')).toBeInTheDocument()
  expect(server.fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE' || init?.method === 'PATCH')).toBe(false)
})

test('rename uses a replace-on-focus hint, blocks blank input and keeps typed text on name conflicts', async () => {
  const renamed = { ...quick, username: 'Lena' }
  const server = api({ ...reads('MEMBER'), [`GET ${base}`]: [() => response(details('MEMBER')), () => response(details('MEMBER', roster.map(m => m === quick ? renamed : m)))],
    [`PATCH ${base}/quick-profiles/${quick.userId}`]: [
      () => response({ status: 409, detail: 'taken', code: 'QUICK_PROFILE_NAME_TAKEN' }, 409),
      () => response({ status: 400, detail: 'too long', errors: [{ field: 'name', code: 'NAME_TOO_LONG', maxLength: 20 }] }, 400),
      () => response(renamed)] })
  show(frodo)
  await openMenu('Flinker Waschbär')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Schnellprofil umbenennen' }))
  const field = screen.getByRole('textbox', { name: 'Profilname' })
  expect(field).toHaveAttribute('placeholder', 'Flinker Waschbär')
  expect(field).toHaveValue('')
  fireEvent.focus(field)
  expect(field).not.toHaveAttribute('placeholder')
  const save = screen.getByRole('button', { name: 'Speichern' })
  expect(save).toBeDisabled()
  fireEvent.change(field, { target: { value: '   ' } })
  expect(save).toBeDisabled()
  fireEvent.change(field, { target: { value: 'Lena' } })
  fireEvent.click(save)
  expect(await screen.findByText(/Diesen Namen verwendet bereits ein anderes Schnellprofil/)).toBeInTheDocument()
  expect(field).toHaveValue('Lena')
  fireEvent.click(save)
  expect(await screen.findByText('Der Name ist zu lang. Verwende höchstens 20 Zeichen.')).toBeInTheDocument()
  fireEvent.click(save)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await screen.findByText('Lena')).toBeInTheDocument()
  expect(server.body('PATCH', `${base}/quick-profiles/${quick.userId}`)).toEqual({ name: 'Lena' })
})

test('quick-profile deletion confirms irreversibility and sends the dedicated DELETE', async () => {
  const server = api({ ...reads('OWNER'), [`GET ${base}`]: [() => response(details('OWNER')), () => response(details('OWNER', roster.filter(m => m !== quick)))],
    [`DELETE ${base}/quick-profiles/${quick.userId}`]: () => new Response(null, { status: 204 }) })
  show()
  await openMenu('Flinker Waschbär')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Schnellprofil löschen' }))
  const dialog = screen.getByRole('dialog', { name: 'Schnellprofil löschen?' })
  expect(dialog).toHaveTextContent('Diese Aktion kann nicht rückgängig gemacht werden.')
  expect(dialog).toHaveTextContent('anonymisiert erhalten')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schnellprofil löschen' }))
  await waitFor(() => expect(screen.queryByText('Flinker Waschbär')).not.toBeInTheDocument())
  expect(server.calls('DELETE', `${base}/quick-profiles/${quick.userId}`)).toHaveLength(1)
  expect(server.calls('DELETE', `${base}/members/${quick.userId}`)).toHaveLength(0)
})

test('OWNER offers ownership after confirmation, sees pending status and withdraws without a second dialog', async () => {
  const transfer = pendingTransfer()
  const server = api({ ...reads('OWNER'), [`GET ${transferBase}`]: [() => response({}, 404), () => response(transfer), () => response({}, 404)],
    [`POST ${transferBase}`]: () => response(transfer, 201),
    [`DELETE ${transferBase}`]: () => new Response(null, { status: 204 }) })
  show()
  await openMenu('Saruman')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eigentümerschaft übertragen' }))
  const dialog = screen.getByRole('dialog', { name: 'Eigentümerschaft anbieten?' })
  expect(dialog).toHaveTextContent('Bis dahin bleibst du Owner.')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Angebot senden' }))
  expect(await screen.findByText('Eigentümerübertragung angefragt')).toBeInTheDocument()
  expect(screen.getByText('Angebot an Saruman · Antwort ausstehend')).toBeInTheDocument()
  expect(server.body('POST', transferBase)).toEqual({ targetUserId: admin.userId })
  expect(await openMenu('Saruman')).toEqual(['Zum Mitglied zurückstufen'])
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Anfrage zurückziehen' }))
  expect(await screen.findByText('Dein Angebot zur Eigentümerübertragung wurde zurückgezogen.')).toBeInTheDocument()
  expect(screen.queryByText('Eigentümerübertragung angefragt')).not.toBeInTheDocument()
  expect(server.body('DELETE', transferBase)).toEqual({ requestId: transfer.id })
})

test('a failed withdrawal keeps the pending status after the authoritative re-read', async () => {
  api({ ...reads('OWNER', roster, pendingTransfer()), [`DELETE ${transferBase}`]: () => Promise.reject(new Error('offline')) })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Anfrage zurückziehen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Die Anfrage konnte nicht zurückgezogen werden.')
  expect(screen.getByText('Eigentümerübertragung angefragt')).toBeInTheDocument()
})

test('recipient ADMIN gets the banner above the tabs on every tab; info never answers and decline is immediate', async () => {
  const transfer = pendingTransfer()
  const server = api({ ...reads('ADMIN', roster, transfer), [`GET ${transferBase}`]: [() => response(transfer), () => response({}, 404)],
    [`POST ${transferBase}/decline`]: () => response(pendingTransfer('DECLINED')) })
  show(admin, groupUrl(groupId))
  const banner = await screen.findByRole('region', { name: 'Eigentümerübertragung' })
  expect(banner).toHaveTextContent('Gandalf möchte dir die Eigentümerschaft übertragen.')
  expect(banner.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(banner).getByRole('button', { name: 'Was bedeutet das?' }))
  const info = screen.getByRole('dialog', { name: 'Was bedeutet das?' })
  expect(info).toHaveTextContent('Diese Information nimmt das Angebot nicht an.')
  expect(within(info).queryByRole('button', { name: /Annehmen|Ablehnen/ })).not.toBeInTheDocument()
  fireEvent.click(within(info).getByRole('button', { name: 'Verstanden' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(server.fetchMock.mock.calls.some(([path]) => String(path).endsWith('/accept') || String(path).endsWith('/decline'))).toBe(false)
  fireEvent.click(within(banner).getByRole('button', { name: 'Ablehnen' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Eigentümerübertragung' })).not.toBeInTheDocument())
  expect(server.body('POST', `${transferBase}/decline`)).toEqual({ requestId: transfer.id })
})

test('acceptance needs the final confirmation, then refreshes authoritative roles and shows success once', async () => {
  const transfer = pendingTransfer()
  const swapped = roster.map(m => m === owner ? { ...m, role: 'MEMBER' as const } : m === admin ? { ...m, role: 'OWNER' as const } : m)
  const server = api({ ...reads('ADMIN', roster, transfer), [`GET ${base}`]: [() => response(details('ADMIN')), () => response(details('OWNER', swapped))],
    [`GET ${transferBase}`]: [() => response(transfer), () => response({}, 404)],
    [`POST ${transferBase}/accept`]: () => response(pendingTransfer('ACCEPTED')) })
  show(admin)
  const banner = await screen.findByRole('region', { name: 'Eigentümerübertragung' })
  fireEvent.click(within(banner).getByRole('button', { name: 'Annehmen' }))
  const confirm = screen.getByRole('dialog', { name: 'Eigentümerschaft übernehmen?' })
  expect(confirm).toHaveTextContent('Gandalf wird zu einem normalen Mitglied.')
  expect(server.calls('POST', `${transferBase}/accept`)).toHaveLength(0)
  fireEvent.click(within(confirm).getByRole('button', { name: 'Übernahme bestätigen' }))
  expect(await screen.findByText('Du bist jetzt Owner dieser Playgroup.')).toBeInTheDocument()
  await waitFor(() => expect(rowOf('Saruman')).toHaveTextContent('Owner'))
  expect(rowOf('Gandalf')).toHaveTextContent('Mitglied')
  expect(server.body('POST', `${transferBase}/accept`)).toEqual({ requestId: transfer.id })
})

test('a stale acceptance (409) re-reads state and never claims success', async () => {
  const transfer = pendingTransfer()
  api({ ...reads('ADMIN', roster, transfer), [`GET ${transferBase}`]: [() => response(transfer), () => response({}, 404)],
    [`POST ${transferBase}/accept`]: () => response({}, 409) })
  show(admin)
  fireEvent.click(within(await screen.findByRole('region', { name: 'Eigentümerübertragung' })).getByRole('button', { name: 'Annehmen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Übernahme bestätigen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Dieses Angebot ist nicht mehr gültig.')
  expect(screen.queryByRole('region', { name: 'Eigentümerübertragung' })).not.toBeInTheDocument()
  expect(screen.queryByText('Du bist jetzt Owner dieser Playgroup.')).not.toBeInTheDocument()
})

test('ordinary members never request transfer status and see no banner', async () => {
  const server = api(reads('MEMBER'))
  show(frodo)
  await screen.findByRole('list', { name: 'Aktive Mitglieder' })
  expect(server.calls('GET', transferBase)).toHaveLength(0)
  expect(screen.queryByRole('region', { name: 'Eigentümerübertragung' })).not.toBeInTheDocument()
})

test('durable outcome notices show once each, are acknowledged after presentation and drained across batches', async () => {
  const accepted = { ...pendingTransfer('ACCEPTED'), id: uid(71) }
  const declined = { ...pendingTransfer('DECLINED'), id: uid(72) }
  const later = { ...pendingTransfer('DECLINED'), id: uid(73), targetUsername: 'Radagast' }
  const server = api({ ...reads('MEMBER'), [`GET ${transferBase}/notices`]: [() => response([accepted, declined]), () => response([later]), () => response([])],
    ...Object.fromEntries([accepted, declined, later].map(notice => [`POST ${transferBase}/notices/${notice.id}/acknowledge`, () => new Response(null, { status: 204 })])) })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  show(owner)
  expect(await screen.findByText('Saruman hat die Eigentümerschaft übernommen. Du bist jetzt Mitglied.')).toBeInTheDocument()
  await waitFor(() => expect(server.calls('POST', `${transferBase}/notices/${accepted.id}/acknowledge`)).toHaveLength(1))
  // The second notice is not acknowledged before it is presented.
  expect(server.calls('POST', `${transferBase}/notices/${declined.id}/acknowledge`)).toHaveLength(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
  expect(await screen.findByText('Saruman hat dein Angebot zur Eigentümerübertragung abgelehnt. Du bleibst Owner.')).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
  expect(await screen.findByText('Radagast hat dein Angebot zur Eigentümerübertragung abgelehnt. Du bleibst Owner.')).toBeInTheDocument()
  vi.useRealTimers()
  await waitFor(() => expect(server.calls('GET', `${transferBase}/notices`)).toHaveLength(3))
  for (const notice of [accepted, declined, later]) expect(server.calls('POST', `${transferBase}/notices/${notice.id}/acknowledge`)).toHaveLength(1)
})

test('a failed acknowledgement stops draining so the notice stays retryable', async () => {
  const accepted = pendingTransfer('ACCEPTED')
  const server = api({ ...reads('MEMBER'), [`GET ${transferBase}/notices`]: () => response([accepted]),
    [`POST ${transferBase}/notices/${accepted.id}/acknowledge`]: () => response({}, 500) })
  show(owner)
  expect(await screen.findByText(/hat die Eigentümerschaft übernommen/)).toBeInTheDocument()
  await waitFor(() => expect(server.calls('POST', `${transferBase}/notices/${accepted.id}/acknowledge`)).toHaveLength(1))
  await act(async () => {})
  expect(server.calls('GET', `${transferBase}/notices`)).toHaveLength(1)
})

test('ADMIN can leave; the confirmed departure returns to Playgroups with the approved notice', async () => {
  api({ ...reads('ADMIN'), [`DELETE ${base}/membership`]: () => new Response(null, { status: 204 }) })
  const { notice } = show(admin)
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup verlassen' }))
  const dialog = screen.getByRole('dialog', { name: 'Playgroup verlassen?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gruppe verlassen' }))
  expect(await screen.findByText('Route /playgroups')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledWith({ kind: 'success', message: 'Du hast die Playgroup erfolgreich verlassen.' })
})

test('Deck erstellen opens the focused quick-profile deck editor; registered members are refused', async () => {
  api(reads('MEMBER'))
  const host = (memberId: string) => render(<AppThemeProvider><MemoryRouter initialEntries={[`/playgroups/${groupId}/members/${memberId}/decks/new`]}><Routes>
    <Route path="/playgroups/:groupId/members/:memberId/decks/new" element={<QuickProfileDeckPage onUnauthorized={vi.fn()} onNotice={vi.fn()} />} />
  </Routes></MemoryRouter></AppThemeProvider>)
  const view = host(quick.userId)
  expect(await screen.findByRole('heading', { name: 'Deck für Flinker Waschbär erstellen' })).toBeInTheDocument()
  view.unmount()
  host(frodo.userId)
  expect(await screen.findByText('Für dieses Mitglied kann hier kein Deck erstellt werden.')).toBeInTheDocument()
})

test('review: a failed status re-read keeps the confirmed pending offer and blocks a second offer until retried', async () => {
  const transfer = pendingTransfer()
  api({ ...reads('OWNER', roster, transfer),
    [`GET ${transferBase}`]: [() => response(transfer), () => response({}, 500), () => response(transfer)],
    [`DELETE ${transferBase}`]: () => response({}, 500) })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Anfrage zurückziehen' }))
  expect(await screen.findByText(/Die Anfrage konnte nicht zurückgezogen werden\. Der aktuelle Stand konnte nicht geladen werden/)).toBeInTheDocument()
  expect(screen.getByText('Eigentümerübertragung angefragt')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anfrage zurückziehen' })).toBeEnabled()
  expect(screen.getByText('Der Status der Eigentümerübertragung konnte nicht geprüft werden.')).toBeInTheDocument()
  expect(await openMenu('Saruman')).toEqual(['Zum Mitglied zurückstufen'])
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await waitFor(() => expect(screen.queryByText('Der Status der Eigentümerübertragung konnte nicht geprüft werden.')).not.toBeInTheDocument())
  expect(screen.getByText('Eigentümerübertragung angefragt')).toBeInTheDocument()
})

test('review: a late initial transfer read cannot overwrite a later confirmed offer', async () => {
  const transfer = pendingTransfer()
  let releaseInitial!: () => void
  const initial = new Promise<Response>(resolve => { releaseInitial = () => resolve(response({}, 404)) })
  api({ ...reads('OWNER'), [`GET ${transferBase}`]: [() => initial, () => response(transfer)],
    [`POST ${transferBase}`]: () => response(transfer, 201) })
  show()
  await openMenu('Saruman')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eigentümerschaft übertragen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Angebot senden' }))
  expect(await screen.findByText('Eigentümerübertragung angefragt')).toBeInTheDocument()
  await act(async () => releaseInitial())
  expect(screen.getByText('Eigentümerübertragung angefragt')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anfrage zurückziehen' })).toBeInTheDocument()
})

test('review: an ambiguous rename blocks retries until reconciliation confirms the current state', async () => {
  let releaseRead!: (value: Response) => void
  const heldRead = new Promise<Response>(resolve => { releaseRead = resolve })
  const server = api({ ...reads('MEMBER'),
    [`GET ${base}`]: [() => response(details('MEMBER')), () => heldRead, () => response(details('MEMBER'))],
    [`PATCH ${base}/quick-profiles/${quick.userId}`]: [() => Promise.reject(new Error('offline')), () => response({ ...quick, username: 'Lena' })] })
  show(frodo)
  await openMenu('Flinker Waschbär')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Schnellprofil umbenennen' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Profilname' }), { target: { value: 'Lena' } })
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
  // While the reconciliation read is pending, no second PATCH can be sent.
  await waitFor(() => expect(server.calls('GET', base)).toHaveLength(2))
  expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('textbox', { name: 'Profilname' }).closest('form')!)
  await act(async () => releaseRead(response({}, 503)))
  expect(await screen.findByText(/der aktuelle Stand konnte nicht geladen werden/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Profilname' })).toHaveValue('Lena')
  expect(server.calls('PATCH', `${base}/quick-profiles/${quick.userId}`)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Stand erneut prüfen' }))
  expect(await screen.findByText(/Die Umbenennung wurde nicht übernommen. Der aktuelle Name ist „Flinker Waschbär“/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
  await waitFor(() => expect(server.calls('PATCH', `${base}/quick-profiles/${quick.userId}`)).toHaveLength(2))
})

test('review: reconciliation treats an ambiguous rename that reached the server as confirmed', async () => {
  const renamed = { ...quick, username: 'Lena' }
  api({ ...reads('MEMBER'), [`GET ${base}`]: [() => response(details('MEMBER')), () => response(details('MEMBER', roster.map(m => m === quick ? renamed : m)))],
    [`PATCH ${base}/quick-profiles/${quick.userId}`]: () => response({}, 502) })
  show(frodo)
  await openMenu('Flinker Waschbär')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Schnellprofil umbenennen' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Profilname' }), { target: { value: 'Lena' } })
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await screen.findByText('Schnellprofil umbenannt in „Lena“.')).toBeInTheDocument()
})
