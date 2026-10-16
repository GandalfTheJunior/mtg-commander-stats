import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import DeckManager from './DeckManager'

const deck = {
  id: 'd7c6daac-d72f-49b2-9c10-cb7c653ededa',
  name: 'Atraxa Superfriends',
  everUsed: false, archived: false,
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

test('waits for the initial list before allowing creation and keeps both confirmed decks', async () => {
  let resolveList!: (response: Response) => void
  const initialList = new Promise<Response>((resolve) => { resolveList = resolve })
  const created = { ...deck, id: 'new-deck', name: 'New deck' }
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(initialList)
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(jsonResponse(created, 201))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)

  expect(screen.getByText('Loading your decks…')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create deck' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Deck name')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  expect(screen.queryByText('You have no decks yet.')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)

  await act(async () => { resolveList(jsonResponse([deck])) })
  expect(await screen.findByText(deck.name)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: created.name } })
  fireEvent.change(screen.getByLabelText('Commander'), { target: { value: created.commander } })
  fireEvent.click(screen.getByRole('button', { name: 'Create deck' }))

  expect(await screen.findByText('New deck created.')).toBeInTheDocument()
  expect(screen.getByText(created.name)).toBeInTheDocument()
  expect(screen.getByText(deck.name)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test.each(['server', 'network'])('initial %s failure leaves the collection unknown and prevents mutations', async (failure) => {
  const fetchMock = vi.fn()
  if (failure === 'server') {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Could not load your decks.' }, 500))
  } else {
    fetchMock.mockRejectedValueOnce(new Error('Could not load your decks.'))
  }
  vi.stubGlobal('fetch', fetchMock)
  const onUnauthorized = vi.fn()
  render(<DeckManager onUnauthorized={onUnauthorized} />)

  expect(await screen.findByText('Could not load your decks.')).toBeInTheDocument()
  expect(screen.getByText('Your deck list is unavailable. Reload the page to try again.')).toBeInTheDocument()
  expect(screen.queryByText('Loading your decks…')).not.toBeInTheDocument()
  expect(screen.queryByText('You have no decks yet.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create deck' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Deck name')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(onUnauthorized).not.toHaveBeenCalled()
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

test.each([false, true])('deletes a deck with CSRF and focuses success feedback (surviving deck: %s)', async (hasSurvivor) => {
  const other = { ...deck, id: 'other', name: 'Other deck' }
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(hasSurvivor ? [deck, other] : [deck]))
    .mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(deck.name)).closest('li')!

  const trigger = within(item).getByRole('button', { name: 'Delete' })
  trigger.focus()
  fireEvent.click(trigger)
  const confirm = within(item).getByRole('button', { name: 'Confirm deletion' })
  confirm.focus()
  fireEvent.click(confirm)

  expect(await screen.findByRole('status')).toHaveTextContent('Atraxa Superfriends deleted.')
  expect(screen.getByRole('status')).toHaveFocus()
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(trigger).not.toBeInTheDocument()
  if (hasSurvivor) expect(screen.getByText(other.name)).toBeInTheDocument()
  else expect(screen.getByText('You have no decks yet.')).toBeInTheDocument()
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
  fireEvent.click(within(item).getByRole('button', { name: 'Confirm deletion' }))
  expect(await screen.findByText('Delete failed.')).toBeInTheDocument()
  expect(within(item).getByRole('button', { name: 'Confirm deletion' })).toBeEnabled()
  expect(within(item).getByRole('button', { name: 'Cancel deletion' })).toBeEnabled()
  expect(within(item).getByText(deck.name)).toBeInTheDocument()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
})


test.each([0, 1])('opening and canceling deletion focuses the selected confirmation and original trigger (deck index: %s)', async (index) => {
  const other = { ...deck, id: 'other', name: 'Other deck' }
  const selected = [deck, other][index]
  const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([deck, other]))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(selected.name)).closest('li')!
  const trigger = within(item).getByRole('button', { name: 'Delete' })
  trigger.focus()
  fireEvent.click(trigger)
  const confirmation = screen.getByRole('group', { name: `Delete ${selected.name}?` })
  expect(confirmation).toHaveFocus()
  expect(trigger).toBeDisabled()
  expect(within(confirmation).getByText(/cannot be undone/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const cancel = within(confirmation).getByRole('button', { name: 'Cancel deletion' })
  cancel.focus()
  fireEvent.click(cancel)
  expect(screen.queryByRole('group', { name: `Delete ${selected.name}?` })).not.toBeInTheDocument()
  expect(trigger).toBeEnabled()
  expect(trigger).toHaveFocus()
  expect(screen.getByText(deck.name)).toBeInTheDocument()
  expect(screen.getByText(other.name)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test.each(['server', 'network'])('deletion %s failure restores confirmation focus and allows retry or cancel', async (failure) => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse([deck]))
    .mockResolvedValueOnce(csrfResponse())
  if (failure === 'server') {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Delete failed.' }, 500))
  } else {
    fetchMock.mockRejectedValueOnce(new Error('Delete failed.'))
  }
  fetchMock.mockResolvedValueOnce(csrfResponse())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(deck.name)).closest('li')!
  fireEvent.click(within(item).getByRole('button', { name: 'Delete' }))
  const confirmation = screen.getByRole('group', { name: `Delete ${deck.name}?` })
  const confirm = within(confirmation).getByRole('button', { name: 'Confirm deletion' })
  confirm.focus()
  fireEvent.click(confirm)

  expect(await screen.findByRole('status')).toHaveTextContent('Delete failed.')
  expect(confirmation).toHaveFocus()
  expect(confirm).toBeEnabled()
  expect(within(confirmation).getByRole('button', { name: 'Cancel deletion' })).toBeEnabled()
  expect(within(item).getByText(deck.name)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(3)

  confirm.focus()
  fireEvent.click(confirm)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${deck.name} deleted.`))
  expect(screen.getByRole('status')).toHaveFocus()
  expect(fetchMock).toHaveBeenCalledTimes(5)
})


test('confirmation sends exactly one selected DELETE and retains both decks until acknowledgement', async () => {
  const other = { ...deck, id: 'other', name: 'Other deck' }
  let resolveDelete!: (response: Response) => void
  const pendingDelete = new Promise<Response>((resolve) => { resolveDelete = resolve })
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse([deck, other]))
    .mockResolvedValueOnce(csrfResponse())
    .mockReturnValueOnce(pendingDelete)
  vi.stubGlobal('fetch', fetchMock)
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const item = (await screen.findByText(deck.name)).closest('li')!
  fireEvent.click(within(item).getByRole('button', { name: 'Delete' }))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const confirm = within(item).getByRole('button', { name: 'Confirm deletion' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  expect(screen.getByRole('group', { name: `Delete ${deck.name}?` })).toHaveFocus()
  expect(fetchMock).toHaveBeenLastCalledWith(`/api/decks/${deck.id}`, {
    credentials: 'same-origin', method: 'DELETE', headers: { 'X-CSRF-TOKEN': 'deck-token' },
  })
  expect(screen.getByText(deck.name)).toBeInTheDocument()
  expect(screen.getByText(other.name)).toBeInTheDocument()
  await act(async () => { resolveDelete(new Response(null, { status: 204 })) })
  await screen.findByText(`${deck.name} deleted.`)
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(screen.getByText(other.name)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
