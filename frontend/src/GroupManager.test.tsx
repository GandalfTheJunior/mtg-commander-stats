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
  expect(await screen.findByRole('button', { name: group.name })).toBeInTheDocument()
  expect(screen.queryByText('Admin')).not.toBeInTheDocument()
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
  expect(screen.getByRole('button', { name: 'Friday Commander ID: 11111111' })).toHaveAccessibleDescription(`Übersicht, ${id}`)
  expect(screen.getByRole('button', { name: 'Friday Commander ID: 22222222' })).toHaveAccessibleDescription(`Übersicht, ${otherId}`)
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

test('creating a Playgroup sends only the chosen name and opens its Overview', async () => {
  const created = { id: otherId, name: 'New group', role: 'OWNER' }
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/groups' && !init?.method) return Promise.resolve(response([group]))
    if (path === '/api/csrf') return Promise.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'test-token' }))
    if (path === '/api/groups' && init?.method === 'POST') return Promise.resolve(response(created, 201))
    throw new Error(`Unexpected ${init?.method ?? 'GET'} ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup erstellen' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name der Playgroup' }), { target: { value: created.name } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  expect(await screen.findByText('Overview route')).toBeInTheDocument()
  const write = fetchMock.mock.calls.find(([path, init]) => path === '/api/groups' && init?.method === 'POST')
  expect(JSON.parse(write![1]!.body as string)).toEqual({ name: created.name })
})

test.each([200, 401])('retired create status %s cannot restore content or expire a later route', async status => {
  let resolve!: (reply: Response) => void
  const pending = new Promise<Response>(done => { resolve = done })
  const fetchMock = vi.fn((path: string, init?: RequestInit) => Promise.resolve(path === '/api/csrf' ? response({ headerName: 'X-CSRF-TOKEN', token: 'test' }) : init?.method === 'POST' ? pending : response([group])))
  vi.stubGlobal('fetch', fetchMock)
  const unauthorized = vi.fn(), view = show(unauthorized)
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup erstellen' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name der Playgroup' }), { target: { value: 'Pending group' } })
  const submit = screen.getByRole('button', { name: 'Erstellen' })
  fireEvent.click(submit); fireEvent.click(submit)
  await act(async () => {})
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  expect(submit).toBeDisabled()
  view.unmount()
  await act(async () => resolve(response({ ...group, name: 'Pending group' }, status)))
  expect(unauthorized).not.toHaveBeenCalled()
  expect(screen.queryByText('Pending group')).not.toBeInTheDocument()
})
test('CSRF 403 preserves authentication and the create draft without sending POST', async () => {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => { void init; return Promise.resolve(path === '/api/csrf' ? response({}, 403) : response([group])) })
  vi.stubGlobal('fetch', fetchMock)
  const unauthorized = vi.fn(); show(unauthorized)
  fireEvent.click(await screen.findByRole('button', { name: 'Playgroup erstellen' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name der Playgroup' }), { target: { value: 'Draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('textbox', { name: 'Name der Playgroup' })).toHaveValue('Draft')
  expect(unauthorized).not.toHaveBeenCalled()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

test.each(['Commander™', 'Friday | Night'])('invalid name %s receives actionable allowlist guidance and preserves the draft', async name => {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => Promise.resolve(
    path === '/api/csrf' ? response({ headerName: 'X-CSRF-TOKEN', token: 'test' })
      : init?.method === 'POST' ? response({}, 400) : response([group])))
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Playgroup erstellen' }))
  const input = await screen.findByRole('textbox', { name: 'Name der Playgroup' })
  fireEvent.change(input, { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Erlaubt sind Buchstaben, Ziffern 0–9, Satzzeichen, Währungssymbole, + = < > und einzelne Leerzeichen zwischen Wörtern.')
  expect(screen.getByRole('alert')).toHaveTextContent('höchstens 30 Zeichen und keine Emojis')
  expect(input).toHaveValue(name)
  expect(screen.getByRole('button', { name: 'Erstellen' })).toBeEnabled()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test.each(['cancel', 'escape'])('closing an uncertain creation with %s reconciles the list without another write', async dismissal => {
  let reads = 0
  const created = { ...group, id: otherId, name: 'Possibly created' }
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/csrf') return Promise.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'test' }))
    if (init?.method === 'POST') return Promise.resolve(response({}, 500))
    return Promise.resolve(response(++reads === 1 ? [group] : [group, created]))
  })
  vi.stubGlobal('fetch', fetchMock)
  show()
  await screen.findByRole('button', { name: group.name })
  fireEvent.click(screen.getByRole('button', { name: 'Playgroup erstellen' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name der Playgroup' }), { target: { value: created.name } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Die Erstellung konnte nicht bestätigt werden.')
  expect(screen.queryByText('Overview route')).not.toBeInTheDocument()
  if (dismissal === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  else fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(await screen.findByRole('button', { name: created.name })).toBeInTheDocument()
  expect(reads).toBe(2)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  expect(screen.queryByText('Overview route')).not.toBeInTheDocument()
})

test.each([{}, [null], [{ ...group, id: 'not-an-id' }]])('invalid list %j stays retryable without exposing a card', async body => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(body)).mockImplementation(() => Promise.resolve(response([group]))))
  show()
  await screen.findByRole('alert')
  expect(screen.queryByRole('button', { name: group.name })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Playgroups aktualisieren' }))
  expect(await screen.findByRole('button', { name: group.name })).toBeInTheDocument()
})

test('cancellation has no write side effects and reopening starts with a clean draft', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response([])))
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Playgroup erstellen' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveAccessibleName('Playgroup erstellen')
  fireEvent.change(screen.getByRole('textbox', { name: 'Name der Playgroup' }), { target: { value: 'Discard me' } })
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  await screen.findByRole('button', { name: 'Playgroup erstellen' })
  fireEvent.click(screen.getByRole('button', { name: 'Playgroup erstellen' }))
  expect(await screen.findByRole('textbox', { name: 'Name der Playgroup' })).toHaveValue('')
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true)
})

test('blank Unicode names are rejected locally and a failed write preserves the draft for retry', async () => {
  let attempts = 0
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/csrf') return Promise.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'test' }))
    if (init?.method === 'POST') return Promise.resolve(++attempts === 1 ? response({}, 400) : response({ ...group, id: otherId }, 201))
    return Promise.resolve(response([group]))
  })
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Playgroup erstellen' }))
  const input = await screen.findByRole('textbox', { name: 'Name der Playgroup' })
  fireEvent.change(input, { target: { value: '\u0085\u001c\u00a0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  expect(await screen.findByText('Bitte gib einen Namen für die Playgroup ein.')).toBeInTheDocument()
  expect(attempts).toBe(0)
  fireEvent.change(input, { target: { value: `\u0085 ${group.name} \u001c` } })
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  await screen.findByRole('alert')
  expect(input).toHaveValue(`\u0085 ${group.name} \u001c`)
  expect(screen.getByRole('button', { name: 'Erstellen' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  await screen.findByText('Overview route')
  expect(attempts).toBe(2)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init!.body as string))).toEqual([{ name: group.name }, { name: group.name }])
})

test('a late list response after unmount cannot expire another session', async () => {
  let resolve!: (reply: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
  const unauthorized = vi.fn(), view = show(unauthorized)
  expect(screen.getByRole('status')).toHaveTextContent('Playgroups werden geladen…')
  expect(screen.queryByText(/Du bist noch keiner/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Playgroup erstellen' })).toBeEnabled()
  view.unmount()
  await act(async () => resolve(response({}, 401)))
  expect(unauthorized).not.toHaveBeenCalled()
})

test.each([0, 1, 3, 20])('the create action remains available with %s active groups', async count => {
  const groups = Array.from({ length: count }, (_, index) => ({ ...group, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, name: `Group ${index}` }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(groups)))
  show()
  await act(async () => {})
  expect(screen.getAllByRole('button').filter(button => button.getAttribute('aria-description')?.startsWith('Übersicht'))).toHaveLength(count)
  expect(screen.getByRole('button', { name: 'Playgroup erstellen' })).toBeEnabled()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Einladungscode')).not.toBeInTheDocument()
})

test('exactly empty names show inline feedback without requesting creation', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response([])))
  vi.stubGlobal('fetch', fetchMock)
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Playgroup erstellen' }))
  const input = await screen.findByRole('textbox', { name: 'Name der Playgroup' })
  expect(input).toHaveValue('')
  expect(input).toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: 'Erstellen' }))
  expect(await screen.findByText('Bitte gib einen Namen für die Playgroup ein.')).toBeVisible()
  expect(input).toBeInvalid()
  expect(input).toHaveFocus()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  fireEvent.change(input, { target: { value: 'Correction' } })
  expect(screen.queryByText('Bitte gib einen Namen für die Playgroup ein.')).not.toBeInTheDocument()
})
