import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp } from './test/renderApp'
import { gameAction } from './test/gameEntry'
import type { GroupDetails } from './api'
import { deckFor, deferred, gameApi, group, members, recorded, response, uid } from './test/gameFixtures'

const path = `/api/groups/${group.id}/games`
function show(details: GroupDetails = group, actorId = uid(1)) {
  const base = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') return response({ id: actorId, username: 'Actor' })
    if (path === `/api/groups/${group.id}`) return response(details)
    if (path === '/api/groups') return response([details])
    return base(path, init)
  }))
  return renderApp(<App />, `/playgroups/${group.id}`)
}
async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
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
  show()
  await start()
  await selectPlayers()
  if (result === 'DRAW') fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  else fireEvent.change(screen.getByLabelText('Winning player'), { target: { value: uid(2) } })
  fireEvent.click(screen.getByRole('button', { name: 'Record game' }))
  await screen.findByText('Game recorded.')
  await screen.findByRole('article', { name: `Game ${uid(20)}` })
  await waitFor(() => expect(screen.getByText('Game recorded.').closest('[role="status"]')).toHaveFocus())
  const call = api.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(call[0]).toBe(path)
  expect(call[1]).toEqual(expect.objectContaining({ credentials: 'same-origin', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'game-token' } }))
  expect(JSON.parse(call[1]!.body as string)).toEqual({ participants: [2, 3].map((n) => ({ userId: uid(n), deckId: deckFor(n).id })),
    result, winnerUserId: result === 'DRAW' ? null : uid(2) })
  expect(api.fetchMock.mock.calls.filter(([url, init]) => url === path && !init?.method)).toHaveLength(2)
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

test('preserves former/archived assignments when editing and sends no immutable metadata', async () => {
  const old = recorded()
  old.participants[0].deck.archived = true
  const api = gameApi([old])
  show({ ...group, members: members.filter((m) => m.userId !== uid(2)) })
  await gameAction('Bearbeiten')
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
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Edit game' })
  fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(4) } })
  await waitFor(() => expect(screen.getByLabelText('Deck for player 1')).not.toBeDisabled())
  expect(within(screen.getByLabelText('Deck for player 1')).queryByRole('option', { name: /Deck 2/ })).not.toBeInTheDocument()
  expect(within(screen.getByLabelText('Deck for player 1')).getByRole('option', { name: /Deck 4/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel game' }))
  expect(screen.getByRole('button', { name: 'Spiel erfassen' })).toHaveFocus()
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
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
  await screen.findByRole('heading', { name: /WIN — Current historical display · Deck 2/ })
  api.next(`${path}/${uid(20)}`, () => response({ detail: 'Assignment changed on the server.' }, 409), 'PUT')
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Edit game' })
  fireEvent.change(screen.getByLabelText('Game result'), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save game' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('Game updated.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await screen.findByRole('heading', { name: /WIN — Current historical display · Deck 2/ })
})

test.each(['history', 'selection'])('current %s 401 expires the session without keeping protected games visible', async (source) => {
  const api = gameApi()
  if (source === 'history') api.next(path, () => response({}, 401))
  else api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => response({}, 401))
  show()
  if (source === 'selection') {
    await start()
    fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(2) } })
  }
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument()
})


test.each(['history', 'decks'])('retired %s cannot restore a previous mounted game area or expire a replacement session', async source => {
  const api = gameApi(), late = deferred()
  if (source === 'history') api.next(path, () => late.promise)
  else api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => late.promise)
  const view = show()
  if (source === 'history') await screen.findByText('Loading game history…')
  else {
    await start()
    fireEvent.change(screen.getByLabelText('Player 1'), { target: { value: uid(2) } })
    await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith(`/members/${uid(2)}/decks`))).toBe(true))
  }
  view.unmount()
  show()
  await screen.findByText('No recorded games yet.')
  await act(async () => late.resolve(response({}, 401)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Actor')
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument()
})
