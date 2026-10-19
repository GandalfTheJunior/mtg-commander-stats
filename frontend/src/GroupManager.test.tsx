import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import GroupManager from './GroupManager'
import { renderApp as render } from './test/renderApp'
import type { GroupSummary } from './api'
import { Route, Routes } from 'react-router'

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
  fireEvent.change(screen.getByLabelText('Einladungscode'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe beitreten' }))
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('lists groups with roles after loading; refreshes empty and retryable failed lists', async () => {
  const api = setup([])
  const onUnauthorized = vi.fn()
  render(<GroupManager onUnauthorized={onUnauthorized} />)
  expect(screen.getByText('Playgroups werden geladen…')).toBeInTheDocument()
  expect(screen.queryByLabelText('Gruppenname')).not.toBeInTheDocument()
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  api.next('/api/groups', () => { throw new Error('Network unavailable') })
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  await screen.findByText('Network unavailable')
  expect(screen.queryByLabelText('Gruppenname')).not.toBeInTheDocument()
  api.next('/api/groups', () => json([owner, member]))
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  expect(await screen.findByRole('button', { name: `${owner.name}` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: `${member.name}` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: owner.name })).toHaveAccessibleDescription('Gruppenersteller')
  expect(screen.getByRole('button', { name: member.name })).toHaveAccessibleDescription('Mitglied')
  expect(onUnauthorized).not.toHaveBeenCalled()
})

test('creates with CSRF and the original name; joins idempotently using server summaries', async () => {
  const api = setup([])
  api.next('/api/groups', () => json(owner, 201), 'POST')
  api.next('/api/groups/join', () => json(member), 'POST')
  api.next('/api/groups/join', () => json(member), 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  expect(screen.getByLabelText('Gruppenname')).toBeRequired()
  expect(screen.getByLabelText('Einladungscode')).toBeRequired()
  expect(screen.getByRole('form', { name: 'Gruppe erstellen' })).toBeInTheDocument()
  expect(screen.getByRole('form', { name: 'Gruppe beitreten' })).toBeInTheDocument()
  expect(screen.getByLabelText('Gruppenname')).toHaveAttribute('name', 'name')
  expect(screen.getByLabelText('Einladungscode')).toHaveAttribute('name', 'code')
  expect(screen.getByLabelText('Gruppenname').id).not.toBe(screen.getByLabelText('Einladungscode').id)
  expect(screen.getByLabelText('Einladungscode')).toHaveAttribute('autocomplete', 'off')
  expect(screen.getByLabelText('Einladungscode')).toHaveAttribute('spellcheck', 'false')
  // Required validation is native; neither form imposes a client length rule.
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
  expect(screen.getByRole('form', { name: 'Gruppe erstellen' })).toBeInvalid()
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  expect(screen.getByLabelText('Gruppenname')).not.toHaveAttribute('maxlength')
  fireEvent.change(screen.getByLabelText('Einladungscode'), { target: { value: oldCode } })
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: '  Friday Commander  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
  await screen.findByText(`${owner.name} wurde erstellt.`)
  expect(screen.getByLabelText('Gruppenname')).toHaveValue('')
  expect(screen.getByLabelText('Einladungscode')).toHaveValue(oldCode)
  expect(api.fetchMock).toHaveBeenCalledWith('/api/groups', {
    credentials: 'same-origin', signal: expect.any(AbortSignal), method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'group-token' },
    body: JSON.stringify({ name: '  Friday Commander  ' }),
  })
  submitJoin()
  await screen.findByText(`${member.name}: Beitritt bestätigt.`)
  expect(screen.getByLabelText('Einladungscode')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'Keep my draft' } })
  submitJoin()
  await waitFor(() => expect(api.fetchMock.mock.calls.filter(([path]) => path === '/api/groups/join')).toHaveLength(2))
  expect(screen.getAllByRole('button', { name: `${member.name}` })).toHaveLength(1)
  expect(api.fetchMock).toHaveBeenCalledWith('/api/groups/join', expect.objectContaining({ body: JSON.stringify({ code: oldCode }) }))
  expect(screen.getByLabelText('Gruppenname')).toHaveValue('Keep my draft')
})

