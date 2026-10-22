import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { deck, deckApi, showDeckApp } from './test/deckFixtures'
import { savedCommander } from './test/commanderFixtures'
import { response, uid } from './test/gameFixtures'
import type { Artwork, Deck, SavedCommander } from './api'

const first = { ...savedCommander('First'), requiresChosenColor: true, chosenColor: 'R' as const,
  effectiveColorIdentity: ['R' as const], artCropUrl: 'https://cards.scryfall.io/art_crop/current.jpg' }
const second = { ...savedCommander('Second'), position: 2, oracleId: uid(402), scryfallCardId: uid(302), selectionRef: { scryfallCardId: uid(302), gameplayFaceIndex: 1 },
  artCropUrl: 'https://cards.scryfall.io/art_crop/second.jpg' }
const pair: Deck = { ...deck, commanders: [first, second], colorIdentity: ['R'], everUsed: true, archived: true }
const option: Artwork = { scryfallCardId: uid(303), artworkFaceIndex: 1, artCropUrl: 'https://cards.scryfall.io/art_crop/back.jpg',
  artist: 'Back Artist', illustrationId: uid(501), scryfallUri: 'https://scryfall.com/card/test' }
const galleryPath = (slot: SavedCommander = first) => `/api/scryfall/cards/${slot.scryfallCardId}/artworks${'gameplayFaceIndex' in slot.selectionRef ? `?gameplayFaceIndex=${slot.selectionRef.gameplayFaceIndex}` : ''}`
const writePath = (position = 1) => `/api/decks/${deck.id}/commanders/${position}/artwork`
const updated = (position = 1): Deck => ({ ...pair, commanders: pair.commanders.map(slot => slot.position !== position ? slot : {
  ...slot, ...option, selectionRef: { ...slot.selectionRef, scryfallCardId: option.scryfallCardId },
}) })
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail }); return { promise, resolve, reject } }
async function open(name = 'First') {
  const trigger = await screen.findByRole('button', { name: `Artwork für ${name} ändern` })
  fireEvent.click(trigger)
  return { trigger, dialog: await screen.findByRole('dialog') }
}
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test.each(['/dashboard', '/decks'])('%s opens each slot independently and commits exactly once only after acknowledgement, then refreshes across views', async path => {
  const api = deckApi([pair])
  api.next(galleryPath(second), () => response([option]))
  const pending = deferred<Response>()
  api.next(writePath(2), () => pending.promise, 'PUT')
  showDeckApp(path)
  const { trigger, dialog } = await open('Second')
  const choice = await within(dialog).findByRole('button', { name: /Illustration 1, Seite 2 von Back Artist auswählen/ })
  expect(trigger.closest('button')?.parentElement?.closest('button')).toBeNull()
  expect(window.location.pathname).toBe(path)
  expect(within(dialog).queryByRole('button', { name: /Übernehmen|Speichern/ })).not.toBeInTheDocument()
  fireEvent.click(choice); fireEvent.click(choice)
  await screen.findByRole('status', { name: '' })
  expect(choice).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Schließen' })).toBeDisabled()
  expect(within(dialog).getByRole('status')).toHaveTextContent('Artwork wird gespeichert')
  await waitFor(() => expect(api.fetchMock.mock.calls.filter(([url, init]) => url === writePath(2) && init?.method === 'PUT')).toHaveLength(1))
  const write = api.fetchMock.mock.calls.find(([url, init]) => url === writePath(2) && init?.method === 'PUT')!
  expect(JSON.parse(write[1]!.body as string)).toEqual({ scryfallCardId: option.scryfallCardId, artworkFaceIndex: 1 })
  expect(write[1]?.headers).toMatchObject({ 'X-CSRF-TOKEN': 'deck-token' })
  expect(api.state.decks[0]).toEqual(pair)
  api.state.decks = [updated(2)]
  await act(async () => pending.resolve(response(api.state.decks[0])))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('img', { name: 'Illustration für Second' })).toHaveAttribute('src', option.artCropUrl)
  expect(screen.getByRole('img', { name: 'Illustration für First' })).toHaveAttribute('src', first.artCropUrl)
  fireEvent.click(screen.getByRole('link', { name: path === '/dashboard' ? 'Decks' : 'Dashboard' }))
  expect(await screen.findByRole('img', { name: 'Illustration für Second' })).toHaveAttribute('src', option.artCropUrl)
  api.next(galleryPath(), () => response([{ ...option, artworkFaceIndex: null }]))
  await open()
  expect(await screen.findByRole('button', { name: /Illustration 1 von Back Artist/ })).toBeInTheDocument()
})

