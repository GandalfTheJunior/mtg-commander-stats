import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Artwork, Deck, SavedCompanion } from './api'
import { savedCommander } from './test/commanderFixtures'
import { deck, deckApi, editDeck, showDeckApp } from './test/deckFixtures'
import { response, uid } from './test/gameFixtures'

const companionPath = (q: string) => `/api/scryfall/companions?q=${encodeURIComponent(q)}`
const artworksPath = (id: string) => `/api/scryfall/cards/${id}/artworks`
const lurrus = { selectionRef: { scryfallCardId: uid(700) }, name: 'Lurrus of the Dream-Den', colorIdentity: ['W', 'B'], thumbnailUrl: null }
const obosh = { selectionRef: { scryfallCardId: uid(701) }, name: 'Obosh, the Preypiercer', colorIdentity: ['B', 'R'], thumbnailUrl: null }
const savedCompanion: SavedCompanion = { oracleId: uid(410), name: obosh.name, selectionRef: obosh.selectionRef, scryfallCardId: uid(701),
  colorIdentity: ['B', 'R'], artworkFaceIndex: null, artCropUrl: 'https://cards.scryfall.io/art_crop/front/obosh.jpg', illustrationId: null, artist: null, scryfallUri: null }
const option = (id: number, face: number | null = null): Artwork => ({ scryfallCardId: uid(id), artworkFaceIndex: face,
  artCropUrl: `https://cards.scryfall.io/art_crop/front/${id}.jpg`, illustrationId: uid(id + 100), artist: `Artist ${id}`, scryfallUri: null })
const body = (api: ReturnType<typeof deckApi>, index = 0) => JSON.parse(api.writes()[index][1]!.body as string)
const field = (name: RegExp | string) => screen.getByRole('combobox', { name })
async function create(colors: ('W' | 'U' | 'B' | 'R' | 'G')[] = ['W', 'U', 'B', 'R', 'G']) {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Draft deck' } })
  expect(screen.queryByRole('group', { name: 'Artwork-Vorschau' })).not.toBeInTheDocument()
  api.next('/api/scryfall/commanders?q=Karn', () => response([{ ...savedCommander('Karn', colors), thumbnailUrl: null }]))
  fireEvent.change(field('Commander'), { target: { value: 'Karn' } }); fireEvent.focus(field('Commander'))
  fireEvent.click(await screen.findByRole('option', { name: 'Karn' }))
  return api
}
async function addCompanion(api: ReturnType<typeof deckApi>, choices = [lurrus, obosh]) {
  fireEvent.click(screen.getByRole('button', { name: '+ Companion hinzufügen' }))
  api.next(companionPath('Lu'), () => response(choices))
  fireEvent.change(field('Companion'), { target: { value: 'Lu' } })
}
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test('a genuine Companion is added through its own search, filtered by Commander colors, and saved with the deck', async () => {
  const api = await create(['B', 'R'])
  await addCompanion(api)
  expect(await screen.findByRole('option', { name: obosh.name })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: lurrus.name })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('option', { name: obosh.name }))
  expect(screen.getByRole('region', { name: 'Companion' })).toHaveTextContent(obosh.name)
  expect(screen.getByRole('button', { name: `Artwork für Companion ${obosh.name} wählen` })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await screen.findByText('Draft deck wurde erstellt.')
  expect(body(api)).toEqual({ name: 'Draft deck', format: 'COMMANDER', commanders: [{ selectionRef: deck.commanders[0].selectionRef }],
    companion: { selectionRef: obosh.selectionRef } })
})

