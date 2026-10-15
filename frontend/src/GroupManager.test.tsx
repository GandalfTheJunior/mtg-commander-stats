import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import GroupManager from './GroupManager'
import type { GroupSummary } from './api'

const owner: GroupSummary = { id: '11111111-1111-4111-8111-111111111111', name: 'Friday Commander', role: 'OWNER' }
const member: GroupSummary = { id: '22222222-2222-4222-8222-222222222222', name: 'Sunday Commander', role: 'MEMBER' }
const oldCode = 'abcdefghijklmnopqrstuv'
const newCode = 'ABCDEFGHIJKLMNOPQRSTUV'
const members = [
  { userId: '33333333-3333-4333-8333-333333333333', username: 'Gandalf', role: 'OWNER' },
  { userId: '44444444-4444-4444-8444-444444444444', username: 'Gandalf', role: 'MEMBER' },
]
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
function details() { return within(screen.getByRole('region', { name: 'Group details' })) }
async function open(group: GroupSummary) {
  fireEvent.click(await screen.findByRole('button', { name: `${group.name} (${group.role})` }))
  await screen.findByText(`Your role: ${group.role}`)
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
    credentials: 'same-origin', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'group-token' },
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

test('shows active members with stable UUIDs for duplicate names; MEMBER never requests codes; refresh and reopen reload members', async () => {
  const api = setup()
  api.next(`/api/groups/${member.id}`, () => json({ ...member, members }))
  api.next(`/api/groups/${member.id}`, () => json({ ...member, members: [members[0]] }))
  api.next(`/api/groups/${member.id}`, () => json({ ...member, members }))
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await open(member)
  expect(details().getAllByText('Gandalf')).toHaveLength(2)
  for (const person of members) expect(details().getByText(`User ID: ${person.userId}`)).toBeInTheDocument()
  expect(details().queryByRole('button', { name: /code/i })).not.toBeInTheDocument()
  fireEvent.click(details().getByRole('button', { name: 'Refresh members' }))
  await waitFor(() => expect(details().getAllByText('Gandalf')).toHaveLength(1))
  fireEvent.click(details().getByRole('button', { name: 'Close details' }))
  await open(member)
  expect(details().getAllByText('Gandalf')).toHaveLength(2)
  expect(api.fetchMock.mock.calls.some(([path]) => path.includes('/join-code'))).toBe(false)
})

