import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import SavedDeckCard from './SavedDeckCard'
import { savedCommander } from './test/commanderFixtures'
import { deck, deckApi, showDeckApp } from './test/deckFixtures'
import { AppThemeProvider } from './theme/AppThemeProvider'

const first = { ...savedCommander('The Prismatic Piper'), requiresChosenColor: true, chosenColor: 'G' as const,
  effectiveColorIdentity: ['G' as const], artCropUrl: 'https://cards.scryfall.io/art_crop/front/piper.jpg',
  artist: 'First artist', scryfallUri: 'https://scryfall.com/card/test/1/piper' }
const second = { ...savedCommander('Second Commander'), position: 2, oracleId: '00000000-0000-4000-8000-000000000402',
  artworkFaceIndex: 1, artCropUrl: 'https://cards.scryfall.io/art_crop/back/second.jpg',
  artist: 'Back-side artist', scryfallUri: 'https://scryfall.com/card/test/2/second' }

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test.each(['/dashboard', '/decks'])('%s renders saved single, dual and missing imagery with independent sources and fresh editor navigation', async path => {
  const pair = { ...deck, name: 'Partners', commanders: [first, second], colorIdentity: ['G' as const], everUsed: true, archived: true }
  const api = deckApi([pair, { ...deck, id: '00000000-0000-4000-8000-000000000102', name: 'Single', commanders: [first] },
    { ...deck, id: '00000000-0000-4000-8000-000000000103', name: 'Missing' }])
  showDeckApp(path)
  await screen.findByRole('heading', { name: 'Partners' })
  expect(screen.getAllByRole('img', { name: `Illustration für ${first.name}` })).toHaveLength(2)
  expect(screen.getByRole('img', { name: `Illustration für ${second.name}` })).toHaveAttribute('src', second.artCropUrl)
  expect(screen.getByRole('img', { name: 'Keine Illustration für Karn verfügbar' })).toBeInTheDocument()
  const card = screen.getByRole('heading', { name: 'Partners' }).closest('li')!
  const editor = within(card).getByRole('button', { name: path === '/decks' ? 'Partners bearbeiten' : 'Partners' })
  expect(editor).toHaveAccessibleDescription(expect.stringContaining('G (Grün)'))
  expect(editor).toHaveAccessibleDescription(expect.stringContaining('Archiviert'))
  expect(editor).toHaveAccessibleDescription(expect.stringContaining(`${first.name} / ${second.name}`))
  expect(within(card).getByText(/Back-side artist/)).toBeInTheDocument()
  const source = within(card).getByRole('link', { name: /Quelle zu Commander 2/ })
  expect(source).toHaveAttribute('href', second.scryfallUri)
  expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  expect(source.closest('button')).toBeNull()
  expect(within(editor).queryByRole('link')).not.toBeInTheDocument()
  expect(within(editor).queryByRole('img')).not.toBeInTheDocument()
  expect(window.location.pathname).toBe(path)
  expect(api.fetchMock.mock.calls.some(([url]) => url.includes('scryfall'))).toBe(false)
  fireEvent.click(editor)
  await screen.findByRole('form', { name: 'Deck Partners bearbeiten' })
  expect(window.location.pathname).toBe(`/decks/${deck.id}/edit`)
  expect(api.writes()).toHaveLength(0)
})

test.each(['/dashboard', '/decks'])('%s keeps failed-art metadata and shows replaced art immediately after refetch', async path => {
  const api = deckApi([{ ...deck, commanders: [first] }]); showDeckApp(path)
  const img = await screen.findByRole('img', { name: `Illustration für ${first.name}` })
  fireEvent.error(img)
  expect(screen.getByRole('img', { name: `Keine Illustration für ${first.name} verfügbar` })).toBeInTheDocument()
  expect(screen.getByText(/First artist/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Quelle zu Commander 1/ })).toHaveAttribute('href', first.scryfallUri)
  expect(api.state.decks[0].commanders[0].artCropUrl).toBe(first.artCropUrl)
  api.state.decks = [{ ...deck, commanders: [{ ...first, artCropUrl: second.artCropUrl, artist: second.artist, artworkFaceIndex: 1 }] }]
  fireEvent.click(screen.getByRole('button', { name: 'Decks aktualisieren' }))
  expect(await screen.findByRole('img', { name: `Illustration für ${first.name}` })).toHaveAttribute('src', second.artCropUrl)
  expect(screen.getByText(/Back-side artist/)).toBeInTheDocument()
  expect(api.fetchMock.mock.calls.map(([url]) => url).filter(url => url.includes('scryfall'))).toEqual([])
  expect(api.writes()).toHaveLength(0)
})

