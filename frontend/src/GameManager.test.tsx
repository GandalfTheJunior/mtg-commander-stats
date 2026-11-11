import { AppRouter } from './AppRouter'
import { AppThemeProvider } from './theme/AppThemeProvider'
import { selectTab } from './test/groupEntry'
import { statistics, emptyStatistics } from './test/statisticsFixtures'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp } from './test/renderApp'
import { deckFor, deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'
import { gameCard, selectGameMember, selectGamePlayer, selectGameWinner } from './test/gameEntry'
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
  await selectGamePlayer(1, 'Same name (…0002)', deckFor(2))
  await selectGamePlayer(2, 'Same name (…0003)', deckFor(3))
}
// Choosing a member makes the draft dirty; closing the chained deck picker keeps the member.
async function dirty() {
  await selectGameMember(1, 'Same name (…0002)')
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deck auswählen' })).getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('direct new-game route verifies group and mounts the existing focused editor', async () => {
  setup([])
  renderApp(<App />, editorPath)
  expect(await screen.findByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Spiel erfassen' })).toHaveFocus()
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
  selectGameWinner('Same name (…0002)')
  api.state.statistics = emptyStatistics()
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByRole('heading', { name: 'Spiel erfolgreich gespeichert' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Änderungen verwerfen?' })).not.toBeInTheDocument()
  expect(await screen.findByRole('article')).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  expect(api.fetchMock.mock.calls.some(([path, init]) => path === apiPath && init?.method === 'POST')).toBe(true)
  await selectTab('Statistiken')
  await screen.findByText(/Noch keine Spielerstatistiken/)
  expect(api.fetchMock.mock.calls.filter(([path]) => path.endsWith('/statistics'))).toHaveLength(2)
})

test('dirty exit asks before discarding the focused form', async () => {
  setup([])
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await dirty()
  fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
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
  selectGameWinner('Same name (…0002)')
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
  selectGameWinner('Same name (…0002)')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  expect(await screen.findByText(/könnte bereits gespeichert worden sein/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
  await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })
  fireEvent.click(screen.getByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('form', { name: 'Spiel erfassen' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Spiel erfolgreich gespeichert' })).not.toBeInTheDocument()
})

test.each(['MEMBER'])('a direct edit route refuses a cross-creator %s edit', async role => {
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
  fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
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
  await dirty()
  const leave = () => {
    if (exit === 'browser Back') act(() => window.history.back())
    else fireEvent.click(screen.getByRole('link', { name: 'Zur Spielehistorie' }))
  }
  leave()
  await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })
  await waitFor(() => expect(window.location.pathname).toBe(editorPath))
  fireEvent.click(screen.getByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(gameCard(1).getByText('Same name (…0002)')).toBeInTheDocument()
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
    expect(gameCard(1).getByRole('button', { name: 'Spieler 1 auswählen' })).toBeInTheDocument()
  }
})


test('an active ADMIN can open a cross-creator game edit with saved assignments', async () => {
  const { api } = setup([recorded({ creatorId: uid(3) })])
  api.next(`/api/groups/${group.id}`, () => response({ ...group, role: 'ADMIN' }))
  renderApp(<App />, `${gamesPath}/${uid(20)}/edit`)
  await screen.findByRole('form', { name: 'Spiel bearbeiten' })
  expect(screen.getByText('Deck 2')).toBeInTheDocument()
  expect(screen.getByText('Deck 3')).toBeInTheDocument()
})

test('the success panel offers the same players again, the overview, or closing without leaving Games', async () => {
  const { api } = setup([])
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  fireEvent.change(screen.getByLabelText('Spieldatum'), { target: { value: '2026-10-31' } })
  await players()
  fireEvent.click(gameCard(1).getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  fireEvent.click(gameCard(1).getByRole('button', { name: 'Spieler 1 nach unten' }))
  selectGameWinner('Same name (…0002)')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  const panel = within(await screen.findByRole('region', { name: 'Spiel erfolgreich gespeichert' }))
  expect(panel.getByText('Deine Partie ist jetzt in der Spielehistorie dieser Playgroup sichtbar.')).toBeInTheDocument()
  expect(await screen.findByRole('article')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true')
  // Clickable history coexists with the nonblocking panel; nothing auto-dismisses it.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(screen.getByRole('region', { name: 'Spiel erfolgreich gespeichert' })).toBeInTheDocument()
  fireEvent.click(panel.getByRole('button', { name: 'Noch ein Spiel – gleiche Spieler' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  // Only the members return: no decks, seat order, results or the previous date.
  expect(gameCard(1).getByText('Same name (…0002)')).toBeInTheDocument()
  expect(gameCard(2).getByText('Same name (…0003)')).toBeInTheDocument()
  expect(gameCard(1).getByText('Noch kein Deck ausgewählt')).toBeInTheDocument()
  expect(gameCard(3).getByRole('button', { name: 'Spieler 3 auswählen' })).toBeInTheDocument()
  expect(screen.getByLabelText('Spieldatum')).not.toHaveValue('2026-10-31')
  expect(screen.getByRole('button', { name: 'Sieg' })).toHaveAttribute('aria-pressed', 'true')
  expect(api.fetchMock.mock.calls.filter(([path, init]) => path === apiPath && init?.method === 'POST')).toHaveLength(1)
})

test('closing the success panel stays on Games; the overview action opens Übersicht; a reload shows no panel', async () => {
  setup([])
  const view = renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner('Same name (…0002)')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  const panel = within(await screen.findByRole('region', { name: 'Spiel erfolgreich gespeichert' }))
  fireEvent.click(panel.getByRole('button', { name: 'Hinweis schließen' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Spiel erfolgreich gespeichert' })).not.toBeInTheDocument())
  expect(screen.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true')
  view.unmount()
  renderApp(<App />, editorPath)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner('Same name (…0002)')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  fireEvent.click(within(await screen.findByRole('region', { name: 'Spiel erfolgreich gespeichert' })).getByRole('button', { name: 'Zur Playgroup-Übersicht' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true'))
  expect(screen.queryByRole('region', { name: 'Spiel erfolgreich gespeichert' })).not.toBeInTheDocument()
})

test('leaving the Games view retires the success panel; browser Back does not restore it', async () => {
  setup([])
  window.history.replaceState(null, '', editorPath)
  render(<AppThemeProvider><AppRouter><App /></AppRouter></AppThemeProvider>)
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await players()
  selectGameWinner('Same name (…0002)')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('region', { name: 'Spiel erfolgreich gespeichert' })
  fireEvent.click(await screen.findByRole('link', { name: /^Spieldetails:/ }))
  await screen.findByRole('heading', { name: 'Spieldetails' })
  act(() => window.history.back())
  await screen.findByRole('link', { name: /^Spieldetails:/ })
  expect(window.location.pathname).toBe(gamesPath)
  expect(screen.queryByRole('region', { name: 'Spiel erfolgreich gespeichert' })).not.toBeInTheDocument()
})