test.each([
  ['validation', () => json({ detail: 'Gruppenname must not be blank.' }, 400)],
  ['forbidden', () => json({}, 403)],
  ['network', () => { throw new Error('Offline') }],
  ['malformed', () => json({ id: owner.id, name: owner.name, role: 'ADMIN' }, 201)],
  ['invalid JSON', () => new Response('not json', { status: 201 })],
] as const)('does not claim creation success after %s failure', async (_name, reply) => {
  const api = setup([])
  api.next('/api/groups', reply, 'POST')
  const unauthorized = vi.fn()
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: '   ' } })
  fireEvent.submit(screen.getByLabelText('Gruppenname').closest('form')!)
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(screen.getByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')).toBeInTheDocument()
  expect(screen.queryByText(/wurde erstellt\.$/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Gruppenname')).toHaveValue('   ')
  expect(screen.getByRole('button', { name: 'Playgroups aktualisieren' })).toBeEnabled()
  expect(unauthorized).not.toHaveBeenCalled()
})

test('invalid/obsolete join codes show a controlled error and never add a group', async () => {
  const api = setup([])
  api.next('/api/groups/join', () => json({}, 400), 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  submitJoin('obsolete')
  expect(await screen.findByRole('alert')).toHaveTextContent('Beitritt nicht bestätigt. Prüfe, ob der Einladungscode aktuell und gültig ist.')
  expect(screen.getByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')).toBeInTheDocument()
  expect(screen.getByLabelText('Einladungscode')).toHaveValue('obsolete')
})

test('pending mutations disable conflicting actions and prevent duplicate submissions', async () => {
  const api = setup([])
  const pending = deferred()
  api.next('/api/groups', () => pending.promise, 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  const form = screen.getByLabelText('Gruppenname').closest('form')!
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: owner.name } })
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(screen.getByRole('button', { name: 'Gruppe beitreten' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Playgroups aktualisieren' })).toBeDisabled()
  await act(async () => { pending.resolve(json(owner, 201)) })
  await screen.findByText(`${owner.name} wurde erstellt.`)
  expect(api.fetchMock.mock.calls.filter(([path, init]) => path === '/api/groups' && init?.method === 'POST')).toHaveLength(1)
})


test.each(['list', 'csrf', 'create', 'join'])('current %s 401 expires the session without reporting a group write', async operation => {
  const api = setup([]), unauthorized = vi.fn()
  if (operation === 'list') api.next('/api/groups', () => json({}, 401))
  const view = render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  if (operation === 'list') fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  else {
    if (operation === 'csrf') api.next('/api/csrf', () => json({}, 401))
    else api.next(operation === 'join' ? '/api/groups/join' : '/api/groups', () => json({}, 401), 'POST')
    if (operation === 'join') submitJoin()
    else {
      fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'New group' } })
      fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
    }
  }
  await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce())
  expect(screen.queryByText(/wurde erstellt\.$|Beitritt bestätigt\.$/)).not.toBeInTheDocument()
  view.unmount()
})

