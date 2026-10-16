import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import GameManager from './GameManager'
import type { GroupDetails } from './api'
import { deckFor, deferred, gameApi, group, members, recorded, response, uid } from './test/gameFixtures'

const path = `/api/groups/${group.id}/games`
function show(details: GroupDetails = group, actorId = uid(1)) {
  const callbacks = { onUnauthorized: vi.fn(), onAccessLost: vi.fn(), onCheckingAccess: vi.fn(), onGroupConfirmed: vi.fn(), onChanged: vi.fn() }
  const view = render(<GameManager group={details} actorId={actorId} {...callbacks} />)
  return { ...view, ...callbacks }
}
async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Record a game' }))
}
async function selectPlayers(first = 2, second = 3) {
  fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(first) } })
  fireEvent.change(screen.getByLabelText('Player 2'), { target: { value: uid(second) } })
  await waitFor(() => expect(screen.getByLabelText('Deck for player 1')).not.toBeDisabled())
  fireEvent.change(screen.getByLabelText('Deck for player 1'), { target: { value: deckFor(first).id } })
  fireEvent.change(screen.getByLabelText('Deck for player 2'), { target: { value: deckFor(second).id } })
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test.each(['WIN', 'DRAW'])('records %s without the actor playing, using only documented fields and refreshing history', async (result) => {
  const api = gameApi()
  const view = show()
  await start()
  await selectPlayers()
  if (result === 'DRAW') fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  else fireEvent.change(screen.getByLabelText('Winning player'), { target: { value: uid(2) } })
  fireEvent.click(screen.getByRole('button', { name: 'Record game' }))
  await screen.findByText('Game recorded.')
  await screen.findByRole('article', { name: `Game ${uid(20)}` })
  expect(screen.getByText('Game recorded.')).toHaveFocus()
  const call = api.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(call[0]).toBe(path)
  expect(call[1]).toEqual(expect.objectContaining({ credentials: 'same-origin', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'game-token' } }))
  expect(JSON.parse(call[1]!.body as string)).toEqual({ participants: [2, 3].map((n) => ({ userId: uid(n), deckId: deckFor(n).id })),
    result, winnerUserId: result === 'DRAW' ? null : uid(2) })
  expect(view.onChanged).toHaveBeenCalledTimes(1)
})

test('validates incomplete results, disables duplicates, limits player count, and offers only selected winners', async () => {
  gameApi(); show(); await start()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Record game' })).not.toBeDisabled())
  fireEvent.submit(screen.getByRole('form', { name: 'Record game' }))
  await screen.findByRole('alert')
  await selectPlayers()
  expect(within(screen.getByLabelText('Player 2')).getByRole('option', { name: `Same name (${uid(2)})` })).toBeDisabled()
  expect(within(screen.getByLabelText('Winning player')).queryByRole('option', { name: /Owner/ })).not.toBeInTheDocument()
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Add player' }))
  expect(screen.getByRole('button', { name: 'Add player' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove player 6' }))
  expect(screen.getByRole('button', { name: 'Add player' })).not.toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel game' }))
  expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument()
})

test('handles empty and failed deck lists with retry and never submits an incomplete assignment', async () => {
  const api = gameApi()
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => response([]))
  show(); await start()
  fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(2) } })
  await screen.findByText(/No eligible decks for Same name/)
  expect(screen.getByRole('button', { name: 'Record game' })).toBeDisabled()
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => { throw new Error('Deck network unavailable') })
  fireEvent.click(screen.getByRole('button', { name: 'Reload eligible decks' }))
  await screen.findByText('Deck network unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Reload eligible decks' }))
  await screen.findByRole('option', { name: /Deck 2 — Commander 2 — R/ })
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

