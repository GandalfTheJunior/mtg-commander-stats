import { savedCommander } from './test/commanderFixtures'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { changeDeck, deck, deckApi, editDeck, menuAction, showDeckApp } from './test/deckFixtures'
import { deferred, response } from './test/gameFixtures'

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })
test.each([
  [false, false, 'Löschen'], [true, false, 'Archivieren'], [true, true, null], [false, true, 'Löschen'],
] as const)('lifecycle used=%s archived=%s allows exactly %s and correct editable fields', async (everUsed, archived, action) => {
  const api = deckApi([{ ...deck, everUsed, archived, colorIdentity: ['R'], commanders: [savedCommander('Karn', ['R'])] }]); showDeckApp(); await editDeck()
  expect(screen.getByRole('combobox', { name: /Commander/ })).toHaveProperty('readOnly', everUsed)
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toHaveAttribute('aria-pressed', 'true')
  if (!action) expect(screen.queryByRole('button', { name: 'Deckaktionen' })).not.toBeInTheDocument()
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Deckaktionen' }))
    expect(await screen.findAllByRole('menuitem')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: action })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  }
  await changeDeck('Renamed')
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('Renamed wurde gespeichert.')
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Renamed' })
})
test.each([false, true])('named destructive confirmation restores focus when canceled and waits for acknowledgement (used=%s)', async everUsed => {
  const api = deckApi([{ ...deck, everUsed }]); showDeckApp(); await editDeck()
  const action = everUsed ? 'Archivieren' : 'Löschen'
  const dialog = await menuAction(action)
  expect(dialog).toHaveAccessibleName(`${deck.name}: ${action}?`)
  expect(dialog).not.toHaveAccessibleDescription(expect.stringContaining('ungespeicherte'))
  expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Deckaktionen' })).toHaveFocus())
  expect(api.writes()).toHaveLength(0)
  const pending = deferred()
  const path = `/api/decks/${deck.id}${everUsed ? '/archive' : ''}`
  api.next(path, () => pending.promise, everUsed ? 'POST' : 'DELETE')
  await menuAction(action)
  const confirm = screen.getByRole('button', { name: `${action} bestätigen` })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(api.writes()[0]).toEqual([path, { credentials: 'same-origin', signal: expect.any(AbortSignal), method: everUsed ? 'POST' : 'DELETE', headers: { 'X-CSRF-TOKEN': 'deck-token' } }])
  api.state.decks = everUsed ? [{ ...deck, everUsed, archived: true }] : []
  await act(async () => pending.resolve(everUsed ? response(api.state.decks[0]) : new Response(null, { status: 204 })))
  await screen.findByText(`${deck.name} wurde ${everUsed ? 'archiviert' : 'gelöscht'}.`)
  expect(window.location.pathname).toBe('/decks')
  if (everUsed) expect(await screen.findByText(/Archiviert – für neue Spiele/)).toBeInTheDocument()
  else expect(await screen.findByText('Noch keine Decks.')).toBeInTheDocument()
})
test.each([403, 404, 409, 500])('archival denial %s never claims success and requires authoritative recovery', async status => {
  const api = deckApi([{ ...deck, everUsed: true }]); showDeckApp(); await editDeck()
  api.next(`/api/decks/${deck.id}/archive`, () => response({ detail: 'Lifecycle operation rejected.' }, status), 'POST')
  await menuAction('Archivieren'); fireEvent.click(screen.getByRole('button', { name: 'Archivieren bestätigen' }))
  await screen.findByText(/Lifecycle operation rejected/)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.queryByText(`${deck.name} wurde archiviert.`)).not.toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
  if (status === 403 || status === 404) expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  if (status !== 409) fireEvent.click(screen.getByRole('button', { name: 'Serverstand erneut prüfen' }))
  await screen.findByRole('button', { name: 'Serverstand geprüft – Entwurf weiter bearbeiten' })
  expect(api.writes()).toHaveLength(1)
})
test('unused delete conflict refreshes permanent usage, preserving local name and requiring explicit review', async () => {
  const api = deckApi(); showDeckApp(); await editDeck(); await changeDeck('My draft', 'Draft commander')
  api.next(`/api/decks/${deck.id}`, () => {
    api.state.decks = [{ ...deck, everUsed: true, colorIdentity: ['W'] }]
    return response({ detail: 'Deck is now used.' }, 409)
  }, 'DELETE')
  await menuAction('Löschen'); fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
  await screen.findByText(/Konflikt:/)
  await screen.findByRole('button', { name: 'Serverstand geprüft – Entwurf weiter bearbeiten' })
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('My draft')
  expect(screen.getByText(/Dein Entwurf: My draft · Draft commander/)).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: /Commander/ })).toHaveValue('Karn')
  fireEvent.click(screen.getByRole('button', { name: 'Serverstand geprüft – Entwurf weiter bearbeiten' }))
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('My draft wurde gespeichert.')
  expect(JSON.parse(api.writes()[1][1]!.body as string)).toEqual({ name: 'My draft' })
})

