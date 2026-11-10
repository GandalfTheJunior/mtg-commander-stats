import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Route, Routes, useLocation } from 'react-router'
import GroupPage from './GroupPage'
import { renderApp } from './test/renderApp'
import { groupUrl } from './groupNavigation'
import type { GroupTab } from './groupNavigation'
import { group, uid } from './test/gameFixtures'

const viewer = { id: uid(1), username: 'Owner' }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function show(path = groupUrl(group.id), unauthorized = vi.fn(), notice = vi.fn()) {
  const destination = (tab: GroupTab) => <GroupPage tab={tab} currentUser={viewer} onUnauthorized={unauthorized} onNotice={notice} />
  return renderApp(<Routes>
    <Route path="/playgroups/:groupId" element={destination('overview')} />
    <Route path="/playgroups/:groupId/games" element={destination('games')} />
    <Route path="/playgroups/:groupId/statistics" element={destination('statistics')} />
    <Route path="/playgroups/:groupId/members" element={destination('members')} />
    <Route path="/playgroups" element={<p>Playgroups collection</p>} />
    <Route path="*" element={<RouteLabel />} />
  </Routes>, path)
}
function RouteLabel() { const location = useLocation(); return <p>{location.pathname}</p> }
afterEach(() => vi.unstubAllGlobals())

test('direct Overview verifies the group before showing its name and four ordered tabs', async () => {
  let resolve!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
  show()
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
  await act(async () => resolve(response(group)))
  expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(within(screen.getByRole('tablist', { name: 'Playgroup-Bereiche' })).getAllByRole('tab').map(tab => tab.textContent))
    .toEqual(['Overview', 'Games', 'Statistics', 'Members'])
  expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('link', { name: 'Zurück zu Playgroups' })).toHaveAttribute('href', '/playgroups')
})

test('intentional tabs use canonical paths and the fixed collection back destination', async () => {
  vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path.endsWith('/games') ? response([]) : response(group))))
  show()
  fireEvent.click(await screen.findByRole('tab', { name: 'Games' }))
  expect(await screen.findByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('link', { name: 'Spiel erfassen' })).toHaveAttribute('href', `${groupUrl(group.id, 'games')}/new`)
  fireEvent.click(screen.getByRole('tab', { name: 'Members' }))
  expect(await screen.findByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('link', { name: 'Zurück zu Playgroups' })).toHaveAttribute('href', '/playgroups')
})

test('an ordinary member can load a roster containing an ADMIN without widening permissions', async () => {
  const detail = { ...group, role: 'MEMBER', members: [...group.members, { userId: uid(9), username: 'Admin player', role: 'ADMIN' }] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(detail)))
  show(groupUrl(group.id, 'members'))
  expect(await screen.findByText('Admin player')).toBeInTheDocument()
  expect(screen.getByText('Admin')).toBeInTheDocument()
  expect(screen.queryByText('Einladungscode verwalten')).not.toBeInTheDocument()
})

test.each(['ADMINISTRATOR', 'owner', null])('malformed roster role %s fails closed and offers retry', async role => {
  const detail = { ...group, members: [{ userId: uid(9), username: 'Invalid', role }] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(detail)))
  show(groupUrl(group.id, 'members'))
  expect(await screen.findByRole('button', { name: 'Gruppe erneut laden' })).toBeInTheDocument()
  expect(screen.queryByText('Invalid')).not.toBeInTheDocument()
})

test('confirmed 403 retires private data and returns to the collection with exact notice', async () => {
  const notice = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 403)))
  show(groupUrl(group.id, 'members'), vi.fn(), notice)
  expect(await screen.findByText('Playgroups collection')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledWith({ kind: 'error', message: 'Du hast keinen Zugriff mehr auf diese Playgroup.' })
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
})

test('401 uses session recovery while a transient failure permits retry', async () => {
  const unauthorized = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)))
  show(groupUrl(group.id, 'members'), unauthorized)
  await act(async () => {})
  expect(unauthorized).toHaveBeenCalledOnce()
})

test('a late successful response after leaving cannot restore a previous group', async () => {
  let resolve!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
  const view = show()
  view.unmount()
  await act(async () => resolve(response(group)))
  expect(screen.queryByText(group.name)).not.toBeInTheDocument()
})

test('network failure does not claim membership loss and an explicit retry can recover', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response(group))
  vi.stubGlobal('fetch', fetchMock)
  const notice = vi.fn()
  show(groupUrl(group.id, 'members'), vi.fn(), notice)
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppe erneut laden' }))
  expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
  expect(notice).not.toHaveBeenCalled()
})