test('waits for acknowledgment and prevents duplicate creation while pending', async () => {
  const api = gameApi()
  const pending = deferred()
  api.next(path, () => pending.promise, 'POST')
  show(); await start(); await selectPlayers()
  fireEvent.change(screen.getByLabelText('Winning player'), { target: { value: uid(2) } })
  const form = screen.getByRole('form', { name: 'Record game' })
  fireEvent.submit(form); fireEvent.submit(form)
  await screen.findByRole('button', { name: 'Saving game…' })
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  expect(screen.getByText('No recorded games yet.')).toBeInTheDocument()
  api.state.history = [recorded()]
  await act(async () => pending.resolve(response(recorded(), 201)))
  await screen.findByText('Game recorded.')
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test.each([
  ['OWNER', 1, true], ['MEMBER', 2, true], ['MEMBER', 3, false],
] as const)('offers game actions for %s actor %s only when allowed', async (role, actor, allowed) => {
  gameApi([recorded()]); show({ ...group, role }, uid(actor))
  await screen.findByRole('article')
  expect(screen.queryByRole('button', { name: 'Edit game' }) !== null).toBe(allowed)
  expect(screen.queryByRole('button', { name: 'Delete game' }) !== null).toBe(allowed)
})

test('preserves former/archived assignments when editing and sends no immutable metadata', async () => {
  const old = recorded()
  old.participants[0].deck.archived = true
  const api = gameApi([old])
  show({ ...group, members: members.filter((m) => m.userId !== uid(2)) })
  await screen.findByText(/Archived deck/)
  fireEvent.click(screen.getByRole('button', { name: 'Edit game' }))
  await screen.findByText('Former member: only the recorded deck assignment can be retained.')
  expect(screen.getByLabelText('Deck for player 1')).toHaveValue(deckFor(2).id)
  fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save game' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await screen.findByText('Game updated.')
  const write = api.fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
  expect(write[0]).toBe(`${path}/${old.id}`)
  expect(JSON.parse(write[1]!.body as string)).toEqual({ participants: old.participants.map(({ userId, deckId }) => ({ userId, deckId })), result: 'DRAW', winnerUserId: null })
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith(`/members/${uid(2)}/decks`))).toBe(false)
})

test('new edit assignments use current eligible decks; cancellation writes nothing and restores focus', async () => {
  const api = gameApi([recorded()]); show()
  const trigger = await screen.findByRole('button', { name: 'Edit game' })
  fireEvent.click(trigger)
  fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(4) } })
  await waitFor(() => expect(screen.getByLabelText('Deck for player 1')).not.toBeDisabled())
  expect(within(screen.getByLabelText('Deck for player 1')).queryByRole('option', { name: /Deck 2/ })).not.toBeInTheDocument()
  expect(within(screen.getByLabelText('Deck for player 1')).getByRole('option', { name: /Deck 4/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel game' }))
  expect(trigger).toHaveFocus()
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

test('deletion identifies the game, cancels without a request, and removes history only after 204', async () => {
  const api = gameApi([recorded()]); show()
  const trigger = await screen.findByRole('button', { name: 'Delete game' })
  fireEvent.click(trigger)
  expect(screen.getByRole('group', { name: 'Confirm game deletion' })).toHaveFocus()
  expect(screen.getByRole('group', { name: 'Confirm game deletion' })).toHaveTextContent(uid(20))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel game deletion' }))
  expect(trigger).toHaveFocus()
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  const pending = deferred()
  api.next(`${path}/${uid(20)}`, () => pending.promise, 'DELETE')
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Confirm game deletion' }))
  expect(screen.getByRole('article')).toBeInTheDocument()
  api.state.history = []
  await act(async () => pending.resolve(new Response(null, { status: 204 })))
  await screen.findByText('Game deleted.')
  await screen.findByText('No recorded games yet.')
})

test.each([400, 403, 404, 409, 500, 200])('failed delete (%s) hides retired history and refresh recovers server state', async (status) => {
  const api = gameApi([recorded()]); const view = show()
  api.next(`${path}/${uid(20)}`, () => response({ detail: 'Game operation rejected.' }, status), 'DELETE')
  fireEvent.click(await screen.findByRole('button', { name: 'Delete game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm game deletion' }))
  await screen.findByRole('alert')
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByText('Game deleted.')).not.toBeInTheDocument()
  expect(view.onUnauthorized).not.toHaveBeenCalled()
  expect(view.onAccessLost).not.toHaveBeenCalled()
  expect(view.onCheckingAccess).toHaveBeenCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  expect(await screen.findByRole('article')).toBeInTheDocument()
})

test.each(['csrf', 'write'])('401 during %s expires only the current session', async (where) => {
  const api = gameApi([recorded()]); const view = show()
  api.next(where === 'csrf' ? '/api/csrf' : `${path}/${uid(20)}`, () => response({}, 401), where === 'csrf' ? 'GET' : 'DELETE')
  fireEvent.click(await screen.findByRole('button', { name: 'Delete game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm game deletion' }))
  await waitFor(() => expect(view.onUnauthorized).toHaveBeenCalledOnce())
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test.each([403, 404])('403 action followed by denied group recheck (%s) loses protected access', async (status) => {
  const api = gameApi([recorded()]); const view = show()
  api.next(`${path}/${uid(20)}`, () => response({}, 403), 'DELETE')
  api.next(`/api/groups/${group.id}`, () => response({}, status))
  fireEvent.click(await screen.findByRole('button', { name: 'Delete game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm game deletion' }))
  await waitFor(() => expect(view.onAccessLost).toHaveBeenCalledOnce())
  expect(view.onUnauthorized).not.toHaveBeenCalled()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test('network failure during access recheck keeps all games hidden until an explicit successful retry', async () => {
  const api = gameApi([recorded()]); show()
  api.next(`${path}/${uid(20)}`, () => response({}, 403), 'DELETE')
  api.next(`/api/groups/${group.id}`, () => { throw new Error('offline') })
  fireEvent.click(await screen.findByRole('button', { name: 'Delete game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm game deletion' }))
  await screen.findByText(/Group access could not be verified/)
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await screen.findByRole('article')
})

test.each(['history', 'decks', 'csrf', 'write'])('retired %s responses cannot restore data, write under a new identity, or expire its session', async (where) => {
  const api = gameApi(where === 'write' || where === 'csrf' ? [recorded()] : [])
  const late = deferred()
  if (where === 'history') api.next(path, () => late.promise)
  const view = show()
  if (where === 'decks') {
    api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => late.promise)
    await start()
    fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(2) } })
    await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => url.includes('/members/'))).toBe(true))
  } else if (where === 'csrf' || where === 'write') {
    api.next(where === 'csrf' ? '/api/csrf' : `${path}/${uid(20)}`, () => late.promise, where === 'csrf' ? 'GET' : 'DELETE')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm game deletion' }))
    await waitFor(() => expect(api.fetchMock.mock.calls.some(([url, init]) => where === 'csrf' ? url === '/api/csrf' : init?.method === 'DELETE')).toBe(true))
  }
  view.unmount()
  await act(async () => late.resolve(where === 'csrf'
    ? response({ headerName: 'X-CSRF-TOKEN', token: 'retired' }) : response({}, 401)))
  expect(view.onUnauthorized).not.toHaveBeenCalled()
  expect(view.onAccessLost).not.toHaveBeenCalled()
  expect(view.onChanged).not.toHaveBeenCalled()
  if (where === 'csrf') expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
})