test('switching to Pauper Commander removes the Companion with an Undo that restores it', async () => {
  const api = await create()
  await addCompanion(api)
  fireEvent.click(await screen.findByRole('option', { name: lurrus.name }))
  fireEvent.click(screen.getByRole('radio', { name: 'Pauper Commander' }))
  expect(screen.getByRole('status')).toHaveTextContent('Companion entfernt, da er nicht mehr kompatibel ist.')
  expect(screen.queryByRole('region', { name: 'Companion' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '+ Companion hinzufügen' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Commander' })).toHaveTextContent('Karn')
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  expect(screen.getByRole('radio', { name: 'Commander' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('region', { name: 'Companion' })).toHaveTextContent(lurrus.name)
  expect(api.writes()).toHaveLength(0)
})

test('removing a saved Companion is explicit in the update and can be undone before saving', async () => {
  const api = deckApi([{ ...deck, colorIdentity: ['B', 'R'], commanders: [savedCommander('Karn', ['B', 'R'])], companion: savedCompanion }])
  showDeckApp(); await editDeck()
  fireEvent.click(screen.getByRole('button', { name: 'Companion entfernen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Companion entfernen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText(`${deck.name} wurde gespeichert.`)
  expect(body(api)).toEqual({ name: deck.name, companion: null })
})

test('artwork chosen in the editor changes only the draft and is saved atomically with the new deck', async () => {
  const api = await create()
  const preview = screen.getByRole('group', { name: 'Artwork-Vorschau' })
  api.next(artworksPath(deck.commanders[0].scryfallCardId), () => response([option(900), option(901, 1)]))
  fireEvent.click(within(preview).getByRole('button', { name: 'Artwork für Karn wählen' }))
  const dialog = await screen.findByRole('dialog', { name: 'Artwork für Karn wählen' })
  fireEvent.click(await within(dialog).findByRole('button', { name: /Seite 2 von Artist 901 auswählen/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(within(preview).getByRole('img', { name: 'Illustration für Karn' })).toHaveAttribute('src', option(901).artCropUrl)
  expect(api.writes()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await screen.findByText('Draft deck wurde erstellt.')
  expect(api.writes()).toHaveLength(1)
  expect(body(api).commanders).toEqual([{ selectionRef: deck.commanders[0].selectionRef, artwork: { scryfallCardId: uid(901), artworkFaceIndex: 1 } }])
})

test('an artwork-only change of a used, archived deck is dirty, guarded and sent in the single deck update', async () => {
  const used: Deck = { ...deck, everUsed: true, archived: true, commanders: [{ ...savedCommander('Karn'), artCropUrl: 'https://cards.scryfall.io/art_crop/front/saved.jpg' }] }
  const api = deckApi([used]); showDeckApp(); await editDeck()
  expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled()
  api.next(artworksPath(used.commanders[0].scryfallCardId), () => response([option(902)]))
  fireEvent.click(screen.getByRole('button', { name: 'Artwork für Karn wählen' }))
  fireEvent.click(await screen.findByRole('button', { name: /Illustration 1 von Artist 902 auswählen/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  expect(await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })).toHaveTextContent('auch deine Artwork-Auswahl')
  fireEvent.click(screen.getByRole('button', { name: 'Weiter bearbeiten' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText(`${deck.name} wurde gespeichert.`)
  expect(api.writes().map(([path, init]) => [path, init?.method])).toEqual([[`/api/decks/${deck.id}`, 'PUT']])
  expect(body(api)).toEqual({ name: deck.name, commanders: [{ selectionRef: used.commanders[0].selectionRef, artwork: { scryfallCardId: uid(902) } }] })
})

test('the collection Companion artwork shortcut writes only the Companion artwork', async () => {
  const withCompanion: Deck = { ...deck, commanders: [savedCommander('Karn', ['B', 'R'])], colorIdentity: ['B', 'R'], companion: savedCompanion }
  const api = deckApi([withCompanion]); showDeckApp('/decks')
  api.next(artworksPath(savedCompanion.scryfallCardId), () => response([option(903)]))
  fireEvent.click(await screen.findByRole('button', { name: `Artwork für Companion ${obosh.name} ändern` }))
  const updated = { ...withCompanion, companion: { ...savedCompanion, scryfallCardId: uid(903), selectionRef: { scryfallCardId: uid(903) }, artCropUrl: option(903).artCropUrl } }
  api.next(`/api/decks/${deck.id}/companion/artwork`, () => response(updated), 'PUT')
  fireEvent.click(await screen.findByRole('button', { name: /Illustration 1 von Artist 903 auswählen/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.writes().map(([path]) => path)).toEqual([`/api/decks/${deck.id}/companion/artwork`])
  expect(body(api)).toEqual({ scryfallCardId: uid(903) })
  expect(screen.getByRole('img', { name: `Illustration für ${obosh.name}` })).toHaveAttribute('src', option(903).artCropUrl)
})
