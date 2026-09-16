import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import DeckManager from './DeckManager'

const deck = {
  id: 'd7c6daac-d72f-49b2-9c10-cb7c653ededa',
  name: 'Atraxa Superfriends',
  commander: "Atraxa, Praetors' Voice",
  colorIdentity: ['W', 'U', 'B', 'G'],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function csrfResponse() {
  return jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'deck-token' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('creates a deck with the selected colors and updates the visible list', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(jsonResponse(deck, 201))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  await screen.findByText('You have no decks yet.')

  fireEvent.change(screen.getByLabelText('Deck name'), {
    target: { value: deck.name },
  })
  fireEvent.change(screen.getByLabelText('Commander'), {
    target: { value: deck.commander },
  })
  fireEvent.click(screen.getByLabelText('W'))
  fireEvent.click(screen.getByLabelText('U'))
  fireEvent.click(screen.getByLabelText('B'))
  fireEvent.click(screen.getByLabelText('G'))
  fireEvent.click(screen.getByRole('button', { name: 'Create deck' }))

  expect(await screen.findByText('Atraxa Superfriends created.')).toBeInTheDocument()
  expect(screen.getByText(/Color identity: WUBG/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/csrf', {
    credentials: 'same-origin',
  })
  expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/decks', {
    credentials: 'same-origin',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': 'deck-token',
    },
    body: JSON.stringify({
      name: deck.name,
      commander: deck.commander,
      colorIdentity: ['W', 'U', 'B', 'G'],
    }),
  })
})

test('surfaces creation failure without adding a deck', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(jsonResponse({ detail: 'Deck details are invalid.' }, 400))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  await screen.findByText('You have no decks yet.')

  fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: 'Bad deck' } })
  fireEvent.change(screen.getByLabelText('Commander'), { target: { value: 'Unknown' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create deck' }))

  expect(await screen.findByText('Deck details are invalid.')).toBeInTheDocument()
  expect(screen.getByText('You have no decks yet.')).toBeInTheDocument()
  expect(screen.queryByText('Bad deck created.')).not.toBeInTheDocument()
})

test('edits a deck with CSRF and renders the server-confirmed result', async () => {
  const updated = {
    ...deck,
    name: 'Atraxa Planeswalkers',
    colorIdentity: ['W', 'U'],
  }
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse([deck]))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(jsonResponse(updated))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(deck.name)).closest('li')!

  fireEvent.click(within(item).getByRole('button', { name: 'Edit' }))
  fireEvent.change(within(item).getByLabelText('Deck name'), {
    target: { value: updated.name },
  })
  fireEvent.click(within(item).getByLabelText('B'))
  fireEvent.click(within(item).getByLabelText('G'))
  fireEvent.click(within(item).getByRole('button', { name: 'Save deck' }))

  expect(await screen.findByText('Atraxa Planeswalkers updated.')).toBeInTheDocument()
  expect(screen.getByText('Atraxa Planeswalkers')).toBeInTheDocument()
  expect(screen.getByText('Color identity: WU')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/decks/${deck.id}`, {
    credentials: 'same-origin',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': 'deck-token',
    },
    body: JSON.stringify({
      name: updated.name,
      commander: deck.commander,
      colorIdentity: ['W', 'U'],
    }),
  })
})

test('deletes a deck with CSRF after the server confirms success', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse([deck]))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(deck.name)).closest('li')!

  fireEvent.click(within(item).getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('Atraxa Superfriends deleted.')).toBeInTheDocument()
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/decks/${deck.id}`, {
    credentials: 'same-origin',
    method: 'DELETE',
    headers: { 'X-CSRF-TOKEN': 'deck-token' },
  })
})

test('failed edit and delete keep the confirmed deck state visible', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse([deck]))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(jsonResponse({ detail: 'Update failed.' }, 500))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(jsonResponse({ detail: 'Delete failed.' }, 500))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(deck.name)).closest('li')!

  fireEvent.click(within(item).getByRole('button', { name: 'Edit' }))
  fireEvent.change(within(item).getByLabelText('Deck name'), {
    target: { value: 'Unconfirmed name' },
  })
  fireEvent.click(within(item).getByRole('button', { name: 'Save deck' }))
  expect(await screen.findByText('Update failed.')).toBeInTheDocument()
  fireEvent.click(within(item).getByRole('button', { name: 'Cancel' }))
  expect(within(item).getByText(deck.name)).toBeInTheDocument()

  fireEvent.click(within(item).getByRole('button', { name: 'Delete' }))
  expect(await screen.findByText('Delete failed.')).toBeInTheDocument()
  expect(within(item).getByText(deck.name)).toBeInTheDocument()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
})
