import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { changeDeck, deck, deckApi, editDeck, menuAction, showDeckApp } from './test/deckFixtures'
import { deferred, response } from './test/gameFixtures'

const url = 'https://manabox.app/decks/Synthetic-Mixed_123'
const replacement = `${url}-New/`
const field = () => screen.getByRole('textbox', { name: 'ManaBox-Link' })
const change = (value: string) => fireEvent.change(field(), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test.each(['', url])('creates and reopens a deck with optional link %j, preserving input through Commander selection', async value => {
  const api = deckApi(); showDeckApp('/decks/new')
  await screen.findByRole('textbox', { name: 'ManaBox-Link' })
  expect(field()).toHaveValue('')
  change(value)
  await changeDeck('New deck', 'Karn')
  expect(field()).toHaveValue(value)
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await screen.findByText('New deck wurde erstellt.')
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'New deck', commanders: [{ selectionRef: deck.commanders[0].selectionRef }],
    ...(value ? { manaBoxUrl: value } : {}) })
  await editDeck('New deck')
  expect(field()).toHaveValue(value)
})

test.each([{ everUsed: false, archived: false }, { everUsed: true, archived: false }, { everUsed: true, archived: true }])('replace, clear and preserve links with lifecycle %j without provider reads', async lifecycle => {
  const original = { ...deck, ...lifecycle, manaBoxUrl: url }
  const api = deckApi([original]); showDeckApp(); await editDeck()
  expect(field()).toHaveValue(url)
  expect(field()).toBeEnabled()
  if (lifecycle.everUsed) expect(screen.getByRole('combobox', { name: /Commander/ })).toHaveAttribute('readonly')
  change(replacement); save()
  await screen.findByText('Alpha wurde gespeichert.')
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: deck.name, manaBoxUrl: replacement })
  expect(api.state.decks[0]).toEqual({ ...original, manaBoxUrl: replacement })
  await editDeck(); await changeDeck('Renamed'); save()
  await screen.findByText('Renamed wurde gespeichert.')
  expect(JSON.parse(api.writes()[1][1]!.body as string)).toEqual({ name: 'Renamed' })
  await editDeck('Renamed'); change(''); save()
  await screen.findByText('Renamed wurde gespeichert.')
  expect(JSON.parse(api.writes()[2][1]!.body as string)).toEqual({ name: 'Renamed', manaBoxUrl: null })
  await editDeck('Renamed'); expect(field()).toHaveValue('')
  expect(api.fetchMock.mock.calls.some(([path]) => path.includes('scryfall'))).toBe(false)
})

test.each([' ', 'https://evil.test/decks/id'])('invalid nonempty %j is correctable feedback, never a clear operation', async value => {
  const api = deckApi([{ ...deck, manaBoxUrl: url }]); showDeckApp(); await editDeck(); change(value); save()
  expect(field()).toHaveAccessibleDescription(/gültigen ManaBox-Link/)
  expect(field()).toHaveFocus()
  expect(field()).toHaveValue(value)
  expect(api.writes()).toHaveLength(0)
  change(replacement); save(); await screen.findByText('Alpha wurde gespeichert.')
})

test('server 400 attaches correctable feedback without navigation or draft loss', async () => {
  const api = deckApi(); showDeckApp(); await editDeck(); change(url)
  api.next(`/api/decks/${deck.id}`, () => response({ detail: 'Invalid ManaBox URL.' }, 400), 'PUT')
  save(); await screen.findByRole('alert')
  expect(field()).toHaveAccessibleDescription(/Bitte den ManaBox-Link prüfen.*Invalid ManaBox URL/)
  expect(field()).toHaveValue(url)
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  change(replacement); save(); await screen.findByText('Alpha wurde gespeichert.')
})

test('link-only draft guards cancellation, reverts cleanly, and discard leaves the saved link intact', async () => {
  const api = deckApi([{ ...deck, manaBoxUrl: url }]); showDeckApp(); await editDeck(); change(replacement)
  const warning = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }
  expect(warning()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Im Editor bleiben' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(field()).toHaveValue(replacement)
  change(url); expect(warning()).toBe(false)
  change(''); fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Verwerfen und verlassen' }))
  await editDeck(); expect(field()).toHaveValue(url)
  expect(api.writes()).toHaveLength(0)
})

test('archive warns about and discards an unsaved link only after explicit confirmation', async () => {
  const api = deckApi([{ ...deck, everUsed: true, manaBoxUrl: url }]); showDeckApp(); await editDeck(); change(replacement)
  const dialog = await menuAction('Archivieren')
  expect(dialog).toHaveAccessibleDescription(expect.stringContaining('Alle ungespeicherten Änderungen'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Änderungen verwerfen und archivieren' }))
  await screen.findByText('Alpha wurde archiviert.')
  expect(api.state.decks[0]).toMatchObject({ manaBoxUrl: url, archived: true })
  expect(api.writes()).toHaveLength(1)
})

test.each(['network', 409] as const)('uncertain/conflicting %s preserves a link draft when gameplay becomes locked and requires explicit reconciliation', async failure => {
  const api = deckApi([{ ...deck, manaBoxUrl: url }]); showDeckApp(); await editDeck(); change(replacement)
  api.next(`/api/decks/${deck.id}`, () => {
    api.state.decks = [{ ...deck, everUsed: true, manaBoxUrl: url }]
    if (failure === 'network') throw new Error('Unconfirmed write')
    return response({ detail: 'Concurrent deck use.' }, 409)
  }, 'PUT')
  save()
  if (failure === 'network') { await screen.findByText(/Kein Erfolg bestätigt/); fireEvent.click(screen.getByRole('button', { name: 'Serverstand erneut prüfen' })) }
  await screen.findByRole('button', { name: 'Serverstand geprüft – Entwurf weiter bearbeiten' })
  expect(screen.getByText(`ManaBox-Link im Entwurf: ${replacement}`)).toBeInTheDocument()
  expect(screen.getByText(`ManaBox-Link auf dem Server: ${url}`)).toBeInTheDocument()
  expect(field()).toBeDisabled()
  expect(api.writes()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Serverstand geprüft – Entwurf weiter bearbeiten' }))
  expect(field()).toHaveValue(replacement)
  save(); await screen.findByText('Alpha wurde gespeichert.')
  expect(JSON.parse(api.writes()[1][1]!.body as string)).toEqual({ name: deck.name, manaBoxUrl: replacement })
})

test('a pending link save protects input and sends one write across repeated submissions', async () => {
  const api = deckApi(), pending = deferred(); showDeckApp(); await editDeck(); change(url)
  api.next(`/api/decks/${deck.id}`, () => pending.promise, 'PUT')
  const form = screen.getByRole('form'); fireEvent.submit(form); fireEvent.submit(form)
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(field()).toBeDisabled()
  await act(async () => pending.resolve(response({ ...deck, manaBoxUrl: url })))
  await screen.findByText('Alpha wurde gespeichert.')
})