test.each(['javascript:alert(1)', 'http://scryfall.com/card/test', 'https://scryfall.com.evil.test/card', 'https://user@scryfall.com/card', 'invalid'])('unsafe source %s is omitted without hiding the card', source => {
  render(<AppThemeProvider><SavedDeckCard deck={{ ...deck, commanders: [{ ...first, scryfallUri: source }] }} onOpen={vi.fn()} /></AppThemeProvider>)
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: deck.name })).toHaveAccessibleDescription(expect.stringContaining('Farblos'))
})

test('missing attribution, an unsafe image and a long name retain readable fallback and status', () => {
  const name = 'Long Commander name '.repeat(20).trim()
  render(<AppThemeProvider><SavedDeckCard deck={{ ...deck, everUsed: true,
    commanders: [{ ...savedCommander(name), artCropUrl: 'https://evil.test/art.jpg' }] }} onOpen={vi.fn()} /></AppThemeProvider>)
  expect(screen.getByRole('img', { name: `Keine Illustration für ${name} verfügbar` })).toBeInTheDocument()
  expect(screen.getByText(/Künstlerangabe nicht verfügbar/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: deck.name })).toHaveAccessibleDescription(expect.stringContaining('Bereits gespielt'))
})

test('ManaBox is opt-in and independent from editing and artwork actions', () => {
  const onOpen = vi.fn(), onOpenArtwork = vi.fn()
  const linked = { ...deck, manaBoxUrl: 'https://manabox.app/decks/Synthetic-Mixed_123' }
  const view = render(<AppThemeProvider><SavedDeckCard deck={linked} onOpen={onOpen} onOpenArtwork={onOpenArtwork} /></AppThemeProvider>)
  expect(screen.queryByRole('link', { name: /ManaBox/ })).not.toBeInTheDocument()
  view.rerender(<AppThemeProvider><SavedDeckCard deck={linked} showManaBox onOpen={onOpen} onOpenArtwork={onOpenArtwork} /></AppThemeProvider>)
  const link = screen.getByRole('link', { name: 'Alpha: Deck in ManaBox ansehen (öffnet einen neuen Tab)' })
  expect(link).toHaveAttribute('href', linked.manaBoxUrl)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link.closest('button')).toBeNull()
  fireEvent.click(link)
  expect(onOpen).not.toHaveBeenCalled()
  expect(onOpenArtwork).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: deck.name }))
  expect(onOpen).toHaveBeenCalledOnce()
})

test.each(['/dashboard', '/decks'])('%s shows owner links only on Meine Decks, including used and archived decks', async path => {
  const linked = 'https://manabox.app/decks/Synthetic-Mixed_123'
  deckApi([deck, ...[false, true].map((archived, index) => ({ ...deck, id: `deck-${index}`, name: `Linked ${index}`, everUsed: true, archived, manaBoxUrl: linked })),
    { ...deck, id: 'unsafe', name: 'Unsafe', manaBoxUrl: 'https://evil.test/decks/id' }])
  showDeckApp(path)
  await screen.findByRole('heading', { name: 'Linked 0' })
  expect(screen.queryAllByRole('link', { name: /ManaBox/ })).toHaveLength(path === '/decks' ? 2 : 0)
  for (const name of ['Alpha', 'Unsafe']) {
    expect(within(screen.getByRole('heading', { name }).closest('li')!).queryByRole('link', { name: /ManaBox/ })).not.toBeInTheDocument()
  }
})
