import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { FullCardView } from './FullCardView'
import SavedDeckCard from './SavedDeckCard'
import { listDecks, memberDecks, type CardFace } from './api'
import { savedCommander } from './test/commanderFixtures'
import { deck } from './test/deckFixtures'
import { response, uid } from './test/gameFixtures'
import { AppThemeProvider } from './theme/AppThemeProvider'

const faces: CardFace[] = ['Front', 'Back'].map((name, faceIndex) => ({ faceIndex, name,
  typeLine: faceIndex === 0 ? 'Legendary Creature — Test' : 'Land', oracleText: `${name} rules\nSecond ability`,
  imageUrl: `https://cards.scryfall.io/normal/${name}.jpg` }))
const card = { ...savedCommander('Front // Back'), artworkFaceIndex: 1, cardFaces: faces }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('opens the saved artwork face without fetching, switches faces, closes with Escape and restores focus', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  render(<AppThemeProvider><FullCardView card={card} /></AppThemeProvider>)
  const trigger = screen.getByRole('button', { name: `Karte anzeigen: ${card.name}` })
  trigger.focus(); fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: card.name })
  expect(within(dialog).getByRole('img', { name: 'Vollständige Karte: Back' })).toHaveAttribute('src', faces[1].imageUrl)
  expect(within(dialog).getByText('Land')).toBeInTheDocument()
  expect(within(dialog).getByText(/Back rules/)).toBeInTheDocument()
  const close = within(dialog).getByRole('button', { name: 'Schließen' })
  await waitFor(() => expect(close).toHaveFocus())
  // MUI's focus trap must reject focus moving outside the modal.
  act(() => trigger.focus())
  expect(trigger).not.toHaveFocus()
  expect(dialog.contains(document.activeElement) || document.activeElement?.contains(dialog)).toBe(true)
  fireEvent.click(within(dialog).getByRole('button', { name: '1: Front' }))
  expect(within(dialog).getByRole('img', { name: 'Vollständige Karte: Front' })).toHaveAttribute('src', faces[0].imageUrl)
  fireEvent.keyDown(close, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('an exceptional gameplay face takes precedence over the artwork face', () => {
  render(<FullCardView card={{ ...card, selectionRef: { ...card.selectionRef, gameplayFaceIndex: 0 } }} />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('img', { name: 'Vollständige Karte: Front' })).toBeInTheDocument()
})

test('missing legacy snapshots and failed images remain readable without a lookup', () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  const view = render(<FullCardView card={{ ...card, cardFaces: null }} />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByText('Kein Kartenbild gespeichert.')).toBeInTheDocument()
  expect(screen.getByText('Typzeile nicht gespeichert.')).toBeInTheDocument()
  expect(screen.getByText('Regeltext nicht gespeichert.')).toBeInTheDocument()
  view.rerender(<FullCardView card={card} />)
  fireEvent.error(screen.getByRole('img', { name: 'Vollständige Karte: Back' }))
  expect(screen.getByText('Kartenbild konnte nicht geladen werden.')).toBeInTheDocument()
  expect(screen.getByText(/Back rules/)).toBeInTheDocument()
  expect(screen.getByText('Land')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('only visible artworks preload every safe face, and unmount cancels unfinished images', () => {
  const observers: { notify: (visible: boolean) => void; disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn()
    observe = vi.fn()
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
      expect(options.rootMargin).toBe('0px')
      observers.push({ notify: visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver), disconnect: this.disconnect })
    }
  })
  const images: { src: string; complete: boolean; removeAttribute: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('Image', class {
    src = ''; complete = false; removeAttribute = vi.fn()
    constructor() { images.push(this) }
  })
  const view = render(<>{[0, 1].map(index => <FullCardView key={index} card={{ ...card, cardFaces: [...faces,
    { ...faces[0], faceIndex: 2 }, { ...faces[1], faceIndex: 3, imageUrl: 'https://evil.test/image.jpg' }] }} artwork />)}</>)
  expect(images).toHaveLength(0)
  act(() => observers[1].notify(false))
  expect(images).toHaveLength(0)
  act(() => observers[0].notify(true))
  expect(images.map(image => image.src)).toEqual(faces.map(face => face.imageUrl))
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  act(() => observers[1].notify(true))
  expect(images).toHaveLength(4)
  images[0].complete = true
  view.unmount()
  expect(images[0].removeAttribute).not.toHaveBeenCalled()
  for (const image of images.slice(1)) expect(image.removeAttribute).toHaveBeenCalledWith('src')
  expect(observers.every(observer => observer.disconnect.mock.calls.length >= 1)).toBe(true)
})

test('own paired decks retain the gallery action and open each card independently', () => {
  const onOpen = vi.fn(), onOpenArtwork = vi.fn(), fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const second = { ...savedCommander('Partner'), position: 2 }
  render(<SavedDeckCard deck={{ ...deck, commanders: [card, second], companion: { ...savedCommander('Companion'), cardFaces: faces } }}
    overview onOpen={onOpen} onOpenArtwork={onOpenArtwork} />)
  fireEvent.click(screen.getByRole('button', { name: `Artwork für ${card.name} ändern` }))
  expect(onOpenArtwork).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  for (const name of [card.name, second.name, 'Companion']) {
    fireEvent.click(screen.getByRole('button', { name: `Karte anzeigen: ${name}` }))
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
  }
  expect(onOpenArtwork).toHaveBeenCalledOnce()
  expect(onOpen).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('deck and member selection parsers preserve the saved Commander and Companion faces', async () => {
  const stored = { ...deck, commanders: [card], companion: { ...savedCommander('Companion'), cardFaces: faces } }
  const fetchMock = vi.fn(async () => response([stored])); vi.stubGlobal('fetch', fetchMock)
  for (const result of [await listDecks(), await memberDecks(uid(1), uid(2))]) {
    expect(result[0].commanders[0].cardFaces).toEqual(faces)
    expect(result[0].companion?.cardFaces).toEqual(faces)
  }
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test.each([[{ ...faces[0], faceIndex: -1 }], [{ ...faces[0], oracleText: 123 }], [faces[0], faces[0]], []].map(cardFaces => ({ cardFaces })))(
  'rejects malformed face snapshots: $cardFaces', async ({ cardFaces }) => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ ...deck, commanders: [{ ...card, cardFaces }] }])))
    await expect(listDecks()).rejects.toThrow(/card face/)
  })
