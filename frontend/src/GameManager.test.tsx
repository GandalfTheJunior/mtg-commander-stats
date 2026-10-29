import { selectGameWinner } from './test/gameEntry'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp } from './test/renderApp'
import { gameAction, selectGameDeck } from './test/gameEntry'
import type { GroupDetails } from './api'
import { deckFor, deferred, gameApi, group, members, recorded, response, uid } from './test/gameFixtures'

const path = `/api/groups/${group.id}/games`
function show(details: GroupDetails = group, actorId = uid(1)) {
  const base = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/me') return response({ id: actorId, username: 'Actor' })
    if (path === `/api/groups/${group.id}` && details !== group) return response(details)
    if (path === '/api/groups') return response([details])
    return base(path, init)
  }))
  return renderApp(<App />, `/playgroups/${group.id}`)
}
async function start() {
  const games = within(await screen.findByRole('tabpanel', { name: 'Spiele' }))
  fireEvent.click(await games.findByRole('button', { name: 'Spiel erfassen' }))
}
async function selectPlayers(first = 2, second = 3, options: { keepEmptyCards?: boolean } = {}) {
  const editor = within(screen.getByRole('form', { name: 'Spiel erfassen' }))
  // This fixture records two players; omit unused cards through the real UI.
  for (const slot of options.keepEmptyCards ? [] : [4, 3]) {
    const card = within(editor.getByRole('region', { name: `Spieler ${slot}` }))
    fireEvent.click(card.getByRole('button', { name: `Spieler ${slot} entfernen` }))
  }
  for (const [slot, user] of [[1, first], [2, second]]) {
    const card = within(editor.getByRole('region', { name: `Spieler ${slot}` }))
    fireEvent.change(card.getByRole('combobox', { name: `Spieler ${slot}` }), { target: { value: uid(user) } })
  }
  await selectGameDeck(1, deckFor(first))
  await selectGameDeck(2, deckFor(second))
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test.each(['WIN', 'DRAW'])('records %s without the actor playing, using only documented fields and refreshing history', async (result) => {
  const api = gameApi()
  show()
  await start()
  await selectPlayers()
  if (result === 'DRAW') fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  else selectGameWinner(uid(2))
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game recorded.')
  await screen.findByRole('article', { name: `Game ${uid(20)}` })
  await waitFor(() => expect(screen.getByText('Game recorded.').closest('[role="status"]')).toHaveFocus())
  const call = api.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(call[0]).toBe(path)
  expect(call[1]).toEqual(expect.objectContaining({ credentials: 'same-origin', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'game-token' } }))
  expect(JSON.parse(call[1]!.body as string)).toEqual({ participants: [2, 3].map((n, i) => ({ userId: uid(n), deckId: deckFor(n).id, startPosition: i + 1, ...(result === 'DRAW' ? { stillInGame: true } : { placement: i + 1 }) })),
    result, alternateWinCon: false })
  expect(api.fetchMock.mock.calls.filter(([url, init]) => url === path && !init?.method)).toHaveLength(2)
})

test('validates incomplete results, disables duplicates, limits player count, and offers only selected winners', async () => {
  gameApi(); show(); await start()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Spiel speichern' })).not.toBeDisabled())
  fireEvent.submit(screen.getByRole('form', { name: 'Spiel erfassen' }))
  await screen.findByRole('alert')
  await selectPlayers(2, 3, { keepEmptyCards: true })
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 2 bearbeiten' }))
  expect(within(screen.getByRole('combobox', { name: 'Spieler 2' })).getByRole('option', { name: /Same name.*0002.*bereits gewählt/ })).toBeDisabled()
  expect(screen.queryByRole('combobox', { name: 'Gewinner' })).not.toBeInTheDocument()
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }))
  expect(screen.getByRole('button', { name: 'Spieler hinzufügen' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 6 entfernen' }))
  expect(screen.getByRole('button', { name: 'Spieler hinzufügen' })).not.toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  expect(screen.queryByRole('combobox', { name: 'Spieler 1' })).not.toBeInTheDocument()
})

test('handles empty and failed deck lists with retry and never submits an incomplete assignment', async () => {
  const api = gameApi()
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => response([]))
  show(); await start()
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  await screen.findByText(/Keine aktuellen Decks für Same name/)
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).toHaveAttribute('aria-invalid', 'true')
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => { throw new Error('Deck network unavailable') })
  // Clear/reselect starts a fresh selection lifetime after a valid empty list.
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 1 leeren' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  await screen.findByText(/Deck network unavailable/)
  fireEvent.click(screen.getByRole('button', { name: 'Decks für Spieler 1 erneut laden' }))
  await screen.findByRole('option', { name: /Deck 2 — Commander 2 — R/ })
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

