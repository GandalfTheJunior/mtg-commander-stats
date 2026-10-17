import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { deck, deckApi, editDeck, newDeck, showDeckApp } from './test/deckFixtures'
import { deferred, response, uid } from './test/gameFixtures'

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })
test('overview has no embedded forms or destructive controls, and opens exactly the selected deck', async () => {
  deckApi([deck, { ...deck, id: uid(103), name: 'Other' }]); showDeckApp()
  await screen.findByText(deck.name)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  await editDeck('Other')
  expect(window.location.pathname).toBe(`/decks/${uid(103)}/edit`)
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('Other')
})
test.each([401, 500, 'network'] as const)('initial list failure %s keeps unknown collection hidden and sends no mutation', async status => {
  const api = deckApi(); api.next('/api/decks', () => {
    if (status === 'network') throw new Error('offline')
    return response({}, status)
  }); showDeckApp()
  await screen.findByText(status === 401 ? 'Your session expired. Sign in again.' : /Deine Deckliste ist nicht verfügbar/)
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(api.writes()).toHaveLength(0)
})
test('an initial pending list never exposes unconfirmed deck data; retirement aborts it', async () => {
  const api = deckApi(), pending = deferred(); api.next('/api/decks', () => pending.promise)
  showDeckApp(); await screen.findByText('Decks werden geladen…')
  const signal = api.fetchMock.mock.calls.find(([path]) => path === '/api/decks')![1]!.signal!
  await newDeck()
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(response([{ ...deck, name: 'Retired' }])))
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
})
test('refresh discards a retired list and accepts only fresh server decks', async () => {
  const api = deckApi(); showDeckApp(); await screen.findByText(deck.name)
  api.state.decks = [{ ...deck, name: 'Fresh' }]
  fireEvent.click(screen.getByRole('button', { name: 'Decks aktualisieren' }))
  await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument())
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
})
