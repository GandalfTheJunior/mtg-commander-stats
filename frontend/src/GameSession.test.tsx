import { gameAction, openGameDetails, selectGameDeck } from './test/gameEntry'
import { showCode, selectTab } from './test/groupEntry'
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
    if (path === `/api/groups/${other.id}/games`) return response([recorded({ id: uid(21), groupId: other.id })])
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
async function open(name = group.name) {
  await goTo('Playgroups')
  fireEvent.click(await screen.findByRole('button', { name: `${name} (OWNER)` }))
}
async function create() {
  fireEvent.click(await screen.findByRole('button', { name: 'Spiel erfassen' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 1' }), { target: { value: uid(1) } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Spieler 2' }), { target: { value: uid(2) } })
  await selectGameDeck(1, deckFor(1))
  await selectGameDeck(2, deckFor(2))
  fireEvent.change(screen.getByRole('combobox', { name: 'Gewinner' }), { target: { value: uid(1) } })
  fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
  await screen.findByText('Game recorded.')
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
  api.next(`/api/groups/${group.id}/join-code`, () => response({ code: 'abcdefghijklmnopqrstuv' }))
  await showCode()
  await screen.findByDisplayValue('abcdefghijklmnopqrstuv')
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zur Gruppe' }))
  await screen.findByRole('article')
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
  fireEvent.click(screen.getByRole('button', { name: 'Archivieren bestätigen' }))
  await screen.findByText('Deck 1 wurde archiviert.')
  await open()
  await waitFor(() => expect(checkReplacement).toHaveBeenCalledOnce())
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('abcdefghijklmnopqrstuv')).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => checking.resolve(response(group, lateStatus)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Owner')
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('abcdefghijklmnopqrstuv')).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => replacement.resolve(response({ ...group, role })))
  await screen.findByRole('article')
  await screen.findByRole('heading', { name: group.name })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppenaktionen' }))
  await screen.findByRole('menu')
  expect(screen.queryByDisplayValue('abcdefghijklmnopqrstuv')).not.toBeInTheDocument()
  if (role === 'OWNER') expect(screen.getByRole('menuitem', { name: 'Einladungscode verwalten' })).toBeInTheDocument()
  else expect(screen.queryByRole('menuitem', { name: 'Einladungscode verwalten' })).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Owner')
  expect(screen.getByRole('heading', { name: group.name })).toBeInTheDocument()
})

test('App refreshes permanent own-deck usage after recording and retains it after game deletion', async () => {
  setup(); render(<App />); await open(); await create()
  await goTo('Decks'); await openExistingDeck()
  await openDeckAction('Archivieren')
  expect(screen.getByRole('button', { name: 'Archivieren bestätigen' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await open(); await screen.findByRole('article')
  await gameAction('Löschen')
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('No recorded games yet.')
  await goTo('Decks'); await openExistingDeck()
  expect(screen.getByRole('textbox', { name: /Commander/ })).toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toBeDisabled()
})

test('App refreshes history after own-deck archival', async () => {
  setup(); render(<App />); await open(); await create()
  await goTo('Decks'); await openExistingDeck(); await openDeckAction('Archivieren')
  fireEvent.click(screen.getByRole('button', { name: 'Archivieren bestätigen' }))
  await screen.findByText('Deck 1 wurde archiviert.')
  await open()
  await openGameDetails()
  await screen.findByText('Archiviertes Deck')
})

test.each([200, 401])('late history from a previous selected group (%s) cannot restore it or expire the new view', async (status) => {
  const api = setup(); const late = deferred()
  api.next(`/api/groups/${group.id}/games`, () => late.promise)
  render(<App />); await open()
  await screen.findByText('Loading game history…')
  await open(api.other.name)
  await screen.findByRole('article', { name: `Game ${uid(21)}` })
  await act(async () => late.resolve(response([recorded()], status)))
  expect(screen.queryByRole('article', { name: `Game ${uid(20)}` })).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Owner')
})

test.each(['close', 'refresh'])('closing/reopening or refreshing group details retires requests (%s)', async (action) => {
  const api = setup(); const late = deferred()
  api.next(`/api/groups/${group.id}/games`, () => late.promise)
  render(<App />); await open(); await screen.findByText('Loading game history…')
  if (action === 'close') { fireEvent.click(screen.getByRole('link', { name: 'Zurück zu Playgroups' })); await open() }
  else { await selectTab('Mitglieder'); fireEvent.click(screen.getByRole('button', { name: 'Mitglieder aktualisieren' })); await screen.findByRole('tab', { name: 'Spiele' }); await selectTab('Spiele') }
  await screen.findByText('No recorded games yet.')
  await act(async () => late.resolve(response([recorded()])))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test('logout and a new identity retire pending game 401s before they can expire or restore protected state', async () => {
  const api = setup(); const late = deferred()
  api.next(`/api/groups/${group.id}/games`, () => late.promise)
  render(<App />); await open(); await screen.findByText('Loading game history…')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(screen.queryByRole('heading', { name: 'Commander games' })).not.toBeInTheDocument()
  await screen.findByText('Logged out.')
  const login = within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
  fireEvent.change(login.getByLabelText('Email'), { target: { value: 'fourth@example.test' } })
  fireEvent.change(login.getByLabelText('Password'), { target: { value: 'correct horse battery' } })
  fireEvent.click(login.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Fourth')
  await act(async () => late.resolve(response({}, 401)))
  expect(screen.getByText(/Signed in as/)).toHaveTextContent('Fourth')
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
})

test('ambiguous game 403 hides group details/code during safe recheck, then restores only confirmed access', async () => {
  const api = setup(); api.state.history = [recorded()]
  render(<App />); await open(); await screen.findByRole('article')
  api.next(`/api/groups/${group.id}/join-code`, () => response({ code: 'abcdefghijklmnopqrstuv' }))
  await showCode()
  await screen.findByDisplayValue('abcdefghijklmnopqrstuv')
  fireEvent.click(screen.getByRole('link', { name: 'Zurück zur Gruppe' }))
  await screen.findByRole('article')
  await openGameDetails()
  const checking = deferred()
  api.next(`/api/groups/${group.id}/games/${uid(20)}`, () => response({}, 403), 'DELETE')
  api.next(`/api/groups/${group.id}`, () => checking.promise)
  await gameAction('Löschen', false)
  fireEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
  await screen.findByText('Löschung und Serverstand werden geprüft…')
  expect(screen.queryByDisplayValue('abcdefghijklmnopqrstuv')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: group.name })).not.toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await act(async () => checking.resolve(response({}, 403)))
  await screen.findByText(/Diese Playgroup ist nicht verfügbar/)
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
})

test('game recording waits for the second member’s independently delayed deck choice', async () => {
  const api = setup(), secondDecks = deferred()
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => secondDecks.promise)
  render(<App />); await open()
  const recording = create()
  await screen.findByRole('button', { name: 'Spieler 1 bearbeiten' })
  expect(screen.getByRole('combobox', { name: 'Deck für Spieler 2' })).toBeDisabled()
  expect(api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await act(async () => secondDecks.resolve(response([deckFor(2)])))
  await recording
  const writes = api.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0][1]!.body as string)).toEqual({
    participants: [1, 2].map(n => ({ userId: uid(n), deckId: deckFor(n).id })),
    result: 'WIN', winnerUserId: uid(1),
  })
})
