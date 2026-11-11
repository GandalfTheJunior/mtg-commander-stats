import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import SavedDeckCard from './SavedDeckCard'
import type { SavedCompanion } from './api'
import { savedCommander } from './test/commanderFixtures'
import { deck, deckApi, showDeckApp } from './test/deckFixtures'
import { AppThemeProvider } from './theme/AppThemeProvider'

const first = { ...savedCommander("Kraum, Ludevic's Opus", ['U', 'R']), artCropUrl: 'https://cards.scryfall.io/art_crop/front/kraum.jpg', artist: 'First artist' }
const second = { ...savedCommander('Tymna the Weaver', ['W', 'B']), position: 2, oracleId: '00000000-0000-4000-8000-000000000402',
  artworkFaceIndex: 1, artCropUrl: 'https://cards.scryfall.io/art_crop/back/tymna.jpg', artist: 'Back-side artist' }
const companion: SavedCompanion = { oracleId: '00000000-0000-4000-8000-000000000410', name: 'Obosh, the Preypiercer',
  selectionRef: { scryfallCardId: '00000000-0000-4000-8000-000000000310' }, scryfallCardId: '00000000-0000-4000-8000-000000000310',
  colorIdentity: ['B', 'R'], artworkFaceIndex: null, artCropUrl: 'https://cards.scryfall.io/art_crop/front/obosh.jpg', illustrationId: null,
  artist: null, scryfallUri: null }
const show = (props: Parameters<typeof SavedDeckCard>[0]) => render(<AppThemeProvider><ul><SavedDeckCard {...props} /></ul></AppThemeProvider>)
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test('one Commander: prominent name, quieter deck name, mana identity and independent artwork/full-card/editor targets', () => {
  const onOpen = vi.fn(), onOpenArtwork = vi.fn()
  show({ deck: { ...deck, name: 'Ein Deck', commanders: [first], colorIdentity: ['U', 'R'] }, onOpen, onOpenArtwork })
  const editor = screen.getByRole('button', { name: 'Ein Deck bearbeiten' })
  expect(editor).toHaveTextContent(first.name)
  expect(editor).not.toHaveTextContent('Ein Deck')
  expect(editor).toHaveAccessibleDescription(expect.stringContaining('Ein Deck'))
  expect(screen.getByRole('img', { name: 'Farbidentität: Blau, Rot' })).toBeInTheDocument()
  const art = screen.getByRole('button', { name: `Artwork für ${first.name} ändern` })
  const viewer = screen.getByRole('button', { name: `Karte anzeigen: ${first.name}` })
  expect(viewer).toHaveTextContent('Karte anzeigen')
  for (const target of [art, viewer]) expect(target.parentElement?.closest('button')).toBeNull()
  expect(within(editor).queryByRole('button')).not.toBeInTheDocument()
  fireEvent.click(art)
  expect(onOpenArtwork).toHaveBeenCalledWith(expect.objectContaining({ id: deck.id }), { kind: 'commander', card: first }, art)
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(viewer)
  expect(screen.getByRole('dialog', { name: first.name })).toBeInTheDocument()
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(editor)
  expect(onOpen).toHaveBeenCalledOnce()
})
test('two Commanders and a genuine Companion each have their own artwork and viewer targets; the Companion is labelled as such', () => {
  const onOpenArtwork = vi.fn()
  show({ deck: { ...deck, name: 'Partner-Protokoll', commanders: [first, second], companion, colorIdentity: ['W', 'U', 'B', 'R'] }, onOpen: vi.fn(), onOpenArtwork })
  const editor = screen.getByRole('button', { name: 'Partner-Protokoll bearbeiten' })
  expect(editor).toHaveTextContent(first.name)
  expect(editor).toHaveTextContent(second.name)
  expect(editor).not.toHaveTextContent(companion.name)
  expect(screen.getByText(`Companion: ${companion.name}`)).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^Artwork für / }).map(button => button.getAttribute('aria-label'))).toEqual([
    `Artwork für ${first.name} ändern`, `Artwork für ${second.name} ändern`, `Artwork für Companion ${companion.name} ändern`])
  expect(screen.getAllByRole('button', { name: /^Karte anzeigen: / })).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: `Artwork für Companion ${companion.name} ändern` }))
  expect(onOpenArtwork).toHaveBeenCalledWith(expect.anything(), { kind: 'companion', card: companion }, expect.any(HTMLButtonElement))
  expect(screen.getByRole('img', { name: `Illustration für ${second.name}` })).toHaveAttribute('src', second.artCropUrl)
})
test('missing or unsafe imagery and a long name keep a readable fallback', () => {
  const name = 'Long Commander name '.repeat(20).trim()
  show({ deck: { ...deck, everUsed: true, commanders: [{ ...savedCommander(name), artCropUrl: 'https://evil.test/art.jpg' }] }, onOpen: vi.fn() })
  expect(screen.getByRole('img', { name: `Keine Illustration für ${name} verfügbar` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: `${deck.name} bearbeiten` })).toHaveTextContent(name)
  expect(screen.getByRole('img', { name: 'Farbidentität: Farblos' })).toBeInTheDocument()
})
test('a broken image falls back without changing the saved choice', () => {
  show({ deck: { ...deck, commanders: [first] }, onOpen: vi.fn() })
  fireEvent.error(screen.getByRole('img', { name: `Illustration für ${first.name}` }))
  expect(screen.getByRole('img', { name: `Keine Illustration für ${first.name} verfügbar` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: `Artwork für ${first.name} ändern` })).toBeInTheDocument()
})
test('a valid ManaBox link sits beside the deck name, outside the editor target', () => {
  const onOpen = vi.fn(), onOpenArtwork = vi.fn()
  const linked = { ...deck, manaBoxUrl: 'https://manabox.app/decks/Synthetic-Mixed_123' }
  show({ deck: linked, onOpen, onOpenArtwork })
  const link = screen.getByRole('link', { name: 'Alpha: Deck in ManaBox ansehen (öffnet einen neuen Tab)' })
  expect(link).toHaveAttribute('href', linked.manaBoxUrl)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link.closest('button')).toBeNull()
  expect(link.parentElement?.parentElement).toHaveTextContent(deck.name)
  fireEvent.click(link)
  expect(onOpen).not.toHaveBeenCalled()
  expect(onOpenArtwork).not.toHaveBeenCalled()
})
test.each([null, 'https://evil.test/decks/id', 'https://www.manabox.app/decks/id'])('ManaBox value %j renders no control', url => {
  show({ deck: { ...deck, manaBoxUrl: url }, onOpen: vi.fn() })
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
test('Meine Decks shows owner links on active and archived cards without provider reads', async () => {
  const linked = 'https://manabox.app/decks/Synthetic-Mixed_123'
  const api = deckApi([deck, ...[false, true].map((archived, index) => ({ ...deck, id: `00000000-0000-4000-8000-00000000020${index}`, name: `Linked ${index}`, everUsed: true, archived, manaBoxUrl: linked }))])
  showDeckApp('/decks')
  await screen.findByRole('button', { name: 'Linked 0 bearbeiten' })
  expect(screen.getAllByRole('link', { name: /ManaBox/ })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Archivierte Decks' }))
  expect(screen.getAllByRole('link', { name: /ManaBox/ })).toHaveLength(2)
  expect(api.fetchMock.mock.calls.some(([url]) => url.includes('scryfall'))).toBe(false)
})
