import { savedCommander } from './test/commanderFixtures'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { changeDeck, deck, deckApi, editDeck, menuAction, showDeckApp } from './test/deckFixtures'
import { deferred, response } from './test/gameFixtures'

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

// #201 §5: the menu shows only valid actions and none when no action is valid.
test.each([
  [false, false, ['Archivieren', 'Löschen']], [true, false, ['Archivieren']], [false, true, ['Löschen']], [true, true, []],
] as const)('lifecycle used=%s archived=%s offers exactly %j; name stays editable and used gameplay stays locked', async (everUsed, archived, actions) => {
  const api = deckApi([{ ...deck, everUsed, archived, colorIdentity: ['R'], commanders: [savedCommander('Karn', ['R'])] }]); showDeckApp(); await editDeck()
  expect(screen.getByRole('button', { name: everUsed ? 'Commander ändern (gesperrt)' : 'Commander ändern' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Commander' })).toHaveTextContent('Karn')
  expect(screen.getByRole('img', { name: 'Farbidentität: Rot' })).toBeInTheDocument()
  if (archived) expect(screen.getByText('Archiviertes Deck')).toBeInTheDocument()
  else expect(screen.queryByText('Archiviertes Deck')).not.toBeInTheDocument()
  if (!actions.length) expect(screen.queryByRole('button', { name: 'Deckaktionen' })).not.toBeInTheDocument()
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Deckaktionen' }))
    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(actions)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  }
  await changeDeck('Renamed')
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('Renamed wurde gespeichert.')
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Renamed' })
})
test('activating a locked field shows the top notice without changing the draft', async () => {
  const api = deckApi([{ ...deck, everUsed: true }]); showDeckApp(); await editDeck()
  fireEvent.click(screen.getByRole('button', { name: 'Commander ändern (gesperrt)' }))
  expect(await screen.findByText('Feld gesperrt – dieses Deck wurde bereits gespielt.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Pauper Commander' }))
  expect(screen.getByRole('radio', { name: 'Commander' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Companion hinzufügen/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled()
  expect(api.writes()).toHaveLength(0)
})
test.each([
  ['Archivieren', true, 'Deck archivieren?', 'Deck archivieren', 'archiviert'],
  ['Löschen', false, 'Deck löschen?', 'Deck löschen', 'gelöscht'],
] as const)('%s confirmation restores focus when canceled and waits for acknowledgement', async (action, everUsed, title, confirmName, verb) => {
  const api = deckApi([{ ...deck, everUsed }]); showDeckApp(); await editDeck()
  const dialog = await menuAction(action)
  expect(dialog).toHaveAccessibleName(title)
  expect(dialog).not.toHaveAccessibleDescription(expect.stringContaining('Ungespeicherte'))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Deckaktionen' })).toHaveFocus())
  expect(api.writes()).toHaveLength(0)
  const pending = deferred()
  const path = `/api/decks/${deck.id}${action === 'Archivieren' ? '/archive' : ''}`
  api.next(path, () => pending.promise, action === 'Archivieren' ? 'POST' : 'DELETE')
  await menuAction(action)
  const confirm = screen.getByRole('button', { name: confirmName })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(api.writes()[0]).toEqual([path, { credentials: 'same-origin', signal: expect.any(AbortSignal), method: action === 'Archivieren' ? 'POST' : 'DELETE', headers: { 'X-CSRF-TOKEN': 'deck-token' } }])
  api.state.decks = action === 'Archivieren' ? [{ ...deck, everUsed, archived: true }] : []
  await act(async () => pending.resolve(action === 'Archivieren' ? response(api.state.decks[0]) : new Response(null, { status: 204 })))
  await screen.findByText(`${deck.name} wurde ${verb}.`)
  expect(window.location.pathname).toBe('/decks')
  if (action === 'Archivieren') expect(await screen.findByText('Keine aktiven Decks vorhanden.')).toBeInTheDocument()
  else expect(await screen.findByText(/Noch keine Decks vorhanden/)).toBeInTheDocument()
})
test('an unused archived deck can still be deleted', async () => {
  const api = deckApi([{ ...deck, archived: true }]); showDeckApp(); await editDeck()
  await menuAction('Löschen'); fireEvent.click(screen.getByRole('button', { name: 'Deck löschen' }))
  await screen.findByText(`${deck.name} wurde gelöscht.`)
  expect(api.writes().map(([path, init]) => [path, init?.method])).toEqual([[`/api/decks/${deck.id}`, 'DELETE']])
})
test.each([403, 404, 500])('archival failure %s never claims success', async status => {
  const api = deckApi([{ ...deck, everUsed: true }]); showDeckApp(); await editDeck()
  api.next(`/api/decks/${deck.id}/archive`, () => response({ detail: 'Lifecycle operation rejected.' }, status), 'POST')
  await menuAction('Archivieren'); fireEvent.click(screen.getByRole('button', { name: 'Deck archivieren' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.queryByText(`${deck.name} wurde archiviert.`)).not.toBeInTheDocument()
  expect(screen.getByRole('banner')).toBeInTheDocument()
  if (status === 403 || status === 404) {
    // Protected fields stay hidden until the deck is opened afresh.
    await screen.findByText(/nicht mehr verfügbar/)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  } else {
    await screen.findByText('Archivieren fehlgeschlagen')
    expect(screen.getByRole('alert')).toHaveTextContent('Lifecycle operation rejected.')
    expect(screen.getByRole('textbox', { name: /Deckname/ })).toBeInTheDocument()
  }
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(api.writes()).toHaveLength(1)
})
test('a delete conflict refreshes permanent usage, keeps the local name and locks gameplay fields', async () => {
  const api = deckApi(); showDeckApp(); await editDeck(); await changeDeck('My draft')
  api.next(`/api/decks/${deck.id}`, () => {
    api.state.decks = [{ ...deck, everUsed: true, colorIdentity: ['W'] }]
    return response({ detail: 'Deck is now used.' }, 409)
  }, 'DELETE')
  await menuAction('Löschen'); fireEvent.click(screen.getByRole('button', { name: 'Deck löschen' }))
  await screen.findByText('Deck wurde zwischenzeitlich geändert')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('alert')).toHaveTextContent('Deck is now used.')
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('My draft')
  expect(screen.getByRole('button', { name: 'Commander ändern (gesperrt)' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Deckaktionen' }))
  expect((await screen.findAllByRole('menuitem')).map(item => item.textContent)).toEqual(['Archivieren'])
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('My draft wurde gespeichert.')
  expect(JSON.parse(api.writes()[1][1]!.body as string)).toEqual({ name: 'My draft' })
})
test('dirty archival warns that changes are discarded, keeps them on cancel and returns without opening the archive', async () => {
  const used = { ...deck, everUsed: true }
  const api = deckApi([used]); showDeckApp('/decks')
  await editDeck()
  await changeDeck('Ungespeicherte Umbenennung')
  const listCount = () => api.fetchMock.mock.calls.filter(([path, init]) => path === '/api/decks' && !init?.method).length
  const loadedLists = listCount()
  const dialog = await menuAction('Archivieren')
  expect(dialog).toHaveAccessibleName('Deck archivieren?')
  expect(dialog).toHaveAccessibleDescription(expect.stringContaining('Ungespeicherte Änderungen werden verworfen.'))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus())
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Deckaktionen' })).toHaveFocus())
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('Ungespeicherte Umbenennung')
  expect(api.writes()).toHaveLength(0)

  const pending = deferred()
  api.next(`/api/decks/${deck.id}/archive`, () => pending.promise, 'POST')
  await menuAction('Archivieren')
  const confirm = screen.getByRole('button', { name: 'Deck archivieren' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(listCount()).toBe(loadedLists)
  expect(screen.queryByText(`${deck.name} wurde archiviert.`)).not.toBeInTheDocument()

  api.state.decks = [{ ...used, archived: true }]
  await act(async () => pending.resolve(response(api.state.decks[0])))
  await screen.findByRole('heading', { name: 'Meine Decks' })
  await screen.findByText(`${deck.name} wurde archiviert.`)
  expect(await screen.findByRole('button', { name: 'Archivierte Decks', expanded: false })).toBeInTheDocument()
  expect(screen.queryByText('Ungespeicherte Umbenennung')).not.toBeInTheDocument()
  expect(listCount()).toBe(loadedLists + 1)
  expect(api.writes()).toHaveLength(1)
})