test.each(['validation', 'conflict', 'network', 'malformed'])('failed create (%s) never claims success or fabricates history', async (failure) => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  api.next(path, () => {
    if (failure === 'network') throw new Error('Network interrupted')
    if (failure === 'malformed') return response({ ...recorded(), groupId: uid(99) }, 201)
    return response({ detail: 'Game could not be recorded.' }, failure === 'validation' ? 400 : 409)
  }, 'POST')
  fireEvent.change(screen.getByLabelText('Winning player'), { target: { value: uid(2) } })
  fireEvent.click(screen.getByRole('button', { name: 'Record game' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await screen.findByText('No recorded games yet.')
})

test('failed edit recovers the original server-backed game and uses history winner display rather than active-member labels', async () => {
  const previous = recorded()
  previous.participants[0].username = 'Current historical display'
  const api = gameApi([previous]); show()
  await screen.findByRole('heading', { name: 'WIN — Current historical display' })
  api.next(`${path}/${uid(20)}`, () => response({ detail: 'Assignment changed on the server.' }, 409), 'PUT')
  fireEvent.click(screen.getByRole('button', { name: 'Edit game' }))
  fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save game' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('Game updated.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await screen.findByRole('heading', { name: 'WIN — Current historical display' })
})

test.each(['history', 'selection'])('current %s 401 expires the session without keeping protected games visible', async (source) => {
  const api = gameApi()
  if (source === 'history') api.next(path, () => response({}, 401))
  else api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => response({}, 401))
  const view = show()
  if (source === 'selection') {
    await start()
    fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(2) } })
  }
  await waitFor(() => expect(view.onUnauthorized).toHaveBeenCalledOnce())
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument()
})