test('waits for acknowledgment and prevents duplicate creation while pending', async () => {
  const api = gameApi()
  const pending = deferred()
  api.next(path, () => pending.promise, 'POST')
  show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  const form = screen.getByRole('form', { name: 'Spiel erfassen' })
  fireEvent.submit(form); fireEvent.submit(form)
  await screen.findByRole('button', { name: 'Spiel wird gespeichert…' })
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Spielverlauf' })).not.toBeInTheDocument()
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
  await screen.findByText(/Ehemaliges Mitglied: Nur die ursprüngliche/)
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  expect(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).toHaveValue(deckFor(2).id)
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Spiel speichern' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game updated.')
  const write = api.fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
  expect(write[0]).toBe(`${path}/${old.id}`)
  expect(JSON.parse(write[1]!.body as string)).toEqual({ participants: old.participants.map(({ userId, deckId, startPosition }) => ({ userId, deckId, startPosition, stillInGame: true })), result: 'DRAW', alternateWinCon: false })
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith(`/members/${uid(2)}/decks`))).toBe(false)
})

test('new edit assignments use current eligible decks; cancellation writes nothing and restores focus', async () => {
  const api = gameApi([recorded()]); show()
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  fireEvent.click(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(4) } })
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).not.toBeDisabled())
  expect(within(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).queryByRole('option', { name: /Deck 2/ })).not.toBeInTheDocument()
  expect(within(screen.getByRole('combobox', { name: 'Deck für Spieler 1' })).getByRole('option', { name: /Deck 4/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Spiel erfassen' })).toHaveFocus())
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
})

test.each(['validation', 'conflict', 'network', 'malformed', 'server', 'unexpected'])('failed create (%s) never claims success or fabricates history', async (failure) => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  api.next(path, () => {
    if (failure === 'network') throw new Error('Network interrupted')
    if (failure === 'malformed') return response({ ...recorded(), groupId: uid(99) }, 201)
    if (failure === 'server') return response({}, 500)
    if (failure === 'unexpected') return response(recorded(), 200)
    return response({ detail: 'Game could not be recorded.' }, failure === 'validation' ? 400 : 409)
  }, 'POST')
  selectGameWinner(uid(2))
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  if (failure === 'validation') fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  await screen.findByText('No recorded games yet.')
})

test('failed edit recovers the original server-backed game and uses history winner display rather than active-member labels', async () => {
  const previous = recorded()
  previous.participants[0].username = 'Current historical display'
  const api = gameApi([previous]); show()
  await screen.findByRole('heading', { name: /WIN — Current historical display · Deck 2/ })
  api.next(`${path}/${uid(20)}`, () => response({ detail: 'Assignment changed on the server.' }, 409), 'PUT')
  await gameAction('Bearbeiten')
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Spiel speichern' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  }
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Spieler 1' })).not.toBeInTheDocument()
})


test.each(['history', 'decks'])('retired %s cannot restore a previous mounted game area or expire a replacement session', async source => {
  const api = gameApi(), late = deferred()
  if (source === 'history') api.next(path, () => late.promise)
  else api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => late.promise)
  const view = show()
  if (source === 'history') await screen.findByText('Loading game history…')
  else {
    await start()
    fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
    await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith(`/members/${uid(2)}/decks`))).toBe(true))
  }
  view.unmount()
  show()
  await screen.findByText('No recorded games yet.')
  await act(async () => late.resolve(response({}, 401)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Actor')
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Spieler 1' })).not.toBeInTheDocument()
})