test.each(['/dashboard', '/decks'] as const)('dirty archival explicitly discards the rename and returns to fresh %s only after acknowledgement', async origin => {
  const used = { ...deck, everUsed: true }
  const api = deckApi([used]); showDeckApp(origin)
  if (origin === '/dashboard') {
    fireEvent.click(await screen.findByRole('button', { name: deck.name }))
    await screen.findByRole('textbox', { name: /Deckname/ })
  } else await editDeck()
  await changeDeck('Ungespeicherte Umbenennung')
  const listCount = () => api.fetchMock.mock.calls.filter(([path, init]) => path === '/api/decks' && !init?.method).length
  const loadedLists = listCount()
  const dialog = await menuAction('Archivieren')
  expect(dialog).toHaveAccessibleName(`${deck.name}: Archivieren?`)
  expect(dialog).toHaveAccessibleDescription(expect.stringContaining('Deine ungespeicherte Änderung am Decknamen wird verworfen und nicht gespeichert.'))
  expect(within(dialog).getByRole('button', { name: 'Änderung verwerfen und archivieren' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Archivieren bestätigen' })).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Deckaktionen' })).toHaveFocus())
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('Ungespeicherte Umbenennung')
  expect(api.writes()).toHaveLength(0)

  const pending = deferred()
  api.next(`/api/decks/${deck.id}/archive`, () => pending.promise, 'POST')
  await menuAction('Archivieren')
  const confirm = screen.getByRole('button', { name: 'Änderung verwerfen und archivieren' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(api.writes()[0]).toEqual([`/api/decks/${deck.id}/archive`, {
    credentials: 'same-origin', signal: expect.any(AbortSignal), method: 'POST', headers: { 'X-CSRF-TOKEN': 'deck-token' },
  }])
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(listCount()).toBe(loadedLists)
  expect(screen.queryByText(`${deck.name} wurde archiviert.`)).not.toBeInTheDocument()

  api.state.decks = [{ ...used, archived: true }]
  await act(async () => pending.resolve(response(api.state.decks[0])))
  await screen.findByRole('heading', { name: origin === '/dashboard' ? 'Dashboard' : 'Meine Decks' })
  await screen.findByText(`${deck.name} wurde archiviert.`)
  if (origin === '/dashboard') {
    expect(await screen.findByRole('button', { name: deck.name })).toHaveAccessibleDescription(expect.stringContaining('Archiviert'))
  } else {
    expect(await screen.findByRole('button', { name: `${deck.name} bearbeiten` })).toBeInTheDocument()
    expect(screen.getByText(/Archiviert – für neue Spiele/)).toBeInTheDocument()
  }
  expect(window.location.pathname).toBe(origin)
  expect(screen.queryByText('Ungespeicherte Umbenennung')).not.toBeInTheDocument()
  expect(listCount()).toBe(loadedLists + 1)
  expect(api.writes()).toHaveLength(1)
})
