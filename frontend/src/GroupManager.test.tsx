import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import GroupManager from './GroupManager'
import { renderApp as render } from './test/renderApp'
import type { GroupSummary } from './api'

const owner: GroupSummary = { id: '11111111-1111-4111-8111-111111111111', name: 'Friday Commander', role: 'OWNER' }
const member: GroupSummary = { id: '22222222-2222-4222-8222-222222222222', name: 'Sunday Commander', role: 'MEMBER' }
const oldCode = 'abcdefghijklmnopqrstuv'
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function deferred() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}

type Reply = () => Response | Promise<Response>
function setup(groups: GroupSummary[] = [owner, member]) {
  const routes = new Map<string, Reply[]>()
  function next(path: string, reply: Reply, method = 'GET') {
    const key = `${method} ${path}`
    routes.set(key, [...(routes.get(key) ?? []), reply])
  }
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const reply = routes.get(`${init?.method ?? 'GET'} ${path}`)?.shift()
    if (reply) return Promise.resolve().then(reply)
    if (path === '/api/csrf') return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'group-token' }))
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  next('/api/groups', () => json(groups))
  return { next, fetchMock }
}
function submitJoin(code = oldCode) {
  fireEvent.change(screen.getByLabelText('Invitation code'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Join group' }))
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('lists groups with roles after loading; refreshes empty and retryable failed lists', async () => {
  const api = setup([])
  const onUnauthorized = vi.fn()
  render(<GroupManager onUnauthorized={onUnauthorized} />)
  expect(screen.getByText('Loading your groups…')).toBeInTheDocument()
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument()
  await screen.findByText('You have no groups yet.')
  api.next('/api/groups', () => { throw new Error('Network unavailable') })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  await screen.findByText('Network unavailable')
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument()
  api.next('/api/groups', () => json([owner, member]))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  expect(await screen.findByRole('button', { name: `${owner.name} (OWNER)` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: `${member.name} (MEMBER)` })).toBeInTheDocument()
  expect(onUnauthorized).not.toHaveBeenCalled()
})

test('creates with CSRF and the original name; joins idempotently using server summaries', async () => {
  const api = setup([])
  api.next('/api/groups', () => json(owner, 201), 'POST')
  api.next('/api/groups/join', () => json(member), 'POST')
  api.next('/api/groups/join', () => json(member), 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByText('You have no groups yet.')
  expect(screen.getByLabelText('Group name')).toBeRequired()
  expect(screen.getByLabelText('Invitation code')).toBeRequired()
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: '  Friday Commander  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
  await screen.findByText(`${owner.name} created.`)
  expect(api.fetchMock).toHaveBeenCalledWith('/api/groups', {
    credentials: 'same-origin', signal: expect.any(AbortSignal), method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'group-token' },
    body: JSON.stringify({ name: '  Friday Commander  ' }),
  })
  submitJoin()
  await screen.findByText(`${member.name} joined.`)
  submitJoin()
  await waitFor(() => expect(api.fetchMock.mock.calls.filter(([path]) => path === '/api/groups/join')).toHaveLength(2))
  expect(screen.getAllByRole('button', { name: `${member.name} (MEMBER)` })).toHaveLength(1)
  expect(api.fetchMock).toHaveBeenCalledWith('/api/groups/join', expect.objectContaining({ body: JSON.stringify({ code: oldCode }) }))
})

test.each([
  ['validation', () => json({ detail: 'Group name must not be blank.' }, 400)],
  ['forbidden', () => json({}, 403)],
  ['network', () => { throw new Error('Offline') }],
  ['malformed', () => json({ id: owner.id, name: owner.name, role: 'ADMIN' }, 201)],
  ['invalid JSON', () => new Response('not json', { status: 201 })],
] as const)('does not claim creation success after %s failure', async (_name, reply) => {
  const api = setup([])
  api.next('/api/groups', reply, 'POST')
  const unauthorized = vi.fn()
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('You have no groups yet.')
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: '   ' } })
  fireEvent.submit(screen.getByLabelText('Group name').closest('form')!)
  await waitFor(() => expect(screen.getByRole('status')).toHaveClass('error'))
  expect(screen.getByText('You have no groups yet.')).toBeInTheDocument()
  expect(screen.queryByText(/created\.$/)).not.toBeInTheDocument()
  expect(unauthorized).not.toHaveBeenCalled()
})

test('invalid/obsolete join codes show a controlled error and never add a group', async () => {
  const api = setup([])
  api.next('/api/groups/join', () => json({}, 400), 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByText('You have no groups yet.')
  submitJoin('obsolete')
  expect(await screen.findByText('Could not join. Check that the invitation code is current and valid.')).toBeInTheDocument()
  expect(screen.getByText('You have no groups yet.')).toBeInTheDocument()
})

test('pending mutations disable conflicting actions and prevent duplicate submissions', async () => {
  const api = setup([])
  const pending = deferred()
  api.next('/api/groups', () => pending.promise, 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByText('You have no groups yet.')
  const form = screen.getByLabelText('Group name').closest('form')!
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: owner.name } })
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(screen.getByRole('button', { name: 'Join group' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Refresh groups' })).toBeDisabled()
  await act(async () => { pending.resolve(json(owner, 201)) })
  await screen.findByText(`${owner.name} created.`)
  expect(api.fetchMock.mock.calls.filter(([path, init]) => path === '/api/groups' && init?.method === 'POST')).toHaveLength(1)
})


test.each(['list', 'csrf', 'create', 'join'])('current %s 401 expires the session without reporting a group write', async operation => {
  const api = setup([]), unauthorized = vi.fn()
  if (operation === 'list') api.next('/api/groups', () => json({}, 401))
  const view = render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('You have no groups yet.')
  if (operation === 'list') fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  else {
    if (operation === 'csrf') api.next('/api/csrf', () => json({}, 401))
    else api.next(operation === 'join' ? '/api/groups/join' : '/api/groups', () => json({}, 401), 'POST')
    if (operation === 'join') submitJoin()
    else {
      fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'New group' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
    }
  }
  await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce())
  expect(screen.queryByText(/created\.$|joined\.$/)).not.toBeInTheDocument()
  view.unmount()
})

test('invalid lists show retryable failure and retired creates cannot mutate or expire the next lifetime', async () => {
  const api = setup(), late = deferred(), unauthorized = vi.fn()
  const view = render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByRole('button', { name: `${owner.name} (OWNER)` })
  api.next('/api/groups', () => json({ groups: [] }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  await screen.findByText('The server returned an invalid group list.')
  api.next('/api/groups', () => json([]))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  await screen.findByText('You have no groups yet.')
  api.next('/api/groups', () => late.promise, 'POST')
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Late group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
  await waitFor(() => expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
  view.unmount()
  await act(async () => late.resolve(json({}, 401)))
  expect(unauthorized).not.toHaveBeenCalled()
})

test('CSRF 403 preserves authentication and sends no creation request', async () => {
  const api = setup([]), unauthorized = vi.fn()
  api.next('/api/csrf', () => json({}, 403))
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('You have no groups yet.')
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Denied' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveClass('error'))
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  expect(unauthorized).not.toHaveBeenCalled()
})