test('400 preserves an editable draft for deliberate correction and does not auto-repeat POST', async () => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  api.next(path, () => response({ detail: 'Deck no longer eligible.' }, 400), 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent('Der Server hat die Angaben abgelehnt')
  expect(error).toHaveFocus()
  expect(within(screen.getByRole('region', { name: 'Spieler 1' })).getByRole('button', { name: 'Platz 1' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' })).toBeEnabled()
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game recorded.')
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
})


test.each(['POST', 'PUT'] as const)('%s ambiguous acknowledgment retires private draft, warns about possible commit and permits only fresh manual inspection', async method => {
  const api = gameApi(method === 'PUT' ? [recorded()] : [])
  show()
  if (method === 'PUT') {
    await gameAction('Bearbeiten'); await screen.findByRole('form', { name: 'Spiel bearbeiten' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Spielergebnis' }), { target: { value: 'DRAW' } })
  } else {
    await start(); await selectPlayers()
    selectGameWinner(uid(2))
  }
  const check = deferred()
  api.next(`/api/groups/${group.id}`, () => check.promise)
  api.next(method === 'PUT' ? `${path}/${uid(20)}` : path, () => {
    api.state.history = [recorded({ result: 'DRAW', winnerUserId: null })]
    return response({ invalid: true }, method === 'POST' ? 201 : 200)
  }, method)
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Checking group access…')
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => check.resolve(response(group)))
  expect(await screen.findByRole('alert')).toHaveTextContent('könnte bereits gespeichert worden sein')
  expect(screen.queryByText('Game recorded.')).not.toBeInTheDocument()
  expect(screen.queryByText('Game updated.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await screen.findByRole('heading', { name: 'Unentschieden' })
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === method)).toHaveLength(1)
})

test.each([403, 404])('write %s hides the draft, safely rechecks access and requires a new authorized action', async status => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  api.next(path, () => response({}, status), 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Anfrage wurde abgelehnt')
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Actor')
  expect(api.fetchMock.mock.calls.filter(([url]) => url === `/api/groups/${group.id}`)).toHaveLength(2)
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test('write 401 expires the current session and retires the draft', async () => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  api.next(path, () => response({}, 401), 'POST')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
})

test('duplicate saves are locked during CSRF; discarding pending work aborts it and requires server inspection', async () => {
  const api = gameApi(), csrf = deferred(); show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  api.next('/api/csrf', () => csrf.promise)
  const form = screen.getByRole('form', { name: 'Spiel erfassen' })
  fireEvent.submit(form); fireEvent.submit(form)
  await screen.findByRole('button', { name: 'Spiel wird gespeichert…' })
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Server trotzdem erreicht')
  fireEvent.click(screen.getByRole('button', { name: 'Verwerfen und verlassen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await screen.findByRole('alert')).toHaveTextContent('könnte bereits gespeichert worden sein')
  await act(async () => csrf.resolve(response({ headerName: 'X-CSRF-TOKEN', token: 'late-token' })))
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }))
  await screen.findByRole('button', { name: 'Spiel erfassen' })
})

test('an ambiguous write keeps its possible-commit warning when the safe group check itself fails', async () => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  api.next(path, () => { throw new Error('Write connection lost') }, 'POST')
  api.next(`/api/groups/${group.id}`, () => { throw new Error('Group check unavailable') })
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText(/Group access could not be verified/)
  expect(screen.getByText(/könnte bereits gespeichert worden sein/)).toBeInTheDocument()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test('lost membership during safe recovery prevents restoration or another write without expiring a confirmed session', async () => {
  const api = gameApi(); show(); await start(); await selectPlayers()
  selectGameWinner(uid(2))
  api.next(path, () => response({}, 403), 'POST')
  api.next(`/api/groups/${group.id}`, () => response({}, 403))
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText(/Diese Playgroup ist nicht verfügbar/)
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Actor')
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})