test('invalid lists show retryable failure and retired creates cannot mutate or expire the next lifetime', async () => {
  const api = setup(), late = deferred(), unauthorized = vi.fn()
  const view = render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByRole('button', { name: `${owner.name}` })
  api.next('/api/groups', () => json({ groups: [] }))
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  await screen.findByText('The server returned an invalid group list.')
  api.next('/api/groups', () => json([]))
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  api.next('/api/groups', () => late.promise, 'POST')
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'Late group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
  await waitFor(() => expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
  view.unmount()
  await act(async () => late.resolve(json({}, 401)))
  expect(unauthorized).not.toHaveBeenCalled()
})

test('CSRF 403 preserves authentication and sends no creation request', async () => {
  const api = setup([]), unauthorized = vi.fn()
  api.next('/api/csrf', () => json({}, 403))
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByText('Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.')
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'Denied' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  expect(unauthorized).not.toHaveBeenCalled()
})

test('shows all groups in API order, deduplicates IDs, and distinguishes only identical names with uniform stable prefixes', async () => {
  const peers: GroupSummary[] = [
    { ...member, id: 'abcdefff-2222-4222-8222-222222222222', name: 'Namesakes' },
    { ...owner, id: 'abcdefff-1111-4111-8111-111111111111', name: 'Namesakes' },
    { ...member, id: '12345678-3333-4333-8333-333333333333', name: 'Namesakes' },
  ]
  const long = { ...member, name: 'Commander'.repeat(35) }
  const similar = { ...owner, id: '44444444-4444-4444-8444-444444444444', name: 'namesakes' }
  const input = [peers[0], long, peers[2], similar, peers[1], long]
  const api = setup(input)
  render(<GroupManager onUnauthorized={vi.fn()} />)
  const list = await screen.findByRole('list', { name: 'Deine Playgroups' })
  const buttons = within(list).getAllByRole('button')
  expect(buttons).toHaveLength(5)
  expect(buttons.map(button => button.textContent)).toEqual([
    'Namesakes · ID: abcdefff2Mitglied', `${long.name}Mitglied`,
    'Namesakes · ID: 123456783Mitglied', 'namesakesGruppenersteller',
    'Namesakes · ID: abcdefff1Gruppenersteller',
  ])
  expect(buttons[0]).toHaveAccessibleName('Namesakes · ID: abcdefff2')
  expect(buttons[4]).toHaveAccessibleName('Namesakes · ID: abcdefff1')
  expect(buttons[1]).toHaveAccessibleName(long.name)
  expect(buttons[3]).toHaveAccessibleName('namesakes')
  expect(api.fetchMock).toHaveBeenCalledTimes(1) // No decorating group-details/code requests.
  api.next('/api/groups', () => json([...input].reverse()))
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  expect(await screen.findByRole('button', { name: 'Namesakes · ID: abcdefff2' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Namesakes · ID: abcdefff1' })).toBeInTheDocument()
})

test('cards are focusable buttons opening the full group ID directly', async () => {
  const api = setup()
  render(<Routes>
    <Route path="/playgroups" element={<GroupManager onUnauthorized={vi.fn()} />} />
    <Route path="/playgroups/:groupId" element={<p>Group route</p>} />
  </Routes>, '/playgroups')
  const card = await screen.findByRole('button', { name: member.name })
  card.focus()
  expect(card).toHaveFocus()
  expect(card.tagName).toBe('BUTTON')
  fireEvent.click(card)
  await screen.findByText('Group route')
  expect(screen.queryByRole('heading', { name: 'Playgroups' })).not.toBeInTheDocument()
  expect(api.fetchMock).toHaveBeenCalledTimes(1)
})

test('join/rejoin uses the acknowledged role and replace/append order until explicit server refresh', async () => {
  const api = setup([owner, member])
  const acknowledged = { ...owner, name: 'Current server name', role: 'MEMBER' }
  api.next('/api/groups/join', () => json(acknowledged), 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByRole('button', { name: owner.name })
  submitJoin('  exact-code  ')
  expect(await screen.findByRole('button', { name: acknowledged.name })).toHaveAccessibleDescription('Mitglied')
  expect(within(screen.getByRole('list')).getAllByRole('button').map(button => button.getAttribute('aria-labelledby')))
    .toEqual([`playgroup-name-${member.id}`, `playgroup-name-${owner.id}`])
  expect(screen.queryByRole('button', { name: owner.name })).not.toBeInTheDocument()
  expect(api.fetchMock).toHaveBeenCalledWith('/api/groups/join', expect.objectContaining({ body: JSON.stringify({ code: '  exact-code  ' }) }))
  api.next('/api/groups', () => json([acknowledged, member]))
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  await screen.findByRole('button', { name: acknowledged.name })
  expect(within(screen.getByRole('list')).getAllByRole('button')[0]).toHaveAccessibleName(acknowledged.name)
})

test.each(['create', 'join'] as const)('%s synchronously blocks conflicting writes and refresh through CSRF and the POST', async operation => {
  const api = setup(), csrf = deferred(), write = deferred()
  api.next('/api/csrf', () => csrf.promise)
  api.next(operation === 'create' ? '/api/groups' : '/api/groups/join', () => write.promise, 'POST')
  render(<GroupManager onUnauthorized={vi.fn()} />)
  await screen.findByRole('button', { name: owner.name })
  const create = screen.getByRole('form', { name: 'Gruppe erstellen' })
  const join = screen.getByRole('form', { name: 'Gruppe beitreten' })
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'Draft' } })
  fireEvent.change(screen.getByLabelText('Einladungscode'), { target: { value: oldCode } })
  act(() => {
    fireEvent.submit(operation === 'create' ? create : join)
    fireEvent.submit(create)
    fireEvent.submit(join)
    fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  })
  expect(screen.getByRole('button', { name: owner.name })).toBeDisabled()
  expect(screen.getByLabelText('Gruppenname')).toBeDisabled()
  expect(screen.getByLabelText('Einladungscode')).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(operation === 'create' ? 'Gruppe wird erstellt…' : 'Beitritt wird bestätigt…')
  expect(api.fetchMock.mock.calls.filter(([path]) => path === '/api/groups')).toHaveLength(1)
  await act(async () => csrf.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'confirmed' })))
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  await act(async () => write.resolve(json(owner, operation === 'create' ? 201 : 200)))
  expect(await screen.findByRole('status')).toHaveTextContent(operation === 'create' ? 'wurde erstellt.' : 'Beitritt bestätigt.')
})

