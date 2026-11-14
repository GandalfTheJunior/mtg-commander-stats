import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { FullCardView } from './FullCardView'
import SavedDeckCard from './SavedDeckCard'
import { getGame, listDecks, memberDecks, type CardFace, type RelatedToken, type SavedCommander } from './api'
import { savedCommander } from './test/commanderFixtures'
import { deck } from './test/deckFixtures'
import { recorded, response, uid } from './test/gameFixtures'
import { AppThemeProvider } from './theme/AppThemeProvider'

// Fixtures modelled on the PO's acceptance examples (#235); IDs and image paths are test data, not real snapshots.
const image = (name: string) => `https://cards.scryfall.io/normal/front/${name}.jpg`
const token = (n: number, name: string, typeLine: string | null = `Token Creature — ${name}`, extra: Partial<RelatedToken> = {}): RelatedToken => ({
  scryfallCardId: uid(500 + n), name, typeLine, imageUrl: image(`token-${n}`), layout: 'token',
  cardFaces: [{ faceIndex: null, name, typeLine, oracleText: '', imageUrl: image(`token-${n}`) }], ...extra })
const food = token(1, 'Food', 'Token Artifact — Food')
const coil = token(2, "Koma's Coil", 'Token Creature — Serpent')
const sorinFaces: CardFace[] = [
  { faceIndex: 0, name: 'Sorin of House Markov', typeLine: 'Legendary Creature — Human Warlock', oracleText: 'Lifelink', imageUrl: image('sorin-front') },
  { faceIndex: 1, name: 'Sorin, Ravenous Neonate', typeLine: 'Legendary Planeswalker — Sorin', oracleText: '+2: Create a Food token.', imageUrl: image('sorin-back') },
]
const sorin: SavedCommander = { ...savedCommander('Sorin of House Markov // Sorin, Ravenous Neonate'), artworkFaceIndex: 0, cardFaces: sorinFaces, relatedTokens: [food] }
const koma: SavedCommander = { ...savedCommander('Koma, Cosmos Serpent'), oracleId: uid(402), scryfallCardId: uid(302), selectionRef: { scryfallCardId: uid(302) },
  position: 2, cardFaces: [{ faceIndex: null, name: 'Koma, Cosmos Serpent', typeLine: 'Legendary Creature — Serpent', oracleText: 'Create Koma\'s Coil.', imageUrl: image('koma') }],
  relatedTokens: [coil] }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function open(card: SavedCommander, props: Partial<Parameters<typeof FullCardView>[0]> = {}) {
  const view = render(<AppThemeProvider><FullCardView card={card} {...props} /></AppThemeProvider>)
  fireEvent.click(screen.getByRole('button', { name: `Karte anzeigen: ${card.name}` }))
  return { view, dialog: screen.getByRole('dialog', { name: card.name }) }
}
const toggle = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: /^Zugehörige Tokens \(\d+\)$/ })
const tokenImages = (dialog: HTMLElement) => within(dialog).queryAllByRole('img', { name: /^Zugehöriger Token / })

