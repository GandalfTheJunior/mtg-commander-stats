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