test('an ordinary member can confirm departure and return to the collection', async () => {
  const memberGroup = { ...group, role: 'MEMBER', members: group.members.map(member =>
    member.userId === viewer.id ? { ...member, role: 'MEMBER' } : member) }
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/groups/${group.id}`) return Promise.resolve(response(memberGroup))
    if (path === '/api/csrf') return Promise.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'test-token' }))
    if (path === `/api/groups/${group.id}/membership` && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    throw new Error(`Unexpected ${init?.method ?? 'GET'} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const notice = vi.fn()
  show(groupUrl(group.id, 'members'), vi.fn(), notice)
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppe verlassen' }))
  expect(screen.getByRole('dialog', { name: 'Gruppe verlassen?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Verlassen bestätigen' }))
  expect(await screen.findByText('Playgroups collection')).toBeInTheDocument()
  expect(notice).toHaveBeenCalledWith({ kind: 'success', message: 'Du hast die Gruppe verlassen. Historische Spiele und Statistiken bleiben erhalten.' })
  expect(fetchMock.mock.calls.filter(([path, init]) => path === `/api/groups/${group.id}/membership` && init?.method === 'DELETE')).toHaveLength(1)
})

test.each(['network', 'malformed', 'wrong-id'])('details verification %s hides data until an explicit valid retry', async kind => {
  const fetchMock = vi.fn().mockImplementationOnce(() => kind === 'network' ? Promise.reject(new Error('offline')) : Promise.resolve(response(kind === 'malformed' ? { ...group, members: null } : { ...group, id: uid(99) })))
    .mockImplementation(() => Promise.resolve(response(group)))
  vi.stubGlobal('fetch', fetchMock)
  show(groupUrl(group.id.toUpperCase(), 'members'))
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppe erneut laden' }))
  expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
})

test.each([200, 401])('retired details status %s cannot affect the next route', async status => {
  const pending = await import('./test/gameFixtures').then(m => m.deferred())
  const fetchMock = vi.fn((_path: string, _init?: RequestInit) => { void _path; void _init; return pending.promise })
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' }))
  await screen.findByText('Playgroups collection')
  expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true)
  await act(async () => pending.resolve(response(group, status)))
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
})

function departure(status: number | 'network' | 'abort', csrfStatus = 200, committed = false) {
  let left = false
  const fetchMock = vi.fn((path: string, init?: RequestInit): Promise<Response> => {
    if (path === '/api/csrf') return Promise.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'test' }, csrfStatus))
    if (init?.method === 'DELETE') {
      left = committed
      if (typeof status === 'string') return Promise.reject(status === 'abort' ? new DOMException('Aborted', 'AbortError') : new Error('offline'))
      return Promise.resolve(response({}, status))
    }
    return Promise.resolve(response(left ? {} : { ...group, role: 'MEMBER' }, left ? 403 : 200))
  })
  vi.stubGlobal('fetch', fetchMock)
  const unauthorized = vi.fn(), notice = vi.fn()
  show(groupUrl(group.id, 'members'), unauthorized, notice)
  return { fetchMock, unauthorized, notice }
}
async function confirmDeparture() {
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppe verlassen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Verlassen bestätigen' }))
}
test.each([200, 400, 403, 500, 'network', 'abort'] as const)('unconfirmed departure %s revalidates without success or repeated DELETE', async status => {
  const { fetchMock, notice } = departure(status)
  await confirmDeparture()
  await screen.findByRole('button', { name: 'Gruppe verlassen' })
  expect(notice).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }))
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([path]) => path === `/api/groups/${group.id}`)).toHaveLength(2)
})
test('ambiguous committed departure retires content after fresh membership denial without claiming success', async () => {
  const { notice } = departure('network', 200, true)
  await confirmDeparture()
  await screen.findByText('Playgroups collection')
  expect(notice).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }))
})
test.each(['csrf', 'delete'])('departure %s 401 expires the current session', async stage => {
  const { unauthorized, fetchMock } = departure(401, stage === 'csrf' ? 401 : 200)
  await confirmDeparture()
  await act(async () => {})
  expect(unauthorized).toHaveBeenCalledOnce()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(stage === 'csrf' ? 0 : 1)
})
test.each(['cancel', 'escape'])('departure %s sends no DELETE', async how => {
  const { fetchMock } = departure(204)
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppe verlassen' }))
  const dialog = screen.getByRole('dialog')
  if (how === 'escape') fireEvent.keyDown(dialog, { key: 'Escape' })
  else fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
})

test.each([true, false])('mixed-case UUID accepts only the same response identity (same=%s)', async same => {
  const routeId = 'AaBbCcDd-1234-4aBc-8dEf-AbCdEf123456'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...group, id: same ? routeId.toLowerCase() : uid(99) })))
  show(groupUrl(routeId))
  if (same) expect(await screen.findByRole('heading', { name: group.name })).toBeInTheDocument()
  else {
    await screen.findByRole('button', { name: 'Gruppe erneut laden' })
    expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  }
})
