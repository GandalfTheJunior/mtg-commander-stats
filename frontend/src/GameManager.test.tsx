import { AppRouter } from './AppRouter'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { selectTab } from './test/groupEntry'
import { statistics, emptyStatistics } from './test/statisticsFixtures'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  api.state.statistics = statistics()
  renderApp(<App />, groupUrl(group.id, 'statistics'))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  await selectTab('Spiele')
  fireEvent.click(await screen.findByRole('link', { name: 'Spiel erfassen' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner(uid(2))
  api.state.statistics = emptyStatistics()
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByText('Spiel erfolgreich gespeichert.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Änderungen verwerfen?' })).not.toBeInTheDocument()
  expect(await screen.findByRole('article', { name: `Game ${uid(20)}` })).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path, init]) => path === apiPath && init?.method === 'POST')).toBe(true)
  await selectTab('Statistiken')
  await screen.findByText(/Noch keine Spielerstatistiken/)
  expect(api.fetchMock.mock.calls.filter(([path]) => path.endsWith('/statistics'))).toHaveLength(2)
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
  fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
  await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })
  fireEvent.click(screen.getByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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
  fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
  await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })
  fireEvent.click(screen.getByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(screen.queryByText('Spiel erfolgreich gespeichert.')).not.toBeInTheDocument()
})

test.each(['MEMBER', 'ADMIN'])('a direct edit route refuses a cross-creator %s edit', async role => {
  const { api } = setup([recorded({ creatorId: uid(3) })])
  api.next(`/api/groups/${group.id}`, () => response({ ...group, role }))
  renderApp(<App />, `${gamesPath}/${uid(20)}/edit`)
  expect(await screen.findByText('Dieses Spiel kann nicht bearbeitet werden.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Zurück zum Spiel' })).toHaveAttribute('href', `${gamesPath}/${uid(20)}`)
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

 test.each(['loading', 'error'] as const)('focused editor has a fixed exit while %s', async status => {
  const { api } = setup([])
  api.next(`/api/groups/${group.id}`, () => status === 'loading' ? deferred().promise : response({}, 503))
  renderApp(<App />, editorPath)
  expect(await screen.findByRole('link', { name: 'Zur Spielehistorie' })).toHaveAttribute('href', gamesPath)
  if (status === 'error') expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
})

test('cancelled creation returns to unchanged server statistics without a POST', async () => {
  const { api } = setup([])
  api.state.statistics = statistics()
  renderApp(<App />, groupUrl(group.id, 'statistics'))
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  await selectTab('Spiele')
  fireEvent.click(await screen.findByRole('link', { name: 'Spiel erfassen' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  await selectTab('Statistiken')
  await screen.findByRole('table', { name: 'Spielerstatistiken' })
  expect(api.fetchMock.mock.calls.filter(([path]) => path.endsWith('/statistics'))).toHaveLength(2)
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

test.each(['visible Back', 'browser Back'] as const)('dirty new-game %s requires stay/discard and retains the draft on stay', async exit => {
  const { api } = setup([])
  window.history.replaceState(null, '', exit === 'browser Back' ? gamesPath : editorPath)
  render(<AppThemeProvider><AppRouter><App /></AppRouter></AppThemeProvider>)
  if (exit === 'browser Back') fireEvent.click(await screen.findByRole('link', { name: 'Spiel erfassen' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(2) } })
  const leave = () => {
    if (exit === 'browser Back') act(() => window.history.back())
    else fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
  }
  leave()
  await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })
  await waitFor(() => expect(window.location.pathname).toBe(editorPath))
  fireEvent.click(screen.getByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue(uid(2))
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  leave()
  await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })
  fireEvent.click(screen.getByRole('button', { name: 'Verwerfen und verlassen' }))
  await screen.findByRole('link', { name: 'Spiel erfassen' })
  expect(window.location.pathname).toBe(gamesPath)
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  if (exit === 'browser Back') {
    act(() => window.history.forward())
    await screen.findByRole('form', { name: 'Spiel erfassen' })
    expect(window.location.pathname).toBe(editorPath)
    expect(screen.getByRole('combobox', { name: 'Spieler 1' })).toHaveValue('')
  }
})