test('the collapsed accordion follows the rules text, loads token images only on first expansion and reuses them', () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  const preloaded: string[] = []
  vi.stubGlobal('Image', class { complete = false; removeAttribute = vi.fn(); set src(value: string) { preloaded.push(value) } })
  const many = [coil, ...[3, 4, 5, 6].map(n => token(n, `Token ${n}`))]
  const { dialog } = open({ ...koma, relatedTokens: many }, { preload: 'immediate' })
  // The visible-Commander preload contains only the Commander's own faces, never token files.
  expect(preloaded).toEqual([image('koma')])
  const summary = toggle(dialog)
  expect(summary).toHaveAccessibleName('Zugehörige Tokens (5)')
  expect(summary).toHaveAttribute('aria-expanded', 'false')
  expect(summary.closest('h4')).not.toBeNull()
  // Placed after the rules text in the same text column.
  expect(within(dialog).getByText("Create Koma's Coil.").compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(tokenImages(dialog)).toHaveLength(0)
  expect(dialog.querySelectorAll('img[src*="token-"]')).toHaveLength(0)

  fireEvent.click(summary)
  expect(summary).toHaveAttribute('aria-expanded', 'true')
  const region = within(dialog).getByRole('region', { name: 'Zugehörige Tokens (5)' })
  expect(summary).toHaveAttribute('aria-controls', region.id)
  // All saved images are requested at once, in backend order, image-only with saved-name alternatives.
  const images = within(region).getAllByRole('img')
  expect(images.map(img => img.getAttribute('src'))).toEqual(many.map(entry => entry.imageUrl))
  expect(images[0]).toHaveAccessibleName("Zugehöriger Token 1 von 5: Koma's Coil (Token Creature — Serpent)")
  expect(within(region).queryByText("Koma's Coil")).not.toBeInTheDocument()
  expect(within(region).queryByRole('button')).not.toBeInTheDocument()

  fireEvent.click(summary)
  expect(summary).toHaveAttribute('aria-expanded', 'false')
  // Collapsing keeps the loaded elements mounted; re-expanding shows the very same image elements.
  expect(dialog.querySelectorAll('img[src*="token-"]')).toHaveLength(5)
  fireEvent.click(summary)
  expect(within(region).getAllByRole('img')).toEqual(images)
  expect(preloaded).toEqual([image('koma')])
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each([['null', null], ['empty', []], ['absent legacy', undefined]])('%s token snapshots show no section or notice', (_, relatedTokens) => {
  const { dialog } = open({ ...koma, relatedTokens: relatedTokens as RelatedToken[] | null | undefined })
  expect(within(dialog).queryByText(/Zugehörige Tokens/)).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('region')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('heading', { level: 3, name: 'Koma, Cosmos Serpent' })).toBeInTheDocument()
})

test('switching the Sorin face keeps the printing token list and the expanded state', () => {
  const { dialog } = open(sorin)
  expect(within(dialog).getByRole('img', { name: 'Vollständige Karte: Sorin of House Markov' })).toBeInTheDocument()
  fireEvent.click(toggle(dialog))
  expect(tokenImages(dialog).map(img => img.getAttribute('alt'))).toEqual(['Zugehöriger Token 1 von 1: Food (Token Artifact — Food)'])
  const before = tokenImages(dialog)[0]
  fireEvent.click(within(dialog).getByRole('button', { name: 'Rückseite anzeigen' }))
  expect(within(dialog).getByRole('heading', { name: 'Sorin, Ravenous Neonate' })).toBeInTheDocument()
  expect(toggle(dialog)).toHaveAttribute('aria-expanded', 'true')
  expect(tokenImages(dialog)).toEqual([before])
  fireEvent.click(within(dialog).getByRole('button', { name: 'Vorderseite anzeigen' }))
  expect(toggle(dialog)).toHaveAccessibleName('Zugehörige Tokens (1)')
  expect(tokenImages(dialog)).toEqual([before])
  // The face text stays the only live region; the token section is outside it.
  expect(toggle(dialog).closest('[aria-live]')).toBeNull()
})

test('missing, unsafe and failed token images keep their entry, name and position', () => {
  const tokens = [token(1, 'Missing', null, { imageUrl: null }), token(2, 'Unsafe', 'Token', { imageUrl: 'https://evil.test/x.jpg' }), token(3, 'Broken'), token(4, 'Fine')]
  const { dialog } = open({ ...koma, relatedTokens: tokens })
  expect(toggle(dialog)).toHaveAccessibleName('Zugehörige Tokens (4)')
  fireEvent.click(toggle(dialog))
  fireEvent.error(within(dialog).getByRole('img', { name: /Broken/ }))
  const entries = within(dialog).getAllByRole('img', { name: /^Zugehöriger Token / })
  expect(entries.map(entry => entry.getAttribute('aria-label') ?? entry.getAttribute('alt'))).toEqual([
    'Zugehöriger Token 1 von 4: Missing. Kein Tokenbild verfügbar.',
    'Zugehöriger Token 2 von 4: Unsafe (Token). Kein Tokenbild verfügbar.',
    'Zugehöriger Token 3 von 4: Broken (Token Creature — Broken). Tokenbild konnte nicht geladen werden.',
    'Zugehöriger Token 4 von 4: Fine (Token Creature — Fine)'])
  expect(within(entries[0]).getByText('Missing')).toBeInTheDocument()
  expect(dialog.querySelector('img[src^="https://evil.test"]')).toBeNull()
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('a double-faced token shows only its primary image and no flip control; the Commander flip is unchanged', () => {
  const dfc = token(7, 'Incubator // Phyrexian Token', 'Token Artifact — Incubator // Token Artifact Creature — Phyrexian', {
    layout: 'double_faced_token', imageUrl: image('dfc-front'),
    cardFaces: [{ faceIndex: 0, name: 'Incubator', typeLine: 'Token Artifact — Incubator', oracleText: '', imageUrl: image('dfc-front') },
      { faceIndex: 1, name: 'Phyrexian Token', typeLine: 'Token Artifact Creature — Phyrexian', oracleText: '', imageUrl: image('dfc-back') }] })
  const { dialog } = open({ ...sorin, relatedTokens: [dfc] })
  fireEvent.click(toggle(dialog))
  expect(tokenImages(dialog).map(img => img.getAttribute('src'))).toEqual([image('dfc-front')])
  expect(dialog.querySelector(`img[src="${image('dfc-back')}"]`)).toBeNull()
  expect(within(dialog).getAllByRole('button', { name: /seite anzeigen/ })).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Rückseite anzeigen' }))
  expect(within(dialog).getByRole('img', { name: 'Vollständige Karte: Sorin, Ravenous Neonate' })).toBeInTheDocument()
})

test('reduced motion still toggles the accordion', () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('prefers-reduced-motion') })) as typeof window.matchMedia
  try {
    const { dialog } = open(koma)
    fireEvent.click(toggle(dialog))
    expect(toggle(dialog)).toHaveAttribute('aria-expanded', 'true')
    expect(tokenImages(dialog)).toHaveLength(1)
  } finally { window.matchMedia = original }
})

