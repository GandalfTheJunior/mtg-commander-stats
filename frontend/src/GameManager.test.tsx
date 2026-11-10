import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp } from './test/renderApp'
import { deckFor, deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'
import { selectGameDeck, selectGameWinner } from './test/gameEntry'
import { groupUrl } from './groupNavigation'

const gamesPath = groupUrl(group.id, 'games')
const editorPath = `${gamesPath}/new`
const apiPath = `/api/groups/${group.id}/games`
function setup(initial = [recorded()]) {
  const api = gameApi(initial)
  const previous = globalThis.fetch
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/me') return Promise.resolve(response({ id: uid(1), username: 'Owner' }))
    if (path === '/api/groups') return Promise.resolve(response([group]))
    if (path === '/api/decks') return Promise.resolve(response([]))
    return previous(path, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { api, fetchMock }
}
async function players() {
  for (const slot of [4, 3]) fireEvent.click(within(screen.getByRole('region', { name: `Spieler ${slot}` })).getByRole('button', { name: `Spieler ${slot} entfernen` }))
  for (const [slot, user] of [[1, 2], [2, 3]]) {
    fireEvent.change(screen.getByRole('combobox', { name: `Spieler ${slot}` }), { target: { value: uid(user) } })
    await selectGameDeck(slot, deckFor(user))
  }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('direct new-game route verifies group and mounts the existing focused editor', async () => {
  setup([])
  renderApp(<App />, editorPath)
  expect(await screen.findByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Commander-Spiel erfassen' })).toBeInTheDocument()
  expect(screen.queryByRole('tablist', { name: 'Playgroup-Bereiche' })).not.toBeInTheDocument()
})

test('confirmed save uses the selected group and returns to refreshed Games history', async () => {
  const { api } = setup([])
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner(uid(2))
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByText('Spiel erfolgreich gespeichert.')).toBeInTheDocument()
  expect(await screen.findByRole('article', { name: `Game ${uid(20)}` })).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path, init]) => path === apiPath && init?.method === 'POST')).toBe(true)
})

test('dirty cancel asks before discarding the focused form', async () => {
  setup([])
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Im Editor bleiben' }))
  expect(await screen.findByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
})

test('400 validation failure preserves the draft for correction', async () => {
  const { api } = setup([])
  api.next(apiPath, () => response({}, 400), 'POST')
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner(uid(2))
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByText(/Der Server hat die Angaben abgelehnt/)).toBeInTheDocument()
  expect(screen.getByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
})

test('an ambiguous write gives no success and keeps the draft', async () => {
  const { api } = setup([])
  api.next(apiPath, () => { throw new Error('Network lost') }, 'POST')
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner(uid(2))
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByText(/könnte bereits gespeichert worden sein/)).toBeInTheDocument()
  expect(screen.getByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(screen.queryByText('Spiel erfolgreich gespeichert.')).not.toBeInTheDocument()
})

test('a direct edit route refuses a game the viewer cannot modify', async () => {
  const { api } = setup([recorded({ creatorId: uid(3) })])
  api.next(`/api/groups/${group.id}`, () => response({ ...group, role: 'MEMBER' }))
  renderApp(<App />, `${gamesPath}/${uid(20)}/edit`)
  expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel bearbeiten' })).not.toBeInTheDocument()
})

test('a confirmed group 403 retires the editor and returns to Playgroups', async () => {
  const { api } = setup([])
  api.next(`/api/groups/${group.id}`, () => response({}, 403))
  renderApp(<App />, editorPath)
  expect(await screen.findByText('Du hast keinen Zugriff mehr auf diese Playgroup.')).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
})

test('a late group response after navigation cannot restore a retired editor', async () => {
  const { api } = setup([])
  const pending = deferred()
  api.next(`/api/groups/${group.id}`, () => pending.promise)
  const view = renderApp(<App />, editorPath)
  view.unmount()
  await act(async () => pending.resolve(response(group)))
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
})
