import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import GroupManager from './GroupManager'
import { renderApp } from './test/renderApp'

const id = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const group = { id, name: 'Friday Commander', role: 'ADMIN' }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const show = (onUnauthorized = vi.fn()) => renderApp(<Routes>
  <Route path="/playgroups" element={<GroupManager onUnauthorized={onUnauthorized} />} />
  <Route path="/playgroups/:groupId" element={<p>Overview route</p>} />
</Routes>, '/playgroups')
afterEach(() => vi.unstubAllGlobals())

test('ADMIN groups load strictly and open the canonical Overview URL', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response([group]))
  vi.stubGlobal('fetch', fetchMock)
  show()
  expect(await screen.findByText('Admin')).toBeInTheDocument()
  expect(screen.queryByLabelText('Einladungscode')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Friday Commander' }))
  expect(await screen.findByText('Overview route')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/groups', { credentials: 'same-origin', signal: expect.any(AbortSignal) })
})

test.each(['OWNER', 'ADMIN', 'MEMBER'])('accepts exact %s role in group summaries', async role => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{ ...group, role }])))
  show()
  expect(await screen.findByRole('button', { name: 'Friday Commander' })).toBeInTheDocument()
})

test.each(['ADMINISTRATOR', 'owner', '', null])('rejects malformed role %s with retry and no private card', async role => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([{ ...group, role }])))
  show()
  expect(await screen.findByText('Playgroups konnten nicht geladen werden. Nutze „Playgroups aktualisieren“, um es erneut zu versuchen.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Friday Commander' })).not.toBeInTheDocument()
})

test('duplicate names show distinguishing IDs while keeping distinct full route targets', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([group, { ...group, id: otherId }])))
  show()
  const cards = await screen.findAllByRole('button', { name: /Friday Commander/ })
  expect(cards).toHaveLength(2)
  expect(screen.getByText(/ID: 11111111/)).toBeInTheDocument()
  expect(screen.getByText(/ID: 22222222/)).toBeInTheDocument()
})

test('401 retires group data and invokes session recovery', async () => {
  const unauthorized = vi.fn()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)))
  show(unauthorized)
  await act(async () => {})
  expect(unauthorized).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Friday Commander' })).not.toBeInTheDocument()
})

test('transient list failure offers an explicit retry without treating it as empty', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response([group]))
  vi.stubGlobal('fetch', fetchMock)
  show()
  await screen.findByText('Playgroups konnten nicht geladen werden. Nutze „Playgroups aktualisieren“, um es erneut zu versuchen.')
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  expect(await screen.findByRole('button', { name: 'Friday Commander' })).toBeInTheDocument()
})

test('creating a Playgroup keeps the collection usable and sends only the chosen name', async () => {
  const created = { id: otherId, name: 'New group', role: 'OWNER' }
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/groups' && !init?.method) return Promise.resolve(response([group]))
    if (path === '/api/csrf') return Promise.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'test-token' }))
    if (path === '/api/groups' && init?.method === 'POST') return Promise.resolve(response(created, 201))
    throw new Error(`Unexpected ${init?.method ?? 'GET'} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.change(await screen.findByRole('textbox', { name: 'Gruppenname' }), { target: { value: created.name } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
  expect(await screen.findByRole('button', { name: created.name })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: group.name })).toBeInTheDocument()
  const write = fetchMock.mock.calls.find(([path, init]) => path === '/api/groups' && init?.method === 'POST')
  expect(JSON.parse(write![1]!.body as string)).toEqual({ name: created.name })
})
