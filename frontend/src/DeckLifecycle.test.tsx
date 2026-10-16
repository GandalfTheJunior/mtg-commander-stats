import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import DeckManager from './DeckManager'
import { deckFor, deferred, response } from './test/gameFixtures'

const used = { ...deckFor(2), everUsed: true, archived: false }
function setup(deck = used) {
  const fetchMock = vi.fn().mockResolvedValueOnce(response([deck]))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const csrf = () => response({ headerName: 'X-CSRF-TOKEN', token: 'lifecycle-token' })
afterEach(() => vi.unstubAllGlobals())

test('used decks permanently lock commander/colors and still send their immutable fields when renamed', async () => {
  const api = setup()
  api.mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response({ ...used, name: 'Renamed used deck' }))
  render(<DeckManager onUnauthorized={vi.fn()} />)
  const card = (await screen.findByText(used.name)).closest('li')!
  expect(within(card).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
  expect(within(card).getByLabelText('Commander')).toHaveAttribute('readonly')
  expect(within(card).getByLabelText('R')).toBeDisabled()
  expect(within(card).getByText(/permanently locked/)).toBeInTheDocument()
  fireEvent.change(within(card).getByLabelText('Deck name'), { target: { value: 'Renamed used deck' } })
  fireEvent.click(within(card).getByRole('button', { name: 'Save deck' }))
  await screen.findByText('Renamed used deck updated.')
  expect(JSON.parse(api.mock.calls[2][1].body)).toEqual({ name: 'Renamed used deck', commander: used.commander, colorIdentity: ['R'] })
})

test('archival is explicit, cancel restores focus without writing, and confirmed state waits for acknowledgment', async () => {
  const api = setup()
  const pending = deferred()
  api.mockResolvedValueOnce(csrf()).mockReturnValueOnce(pending.promise)
  const changed = vi.fn()
  render(<DeckManager onUnauthorized={vi.fn()} onChanged={changed} />)
  const trigger = await screen.findByRole('button', { name: 'Archive' })
  fireEvent.click(trigger)
  expect(screen.getByRole('group', { name: `Archive ${used.name}?` })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel archival' }))
  expect(trigger).toHaveFocus()
  expect(api).toHaveBeenCalledTimes(1)
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archival' }))
  await screen.findByRole('button', { name: 'Archiving…' })
  expect(screen.queryByText('Archived — unavailable for new games')).not.toBeInTheDocument()
  expect(changed).not.toHaveBeenCalled()
  await act(async () => pending.resolve(response({ ...used, archived: true })))
  await screen.findByText(`${used.name} archived.`)
  expect(screen.getByText('Archived — unavailable for new games')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /unarchive/i })).not.toBeInTheDocument()
  expect(api.mock.calls[2][0]).toBe(`/api/decks/${used.id}/archive`)
  expect(api.mock.calls[2][1]).toEqual({ credentials: 'same-origin', method: 'POST', headers: { 'X-CSRF-TOKEN': 'lifecycle-token' } })
  expect(changed).toHaveBeenCalledOnce()
})

test.each([403, 409, 500])('failed archival (%s) reports failure and offers authoritative refresh', async (status) => {
  const api = setup()
  api.mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response({ detail: 'Lifecycle operation rejected.' }, status))
    .mockResolvedValueOnce(response([{ ...used, archived: true }]))
  const changed = vi.fn(); const unauthorized = vi.fn()
  render(<DeckManager onUnauthorized={unauthorized} onChanged={changed} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archival' }))
  await screen.findByText('Lifecycle operation rejected.')
  expect(screen.queryByText(`${used.name} archived.`)).not.toBeInTheDocument()
  expect(changed).not.toHaveBeenCalled()
  expect(unauthorized).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh decks' }))
  await screen.findByText('Archived — unavailable for new games')
})

test('a stale unused deck conflict refreshes to permanent used state rather than enabling forbidden edits', async () => {
  const api = setup({ ...used, everUsed: false })
  api.mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response({ detail: 'Deck is now used.' }, 409))
    .mockResolvedValueOnce(response([used]))
  render(<DeckManager onUnauthorized={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
  await screen.findByText('Deck is now used.')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh decks' }))
  await screen.findByRole('button', { name: 'Archive' })
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
})

test.each([false, true])('archival 401 expires only a still-current view (retired=%s)', async (retired) => {
  const api = setup(); const pending = deferred(); const unauthorized = vi.fn()
  api.mockResolvedValueOnce(csrf()).mockReturnValueOnce(pending.promise)
  const view = render(<DeckManager onUnauthorized={unauthorized} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archival' }))
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3))
  if (retired) view.unmount()
  await act(async () => pending.resolve(response({}, 401)))
  expect(unauthorized).toHaveBeenCalledTimes(retired ? 0 : 1)
})