test('re-entering the dialog starts collapsed; paired Commanders and the Companion never share token content', () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  render(<AppThemeProvider><SavedDeckCard readOnly deck={{ ...deck, manaBoxUrl: undefined, commanders: [sorin, koma],
    companion: { ...savedCommander('Lurrus of the Dream-Den'), oracleId: uid(403), cardFaces: sorinFaces } }} /></AppThemeProvider>)
  const view = (name: string) => { fireEvent.click(screen.getByRole('button', { name })); return screen.getByRole('dialog') }
  let dialog = view(`Karte anzeigen: ${sorin.name}`)
  fireEvent.click(toggle(dialog))
  expect(tokenImages(dialog).map(img => img.getAttribute('alt'))).toEqual(['Zugehöriger Token 1 von 1: Food (Token Artifact — Food)'])
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  dialog = view(`Karte anzeigen: ${koma.name}`)
  expect(toggle(dialog)).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle(dialog))
  expect(tokenImages(dialog).map(img => img.getAttribute('alt'))).toEqual(["Zugehöriger Token 1 von 1: Koma's Coil (Token Creature — Serpent)"])
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  dialog = view(`Karte anzeigen: ${sorin.name}`)
  expect(toggle(dialog)).toHaveAttribute('aria-expanded', 'false')
  expect(tokenImages(dialog)).toHaveLength(0)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
  dialog = view('Companion anzeigen: Lurrus of the Dream-Den')
  expect(within(dialog).queryByText(/Zugehörige Tokens/)).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('unmounting while token images load leaves no background work or stale updates', () => {
  const error = vi.spyOn(console, 'error')
  const { view, dialog } = open(koma)
  fireEvent.click(toggle(dialog))
  const img = tokenImages(dialog)[0]
  view.unmount()
  act(() => { fireEvent.error(img) })
  expect(error).not.toHaveBeenCalled()
})

test('owner, member and game-detail parsers keep saved token order, collapse repeated printings and drop Companion tokens', async () => {
  const wire = { ...sorin, relatedTokens: [coil, food, { ...coil, name: 'Repeated printing' }, token(9, 'Food')] }
  const companion = { ...savedCommander('Lurrus'), oracleId: uid(403), cardFaces: null, relatedTokens: [food] }
  const stored = { ...deck, commanders: [wire, { ...koma, relatedTokens: null }], companion }
  const game = recorded()
  game.participants[0].deck = { ...game.participants[0].deck, commanders: [wire as SavedCommander], companion: companion as SavedCommander }
  const fetchMock = vi.fn(async (url: string) => response(url.includes('/games/') ? game : [stored])); vi.stubGlobal('fetch', fetchMock)
  const decks = [(await listDecks())[0], (await memberDecks(uid(1), uid(2)))[0], (await getGame(game.groupId, game.id)).participants[0].deck]
  for (const result of decks) {
    expect(result.commanders[0].relatedTokens?.map(entry => [entry.scryfallCardId, entry.name])).toEqual(
      [[coil.scryfallCardId, "Koma's Coil"], [food.scryfallCardId, 'Food'], [uid(509), 'Food']])
    expect(result.companion).not.toHaveProperty('relatedTokens')
  }
  expect(decks[0].commanders[1].relatedTokens).toBeNull()
  vi.stubGlobal('fetch', vi.fn(async () => response([{ ...deck, commanders: [{ ...sorin, relatedTokens: [] }] }])))
  expect((await listDecks())[0].commanders[0].relatedTokens).toEqual([])
  vi.stubGlobal('fetch', vi.fn(async () => response([{ ...deck, commanders: [savedCommander()] }])))
  expect((await listDecks())[0].commanders[0]).not.toHaveProperty('relatedTokens')
})

test.each([
  { relatedTokens: {} }, { relatedTokens: [{ ...food, scryfallCardId: 'nope' }] }, { relatedTokens: [{ ...food, name: '' }] },
  { relatedTokens: [{ ...food, imageUrl: 5 }] }, { relatedTokens: [{ ...food, layout: null }] }, { relatedTokens: [{ ...food, cardFaces: [] }] },
])('rejects malformed token snapshots: $relatedTokens', async ({ relatedTokens }) => {
  vi.stubGlobal('fetch', vi.fn(async () => response([{ ...deck, commanders: [{ ...sorin, relatedTokens }] }])))
  await expect(listDecks()).rejects.toThrow(/related token|card face/)
})