test.each([
  ['forbidden', () => json({ detail: `Rejected ${oldCode}` }, 403)],
  ['malformed', () => json({ ...member, role: 'ADMIN' })],
  ['wrong acknowledgment status', () => json(member, 201)],
  ['network', () => { throw new Error(`Lost reply ${oldCode}`) }],
] as const)('join %s keeps the code private, retains drafts, and recovers only by an explicit read', async (_name, reply) => {
  const api = setup([]), unauthorized = vi.fn()
  api.next('/api/groups/join', reply, 'POST')
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByRole('form', { name: 'Gruppe erstellen' })
  fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'Other draft' } })
  submitJoin()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Playgroups aktualisieren')
  expect(alert).not.toHaveTextContent(oldCode)
  expect(screen.getByLabelText('Einladungscode')).toHaveValue(oldCode)
  expect(screen.getByLabelText('Gruppenname')).toHaveValue('Other draft')
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(unauthorized).not.toHaveBeenCalled()
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  api.next('/api/groups', () => json([member]))
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  expect(await screen.findByRole('button', { name: member.name })).toBeInTheDocument()
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test.each((['list', 'create', 'join'] as const).flatMap(operation => [200, 401].map(status => ({ operation, status }))))(
  'unmount aborts $operation and ignores a retired $status in a replacement view', async ({ operation, status }) => {
  const api = setup([]), late = deferred(), unauthorized = vi.fn()
  const view = render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByRole('form', { name: 'Gruppe erstellen' })
  api.next(operation === 'join' ? '/api/groups/join' : '/api/groups', () => late.promise, operation === 'list' ? 'GET' : 'POST')
  if (operation === 'list') fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  else if (operation === 'join') submitJoin()
  else {
    fireEvent.change(screen.getByLabelText('Gruppenname'), { target: { value: 'Retired' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Gruppe erstellen' }))
  }
  await waitFor(() => expect(api.fetchMock.mock.calls.filter(([path, init]) =>
    path === (operation === 'join' ? '/api/groups/join' : '/api/groups') && (init?.method ?? 'GET') === (operation === 'list' ? 'GET' : 'POST'))).toHaveLength(operation === 'list' ? 2 : 1))
  const signal = api.fetchMock.mock.calls.at(-1)![1]!.signal!
  view.unmount()
  expect(signal.aborted).toBe(true)
  api.next('/api/groups', () => json([member]))
  render(<GroupManager onUnauthorized={unauthorized} />)
  await screen.findByRole('button', { name: member.name })
  const retired = operation === 'list' ? [owner] : owner
  await act(async () => late.resolve(json(retired, status === 401 ? 401 : operation === 'create' ? 201 : 200)))
  expect(unauthorized).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: member.name })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