test('confirmed failure retains previous art, permits immediate retry, and top-level image omits the selector', async () => {
  const api = deckApi([pair]); const top = { ...option, artworkFaceIndex: null }
  api.next(galleryPath(), () => response([top]))
  api.next(writePath(), () => response({ detail: 'Scryfall unavailable' }, 503), 'PUT')
  showDeckApp(); await open()
  const choice = await screen.findByRole('button', { name: /Illustration 1 von Back Artist/ })
  fireEvent.click(choice)
  expect(await screen.findByRole('alert')).toHaveTextContent('Scryfall unavailable')
  expect(choice).toBeEnabled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(api.state.decks[0]).toEqual(pair)
  const next = updated(); next.commanders[0].artworkFaceIndex = null
  api.next(writePath(), () => response(next), 'PUT')
  fireEvent.click(choice)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const writes = api.writes().filter(([path]) => path === writePath())
  expect(writes).toHaveLength(2)
  expect(JSON.parse(writes[1][1]!.body as string)).toEqual({ scryfallCardId: option.scryfallCardId })
})

test.each([true, false])('uncertain write reconciles authoritative state before success or another choice (committed=%s)', async committed => {
  const api = deckApi([pair])
  api.next(galleryPath(), () => response([option]))
  api.next(writePath(), () => Promise.reject(new TypeError('Network lost')), 'PUT')
  showDeckApp(); await open()
  const choice = await screen.findByRole('button', { name: /Illustration 1, Seite 2/ })
  const read = deferred<Response>()
  api.next('/api/decks', () => read.promise)
  fireEvent.click(choice)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Gespeichertes Artwork wird geprüft'))
  expect(choice).toBeDisabled()
  await act(async () => read.reject(new Error('Still offline')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Speicherergebnis ist unklar')
  expect(choice).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Schließen' })).toBeDisabled()
  api.state.decks = [committed ? updated() : pair]
  fireEvent.click(screen.getByRole('button', { name: 'Gespeicherten Stand prüfen' }))
  if (committed) await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  else {
    expect(await screen.findByRole('alert')).toHaveTextContent('Stand wurde geprüft')
    expect(choice).toBeEnabled()
  }
  expect(api.writes().filter(([url]) => url === writePath())).toHaveLength(1)
})

test('loading, empty, request retry, missing or broken imagery, current option and close make no accidental writes', async () => {
  const api = deckApi([pair]); const pending = deferred<Response>()
  api.next(galleryPath(), () => pending.promise)
  showDeckApp(); const { trigger } = await open()
  expect(screen.getByRole('status')).toHaveTextContent('Artworks werden geladen')
  await act(async () => pending.resolve(response({}, 503)))
  expect(await screen.findByRole('alert')).toHaveTextContent('Artworks konnten nicht geladen')
  api.next(galleryPath(), () => response([{ ...option, artCropUrl: null }]))
  fireEvent.click(screen.getByRole('button', { name: 'Erneut laden' }))
  expect(await screen.findByText('Keine verfügbaren Illustrationen gefunden.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(trigger).toHaveFocus())
  api.next(galleryPath(), () => response([first]))
  await open()
  const choice = await screen.findByRole('button', { name: /Illustration 1 auswählen/ })
  expect(choice).toHaveAttribute('aria-pressed', 'true')
  fireEvent.error(within(choice).getByRole('img'))
  expect(within(choice).getByText('Bild nicht verfügbar')).toBeInTheDocument()
  fireEvent.click(choice)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.writes()).toHaveLength(0)
})

test('retired gallery ignores late writes and authentication failures after route changes', async () => {
  const api = deckApi([pair]); const pending = deferred<Response>()
  api.next(galleryPath(), () => response([option])); api.next(writePath(), () => pending.promise, 'PUT')
  showDeckApp(); await open(); fireEvent.click(await screen.findByRole('button', { name: /Illustration 1, Seite 2/ }))
  await waitFor(() => expect(api.writes().filter(([url]) => url === writePath())).toHaveLength(1))
  act(() => { window.history.pushState(null, '', '/playgroups'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await act(async () => pending.resolve(response({}, 401)))
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
  expect(window.location.pathname).toBe('/playgroups')
})
