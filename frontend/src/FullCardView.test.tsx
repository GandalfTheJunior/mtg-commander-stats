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
  // #239: a single top-right X, no footer close, and one flip button instead of a face selector.
  expect(within(dialog).getAllByRole('button', { name: 'Schließen' })).toHaveLength(1)
  expect(within(dialog).queryByRole('group', { name: 'Kartenseite' })).not.toBeInTheDocument()
  expect(within(dialog).getByText('Rückseite')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Vorderseite anzeigen' }))
  expect(within(dialog).getByRole('img', { name: 'Vollständige Karte: Front' })).toHaveAttribute('src', faces[0].imageUrl)
  expect(within(dialog).getByRole('heading', { name: 'Front' })).toBeInTheDocument()
  expect(within(dialog).getByText('Legendary Creature — Test')).toBeInTheDocument()
  expect(within(dialog).getByText('Vorderseite')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Rückseite anzeigen' }))
  expect(within(dialog).getByRole('img', { name: 'Vollständige Karte: Back' })).toBeInTheDocument()
  // The dialog title keeps the saved card identity while faces change.
  expect(screen.getByRole('dialog', { name: card.name })).toBe(dialog)
  fireEvent.keyDown(close, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('single-faced cards omit the flip row; more than two saved faces keep accessible face selection', () => {
  const view = render(<FullCardView card={{ ...card, artworkFaceIndex: 0, cardFaces: [faces[0]] }} />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('img', { name: 'Vollständige Karte: Front' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /seite anzeigen/ })).not.toBeInTheDocument()
  expect(screen.queryByText('Vorderseite')).not.toBeInTheDocument()
  view.unmount()
  const third = { ...faces[0], faceIndex: 2, name: 'Third', oracleText: 'Third rules', imageUrl: 'https://cards.scryfall.io/normal/Third.jpg' }
  render(<FullCardView card={{ ...card, artworkFaceIndex: 2, cardFaces: [...faces, third] }} />)
  fireEvent.click(screen.getByRole('button'))
  const group = screen.getByRole('group', { name: 'Kartenseite' })
  expect(within(group).getByRole('button', { name: '3: Third' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('button', { name: /seite anzeigen/ })).not.toBeInTheDocument()
  fireEvent.click(within(group).getByRole('button', { name: '2: Back' }))
  expect(screen.getByRole('img', { name: 'Vollständige Karte: Back' })).toBeInTheDocument()
  expect(screen.getByText(/Back rules/)).toBeInTheDocument()
})

type FakeAnimation = { keyframes: Keyframe[]; finish: () => void; cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }
function stubAnimate() {
  const animations: FakeAnimation[] = []
  const animate = vi.fn(function (this: HTMLElement, keyframes: Keyframe[]) {
    const animation: FakeAnimation = { keyframes, cancel: vi.fn(), onfinish: null, finish: () => act(() => animation.onfinish?.()) }
    animations.push(animation)
    return animation as unknown as Animation
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate })
  return { animations, animate, restore: () => { delete (HTMLElement.prototype as Partial<HTMLElement>).animate } }
}

test('the flip turns the card wrapper, swaps image and text at the half-turn and ignores repeated activation', () => {
  const { animations, animate, restore } = stubAnimate()
  try {
    render(<FullCardView card={card} />)
    fireEvent.click(screen.getByRole('button'))
    const flip = screen.getByRole('button', { name: 'Vorderseite anzeigen' })
    fireEvent.click(flip)
    expect(animate).toHaveBeenCalledOnce()
    expect(animations[0].keyframes.at(-1)?.transform).toContain('rotateY(90deg)')
    // Until the half-turn, image, text and labels still describe the same (old) face.
    expect(screen.getByRole('img', { name: 'Vollständige Karte: Back' })).toBeInTheDocument()
    expect(screen.getByText(/Back rules/)).toBeInTheDocument()
    fireEvent.click(flip)
    expect(animate).toHaveBeenCalledOnce()
    animations[0].finish()
    expect(screen.getByRole('img', { name: 'Vollständige Karte: Front' })).toBeInTheDocument()
    expect(screen.getByText(/Front rules/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rückseite anzeigen' })).toBeInTheDocument()
    expect(animations[1].keyframes[0].transform).toContain('rotateY(-90deg)')
    expect(animations[1].keyframes.at(-1)?.transform).toContain('rotateY(0deg)')
    fireEvent.click(screen.getByRole('button', { name: 'Rückseite anzeigen' }))
    expect(animate).toHaveBeenCalledTimes(2)
    animations[1].finish()
    fireEvent.click(screen.getByRole('button', { name: 'Rückseite anzeigen' }))
    expect(animate).toHaveBeenCalledTimes(3)
    // Closing mid-turn cancels the running animation.
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(animations[2].cancel).toHaveBeenCalled()
  } finally { restore() }
})

test('reduced motion changes the face immediately without animating', () => {
  const { animate, restore } = stubAnimate()
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('prefers-reduced-motion') })) as typeof window.matchMedia
  try {
    render(<FullCardView card={card} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: 'Vorderseite anzeigen' }))
    expect(screen.getByRole('img', { name: 'Vollständige Karte: Front' })).toBeInTheDocument()
    expect(animate).not.toHaveBeenCalled()
  } finally { restore(); window.matchMedia = original }
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

test('own paired decks retain the gallery action and open each card independently', async () => {
  const onOpen = vi.fn(), onOpenArtwork = vi.fn(), fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const second = { ...savedCommander('Partner'), position: 2 }
  render(<SavedDeckCard deck={{ ...deck, commanders: [card, second], companion: { ...savedCommander('Companion'), cardFaces: faces } }}
    onOpen={onOpen} onOpenArtwork={onOpenArtwork} />)
  fireEvent.click(screen.getByRole('button', { name: `Artwork für ${card.name} ändern` }))
  expect(onOpenArtwork).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  for (const name of [card.name, second.name, 'Companion']) {
    fireEvent.click(screen.getByRole('button', { name: `Karte anzeigen: ${name}` }))
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
  }
  // Backdrop dismissal closes only the viewer, never the gallery or the deck editor underneath.
  fireEvent.click(screen.getByRole('button', { name: `Karte anzeigen: ${card.name}` }))
  const backdrop = document.querySelector('.MuiBackdrop-root')!
  fireEvent.mouseDown(backdrop); fireEvent.click(backdrop)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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