test('OWNER retrieves/copies/regenerates code only after confirmation and cannot leave', async () => {
  const api = setup()
  api.next(`/api/groups/${owner.id}`, () => json({ ...owner, members }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json({ code: oldCode }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json({ code: newCode }), 'POST')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await open(owner)
  expect(details().getByText('As OWNER you cannot leave this group.')).toBeInTheDocument()
  expect(details().queryByRole('button', { name: 'Leave group' })).not.toBeInTheDocument()
  fireEvent.click(details().getByRole('button', { name: 'Show invitation code' }))
  expect(await screen.findByDisplayValue(oldCode)).toBeInTheDocument()
  expect(api.fetchMock).toHaveBeenCalledWith(`/api/groups/${owner.id}/join-code`, { credentials: 'same-origin', cache: 'no-store' })
  fireEvent.click(details().getByRole('button', { name: 'Copy code' }))
  await screen.findByText('Invitation code copied.')
  expect(writeText).toHaveBeenCalledWith(oldCode)
  fireEvent.click(details().getByRole('button', { name: 'Regenerate code' }))
  expect(details().getByText(/stop the old code from working immediately/)).toBeInTheDocument()
  fireEvent.click(details().getByRole('button', { name: 'Cancel' }))
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  fireEvent.click(details().getByRole('button', { name: 'Regenerate code' }))
  fireEvent.click(details().getByRole('button', { name: 'Confirm regeneration' }))
  await screen.findByText('Invitation code regenerated. The old code no longer works.')
  expect(screen.queryByDisplayValue(oldCode)).not.toBeInTheDocument()
  expect(screen.getByDisplayValue(newCode)).toBeInTheDocument()
  expect(api.fetchMock).toHaveBeenCalledWith(`/api/groups/${owner.id}/join-code`, {
    credentials: 'same-origin', method: 'POST', headers: { 'X-CSRF-TOKEN': 'group-token' },
  })
})

test('clipboard failure keeps a manually copyable code; failed regeneration makes no success claim', async () => {
  const api = setup()
  api.next(`/api/groups/${owner.id}`, () => json({ ...owner, members }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json({ code: oldCode }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json({}, 500), 'POST')
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await open(owner)
  fireEvent.click(details().getByRole('button', { name: 'Show invitation code' }))
  await screen.findByDisplayValue(oldCode)
  fireEvent.click(details().getByRole('button', { name: 'Copy code' }))
  await screen.findByText('Could not copy the code. Select and copy the visible code manually.')
  expect(screen.getByLabelText('Current invitation code')).toHaveValue(oldCode)
  fireEvent.click(details().getByRole('button', { name: 'Regenerate code' }))
  fireEvent.click(details().getByRole('button', { name: 'Confirm regeneration' }))
  await screen.findByText('Could not regenerate the invitation code.')
  expect(screen.getByDisplayValue(oldCode)).toBeInTheDocument()
  expect(screen.queryByText(/old code no longer works/)).not.toBeInTheDocument()
})

test('MEMBER cancels or confirms leaving, clears details and can rejoin without duplicates', async () => {
  const api = setup()
  api.next(`/api/groups/${member.id}`, () => json({ ...member, members }))
  api.next(`/api/groups/${member.id}/membership`, () => new Response(null, { status: 204 }), 'DELETE')
  api.next('/api/groups/join', () => json(member), 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await open(member)
  fireEvent.click(details().getByRole('button', { name: 'Leave group' }))
  expect(details().getByText(/historical games and statistics remain associated/)).toBeInTheDocument()
  expect(details().getByText(/Rejoining requires a current valid invitation code/)).toBeInTheDocument()
  fireEvent.click(details().getByRole('button', { name: 'Cancel' }))
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  fireEvent.click(details().getByRole('button', { name: 'Leave group' }))
  fireEvent.click(details().getByRole('button', { name: 'Confirm leave' }))
  await screen.findByText(/You left the group/)
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: `${member.name} (MEMBER)` })).not.toBeInTheDocument()
  expect(api.fetchMock).toHaveBeenCalledWith(`/api/groups/${member.id}/membership`, {
    credentials: 'same-origin', method: 'DELETE', headers: { 'X-CSRF-TOKEN': 'group-token' },
  })
  submitJoin()
  await screen.findByText(`${member.name} joined.`)
  expect(screen.getAllByRole('button', { name: `${member.name} (MEMBER)` })).toHaveLength(1)
})

test.each([403, 404])('clears inaccessible details/code and refreshes groups after %s', async (status) => {
  const api = setup()
  api.next(`/api/groups/${owner.id}`, () => json({ ...owner, members }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json({ code: oldCode }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json({}, status), 'POST')
  api.next('/api/groups', () => json([member]))
  const unauthorized = vi.fn()
  render(<GroupManager onUnauthorized={unauthorized} />)
  await open(owner)
  fireEvent.click(details().getByRole('button', { name: 'Show invitation code' }))
  await screen.findByDisplayValue(oldCode)
  fireEvent.click(details().getByRole('button', { name: 'Regenerate code' }))
  fireEvent.click(details().getByRole('button', { name: 'Confirm regeneration' }))
  await screen.findByText(/Group access is unavailable/)
  await screen.findByRole('button', { name: `${member.name} (MEMBER)` })
  expect(screen.queryByDisplayValue(oldCode)).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(unauthorized).not.toHaveBeenCalled()
})

test.each(['list', 'details', 'code', 'csrf', 'join'])('handles session expiration during %s', async (operation) => {
  const api = setup()
  const unauthorized = vi.fn()
  if (operation === 'list') {
    api.next('/api/groups', () => json({}, 401))
    render(<GroupManager onUnauthorized={unauthorized} />)
    await screen.findByRole('button', { name: 'Refresh groups' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  } else {
    api.next(`/api/groups/${owner.id}`, () => operation === 'details' ? json({}, 401) : json({ ...owner, members }))
    api.next(`/api/groups/${owner.id}/join-code`, () => json({}, 401))
    render(<GroupManager onUnauthorized={unauthorized} />)
    if (operation === 'csrf' || operation === 'join') {
      await screen.findByRole('button', { name: `${owner.name} (OWNER)` })
      if (operation === 'csrf') api.next('/api/csrf', () => json({}, 401))
      else api.next('/api/groups/join', () => json({}, 401), 'POST')
      submitJoin()
    } else {
      fireEvent.click(await screen.findByRole('button', { name: `${owner.name} (OWNER)` }))
      if (operation === 'code') {
        await screen.findByText('Your role: OWNER')
        fireEvent.click(details().getByRole('button', { name: 'Show invitation code' }))
      }
    }
  }
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1))
  expect(screen.queryByLabelText('Current invitation code')).not.toBeInTheDocument()
})

test('ignores late details from a previous selection and late mutations after an identity unmount', async () => {
  const api = setup()
  const lateDetails = deferred()
  const lateCreate = deferred()
  api.next(`/api/groups/${owner.id}`, () => lateDetails.promise)
  api.next(`/api/groups/${member.id}`, () => json({ ...member, members }))
  api.next('/api/groups', () => lateCreate.promise, 'POST')
  const unauthorized = vi.fn()
  const view = render(<GroupManager onUnauthorized={unauthorized} />)
  fireEvent.click(await screen.findByRole('button', { name: `${owner.name} (OWNER)` }))
  await screen.findByText('Loading group details…')
  await open(member)
  await act(async () => { lateDetails.resolve(json({ ...owner, members })) })
  expect(details().getByText('Your role: MEMBER')).toBeInTheDocument()
  expect(details().queryByText('Your role: OWNER')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Late group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
  view.unmount()
  await act(async () => { lateCreate.resolve(json({}, 401)) })
  expect(unauthorized).not.toHaveBeenCalled()
})

test.each([
  ['list', { groups: [] }],
  ['details', { ...owner, members: [{ ...members[0], role: 'ADMIN' }] }],
  ['code', { code: 'invalid' }],
] as const)('rejects malformed %s responses', async (operation, body) => {
  const api = setup()
  if (operation === 'list') api.next('/api/groups', () => json(body))
  api.next(`/api/groups/${owner.id}`, () => json(operation === 'details' ? body : { ...owner, members }))
  api.next(`/api/groups/${owner.id}/join-code`, () => json(body))
  render(<GroupManager onUnauthorized={vi.fn()} />)
  if (operation === 'list') {
    await screen.findByRole('button', { name: `${owner.name} (OWNER)` })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh groups' }))
  } else if (operation === 'details') {
    fireEvent.click(await screen.findByRole('button', { name: `${owner.name} (OWNER)` }))
  } else {
    await open(owner)
    fireEvent.click(details().getByRole('button', { name: 'Show invitation code' }))
  }
  await screen.findByText(/server returned an invalid/)
  expect(screen.queryByLabelText('Current invitation code')).not.toBeInTheDocument()
})

test.each([400, 500, 200])('failed leave (%s) retains membership and allows retry without a success claim', async (status) => {
  const api = setup()
  api.next(`/api/groups/${member.id}`, () => json({ ...member, members }))
  api.next(`/api/groups/${member.id}/membership`, () => json({}, status), 'DELETE')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await open(member)
  fireEvent.click(details().getByRole('button', { name: 'Leave group' }))
  fireEvent.click(details().getByRole('button', { name: 'Confirm leave' }))
  await waitFor(() => expect(details().getByRole('status')).toHaveClass('error'))
  expect(screen.getByRole('button', { name: `${member.name} (MEMBER)` })).toBeInTheDocument()
  expect(details().getByText('Your role: MEMBER')).toBeInTheDocument()
  expect(screen.queryByText(/You left the group/)).not.toBeInTheDocument()
})

test('CSRF denial is an error, keeps authentication and does not submit the join', async () => {
  const api = setup([])
  api.next('/api/csrf', () => json({ detail: 'CSRF access denied. Please try again.' }, 403))
  const unauthorized = vi.fn()
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('You have no groups yet.')
  submitJoin()
  await screen.findByText('CSRF access denied. Please try again.')
  expect(api.fetchMock.mock.calls.some(([path]) => path === '/api/groups/join')).toBe(false)
  expect(unauthorized).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Join group' })).toBeEnabled()
})

test('failed details can be retried and do not expose code controls', async () => {
  const api = setup()
  api.next(`/api/groups/${owner.id}`, () => { throw new Error('Details offline') })
  api.next(`/api/groups/${owner.id}`, () => json({ ...owner, members }))
  render(<GroupManager onUnauthorized={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: `${owner.name} (OWNER)` }))
  await screen.findByText('Details offline')
  expect(screen.queryByRole('button', { name: 'Show invitation code' })).not.toBeInTheDocument()
  fireEvent.click(details().getByRole('button', { name: 'Refresh members' }))
  await screen.findByText('Your role: OWNER')
  expect(screen.queryByText('Details offline')).not.toBeInTheDocument()
})
