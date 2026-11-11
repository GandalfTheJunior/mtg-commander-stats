import { gameAction, openGameDetails, selectGameDeck, selectGameMember, selectGamePlayer, selectGameWinner } from './test/gameEntry'
import { selectTab } from './test/groupEntry'
import { openExistingDeck, openDeckAction } from './test/editorEntry'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp, goTo } from './test/renderApp'

import { deckFor, deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'

const render = (ui: ReactNode) => renderApp(ui, '/playgroups')

function setup() {
  const api = gameApi()
  const base = api.fetchMock
  const state = { identity: { id: uid(1), username: 'Owner' } as { id: string; username: string } | null,
    deck: { ...deckFor(1), everUsed: false, archived: false } }
  const other = { ...group, id: uid(11), name: 'Other pod' }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (path === '/api/me') return response(state.identity ?? {}, state.identity ? 200 : 401)
    if (path === '/api/session' && method === 'DELETE') { state.identity = null; return new Response(null, { status: 204 }) }
    if (path === '/api/session' && method === 'POST') { state.identity = { id: uid(4), username: 'Fourth' }; return response(state.identity) }
    if (path === '/api/decks') return response([state.deck])
    if (path === '/api/groups') return response([group, other])
    if (path === `/api/groups/${other.id}`) return response(other)
    if (path === `/api/groups/${other.id}/games/history`) return response({ games: [{ ...recorded({ id: uid(21), groupId: other.id }), playedOn: null }], nextCursor: null })
    if (path === `/api/decks/${state.deck.id}/archive`) {
      state.deck.archived = true
      api.state.history = api.state.history.map((game) => ({ ...game, participants: game.participants.map((p) =>
        p.deckId === state.deck.id ? { ...p, deck: { ...p.deck, archived: true } } : p) }))
      return response(state.deck)
    }
    const result = await base(path, init)
    if (path.includes('/games') && ['POST', 'PUT'].includes(method)) state.deck.everUsed = true
    return result
  })
  vi.stubGlobal('fetch', fetchMock)
  return { ...api, fetchMock, server: state, other }
}
async function open(name = group.name, waitForTab = true) {
  // The initial render already targets Playgroups; don't navigate there again
  // while its session bootstrap is completing.
  if (screen.queryByText('Checking your session…')) await screen.findByRole('heading', { name: 'Playgroups' })
  if (!screen.queryByRole('heading', { name: 'Playgroups' })) await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name }))
  if (waitForTab) fireEvent.click(await screen.findByRole('tab', { name: 'Games' }))
}
async function create() {
  fireEvent.click(await screen.findByRole('link', { name: 'Spiel erfassen' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  // This scenario records two players; untouched blank cards are omitted.
  await selectGamePlayer(1, 'Owner', deckFor(1))
  await selectGamePlayer(2, 'Same name (…0002)', deckFor(2))
  selectGameWinner('Owner')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('heading', { name: 'Spiel erfolgreich gespeichert' })
  await screen.findByRole('article')
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test.each([
  { lateStatus: 200, role: 'OWNER' },
  { lateStatus: 401, role: 'OWNER' },
  { lateStatus: 403, role: 'OWNER' },
  { lateStatus: 200, role: 'MEMBER' },
])('navigation and deck archival during a pending game access check restore only newly confirmed details ($lateStatus, $role)', async ({ lateStatus, role }) => {
  const api = setup(); api.state.history = [recorded()]; api.server.deck.everUsed = true
  render(<App />); await open(); await screen.findByRole('article')
  await openGameDetails()
  const checking = deferred()
  api.next(`/api/groups/${group.id}/games/${uid(20)}`, () => response({}, 403), 'DELETE')
  api.next(`/api/groups/${group.id}`, () => checking.promise)
  await gameAction('Löschen', false)
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('Löschung und Serverstand werden geprüft…')
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  const replacement = deferred()
  const checkReplacement = vi.fn(() => replacement.promise)
  api.next(`/api/groups/${group.id}`, checkReplacement)
  await goTo('Decks')
  await openExistingDeck()
  await openDeckAction('Archivieren')
  fireEvent.click(screen.getByRole('button', { name: 'Deck archivieren' }))
  await screen.findByText('Deck 1 wurde archiviert.')
  await open(group.name, false)
  await waitFor(() => expect(checkReplacement).toHaveBeenCalledOnce())
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => checking.resolve(response(group, lateStatus)))
  expect(screen.getByRole('button', { name: 'Owner' })).toHaveTextContent('Owner')
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => replacement.resolve(response({ ...group, role })))
  fireEvent.click(await screen.findByRole('tab', { name: 'Games' }))
  await screen.findByRole('article')
  await screen.findByRole('heading', { name: group.name })
  expect(screen.getByRole('heading', { name: group.name })).toBeInTheDocument()
})

test('App refreshes permanent own-deck usage after recording and retains it after game deletion', async () => {
  setup(); render(<App />); await open(); await create()
  await goTo('Decks'); await openExistingDeck()
  await openDeckAction('Archivieren')
  const archive = within(await screen.findByRole('dialog'))
  expect(archive.getByRole('button', { name: 'Deck archivieren' })).toBeInTheDocument()
  fireEvent.click(archive.getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await open(); await screen.findByRole('article')
  await gameAction('Löschen')
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('Tamiyo hat noch keine Aufzeichnungen angefertigt. Sobald ihr ein paar Runden gespielt habt, seht ihr hier eure Historie.')
  await goTo('Decks'); await openExistingDeck()
  expect(screen.getByRole('button', { name: 'Commander ändern (gesperrt)' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('radio', { name: 'Pauper Commander' })).toHaveAttribute('aria-disabled', 'true')
})

test('App refreshes history after own-deck archival', async () => {
  setup(); render(<App />); await open(); await create()
  await goTo('Decks'); await openExistingDeck(); await openDeckAction('Archivieren')
  fireEvent.click(screen.getByRole('button', { name: 'Deck archivieren' }))
  await screen.findByText('Deck 1 wurde archiviert.')
  await open()
  await openGameDetails()
  await screen.findByText(/Archiviertes Deck/)
})

test.each([200, 401])('late history from a previous selected group (%s) cannot restore it or expire the new view', async (status) => {
  const api = setup(); const late = deferred()
  api.next(`/api/groups/${group.id}/games/history`, () => late.promise)
  render(<App />); await open()
  await screen.findByText('Spielehistorie wird geladen…')
  await open(api.other.name)
  await screen.findByRole('article')
  await act(async () => late.resolve(response({ games: [{ ...recorded(), playedOn: null }], nextCursor: null }, status)))
  expect(screen.getAllByRole('link', { name: /^Spieldetails:/ }).map(link => link.getAttribute('href'))).toEqual([`/playgroups/${api.other.id}/games/${uid(21)}`])
  expect(screen.getByRole('button', { name: 'Owner' })).toHaveTextContent('Owner')
})

test.each(['close', 'refresh'])('closing/reopening or refreshing group details retires requests (%s)', async (action) => {
  const api = setup(); const late = deferred()
  api.next(`/api/groups/${group.id}/games/history`, () => late.promise)
  render(<App />); await open(); await screen.findByText('Spielehistorie wird geladen…')
  if (action === 'close') { fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' })); await open() }
  else { await selectTab('Mitglieder'); fireEvent.click(await screen.findByRole('button', { name: 'Mitglieder aktualisieren' })); await screen.findByRole('tab', { name: 'Games' }); await selectTab('Spiele') }
  await screen.findByText('Tamiyo hat noch keine Aufzeichnungen angefertigt. Sobald ihr ein paar Runden gespielt habt, seht ihr hier eure Historie.')
  await act(async () => late.resolve(response({ games: [{ ...recorded(), playedOn: null }], nextCursor: null })))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test('logout and a new identity retire pending game 401s before they can expire or restore protected state', async () => {
  const api = setup(); const late = deferred()
  api.next(`/api/groups/${group.id}/games/history`, () => late.promise)
  render(<App />); await open(); await screen.findByText('Spielehistorie wird geladen…')
  fireEvent.click(within(screen.getByRole('banner', { hidden: true })).getByRole('button', { hidden: true })); fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
  expect(screen.queryByRole('heading', { name: 'Commander games' })).not.toBeInTheDocument()
  await screen.findByText('Logged out.')
  const login = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(login.getByLabelText('Email'), { target: { value: 'fourth@example.test' } })
  fireEvent.change(login.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(login.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Fourth')
  await act(async () => late.resolve(response({}, 401)))
  expect(screen.getByRole('button', { name: 'Fourth' })).toBeInTheDocument()
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
})

test('ambiguous game 403 hides group details/code during safe recheck, then restores only confirmed access', async () => {
  const api = setup(); api.state.history = [recorded()]
  render(<App />); await open(); await screen.findByRole('article')
  await openGameDetails()
  const checking = deferred()
  api.next(`/api/groups/${group.id}/games/${uid(20)}`, () => response({}, 403), 'DELETE')
  api.next(`/api/groups/${group.id}`, () => checking.promise)
  await gameAction('Löschen', false)
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('Löschung und Serverstand werden geprüft…')
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => checking.resolve(response({}, 403)))
  await screen.findByText('Du hast keinen Zugriff mehr auf diese Playgroup.')
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Owner' })).toBeInTheDocument()
})

test('game recording waits for the second member’s independently delayed deck choice', async () => {
  const api = setup(), secondDecks = deferred()
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => secondDecks.promise)
  render(<App />); await open()
  // Drive each observable step here rather than racing a detached create()
  // flow against a second one-second findBy query on slower CI runners.
  fireEvent.click(await screen.findByRole('link', { name: 'Spiel erfassen' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  await selectGamePlayer(1, 'Owner', deckFor(1))
  await selectGameMember(2, 'Same name (…0002)')
  expect(within(screen.getByRole('dialog', { name: 'Deck auswählen' })).getByRole('status')).toHaveTextContent('werden geladen')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern', hidden: true }))
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await act(async () => secondDecks.resolve(response([deckFor(2)])))
  await selectGameDeck(2, deckFor(2))
  selectGameWinner('Owner')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByRole('heading', { name: 'Spiel erfolgreich gespeichert' })
  await screen.findByRole('article')
  const writes = api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1)
  const body = JSON.parse(writes[0][1]!.body as string)
  expect(body).toEqual({
    participants: [{ userId: uid(1), deckId: deckFor(1).id, startPosition: 1, placement: 1 }, { userId: uid(2), deckId: deckFor(2).id, startPosition: 2 }],
    result: 'WIN', alternateWinCon: false, playedOn: body.playedOn,
  })
  expect(body.playedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})
