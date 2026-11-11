import { clickAccountLogout } from './test/accountActions'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { collectionOverflows } from './collectionLayout'
import { savedCommander } from './test/commanderFixtures'
import { deck, deckApi, editDeck, newDeck, showDeckApp, signInDeck } from './test/deckFixtures'
import { deferred, response, uid } from './test/gameFixtures'

// jsdom has no layout; each test decides whether the collection overflows the viewport.
vi.mock('./collectionLayout', () => ({ collectionOverflows: vi.fn(() => false) }))
beforeEach(() => vi.mocked(collectionOverflows).mockReturnValue(false))
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

const named = (id: number, name: string, commander = 'Karn', extra = {}) => ({ ...deck, id: uid(id), name, commanders: [savedCommander(commander)], ...extra })
const cardNames = (list: HTMLElement) => within(list).getAllByRole('button', { name: / bearbeiten$/ }).map(button => button.getAttribute('aria-label'))
const search = () => screen.getByRole('searchbox', { name: 'Deckname oder Commander suchen' })

test('overview has no embedded forms, refresh or management controls, and opens exactly the selected deck', async () => {
  deckApi([deck, named(103, 'Other')]); showDeckApp()
  await screen.findByRole('button', { name: 'Other bearbeiten' })
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  for (const name of [/aktualisieren/i, 'Löschen', 'Archivieren', 'Deckaktionen']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Deck erstellen' })).toBeInTheDocument()
  await editDeck('Other')
  expect(window.location.pathname).toBe(`/decks/${uid(103)}/edit`)
  expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('Other')
})
test('active decks come first and each section sorts by name then UUID; archived decks start collapsed', async () => {
  deckApi([named(110, 'beta'), named(109, 'Alpha'), named(108, 'Zeta', 'Karn', { archived: true }), named(107, 'alpha'),
    named(106, 'Gamma', 'Karn', { archived: true, everUsed: true })]); showDeckApp()
  const active = await screen.findByRole('list', { name: 'Aktive Decks' })
  expect(cardNames(active)).toEqual(['alpha bearbeiten', 'Alpha bearbeiten', 'beta bearbeiten'])
  const toggle = screen.getByRole('button', { name: 'Archivierte Decks', expanded: false })
  expect(screen.queryByRole('list', { name: 'Archivierte Decks' })).not.toBeInTheDocument()
  fireEvent.click(toggle)
  expect(cardNames(screen.getByRole('list', { name: 'Archivierte Decks' }))).toEqual(['Gamma bearbeiten', 'Zeta bearbeiten'])
  // Archived cards look like active cards: no per-card status badge.
  expect(screen.getByRole('list', { name: 'Archivierte Decks' })).not.toHaveTextContent(/archiv/i)
})
test('empty, archive-only and no-archive states are distinct', async () => {
  const api = deckApi([]); const view = showDeckApp()
  expect(await screen.findByText(/Noch keine Decks vorhanden/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Deck erstellen' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Erstes Deck erstellen' }))
  await screen.findByRole('heading', { name: 'Deck erstellen' })
  view.unmount(); api.state.decks = [named(108, 'Old', 'Karn', { archived: true })]; showDeckApp('/decks')
  expect(await screen.findByText('Keine aktiven Decks vorhanden.')).toBeInTheDocument()
  expect(screen.queryByText(/Noch keine Decks vorhanden/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Archivierte Decks' })).toBeInTheDocument()
})
test('without archived decks the archive section is omitted entirely', async () => {
  deckApi([deck]); showDeckApp()
  await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  expect(screen.queryByText('Archivierte Decks')).not.toBeInTheDocument()
})
test.each([401, 500, 'network'] as const)('initial list failure %s is an honest error with retry, never an empty collection', async status => {
  const api = deckApi(); api.next('/api/decks', () => {
    if (status === 'network') throw new Error('offline')
    return response({}, status)
  }); showDeckApp()
  await screen.findByText(status === 401 ? 'Your session expired. Sign in again.' : 'Deine Decks konnten nicht geladen werden.')
  expect(screen.queryByText(deck.name)).not.toBeInTheDocument()
  expect(screen.queryByText(/Noch keine Decks vorhanden/)).not.toBeInTheDocument()
  if (status !== 401) {
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByRole('button', { name: `${deck.name} bearbeiten` })).toBeInTheDocument()
  }
  expect(api.writes()).toHaveLength(0)
})
test('an initial pending list shows card placeholders, never unconfirmed deck data; retirement aborts it', async () => {
  const api = deckApi(), pending = deferred(); api.next('/api/decks', () => pending.promise)
  showDeckApp(); await screen.findByText('Decks werden geladen…')
  expect(screen.getByRole('heading', { name: 'Meine Decks' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Deck erstellen' })).toBeInTheDocument()
  const signal = api.fetchMock.mock.calls.find(([path]) => path === '/api/decks')![1]!.signal!
  await newDeck()
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(response([{ ...deck, name: 'Retired' }])))
  expect(screen.queryByText('Retired')).not.toBeInTheDocument()
})
test('search appears only when the full collection overflows and matches deck or Commander names across both sections', async () => {
  vi.mocked(collectionOverflows).mockReturnValue(true)
  deckApi([named(101, 'Atraxas Garten', "Atraxa, Praetors' Voice"), named(102, 'Gift', 'Karn'), named(103, 'Archiv', 'Atraxa, Grand Unifier', { archived: true })])
  showDeckApp()
  await screen.findByRole('button', { name: 'Gift bearbeiten' })
  const archive = screen.getByRole('button', { name: 'Archivierte Decks', expanded: false })
  fireEvent.change(search(), { target: { value: 'ATRAXA' } })
  expect(cardNames(screen.getByRole('list', { name: 'Aktive Decks' }))).toEqual(['Atraxas Garten bearbeiten'])
  // Matches in the archive expand it temporarily.
  expect(archive).toHaveAttribute('aria-expanded', 'true')
  expect(cardNames(screen.getByRole('list', { name: 'Archivierte Decks' }))).toEqual(['Archiv bearbeiten'])
  fireEvent.change(search(), { target: { value: 'gift' } })
  expect(screen.queryByRole('button', { name: 'Archivierte Decks' })).not.toBeInTheDocument()
  fireEvent.change(search(), { target: { value: 'nothing' } })
  expect(screen.getByText('Keine passenden Decks gefunden')).toBeInTheDocument()
  expect(screen.queryByText('Aktive Decks')).not.toBeInTheDocument()
  expect(search()).toHaveValue('nothing')
  // Clearing restores the state before the search; search stays available.
  fireEvent.change(search(), { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'Archivierte Decks' })).toHaveAttribute('aria-expanded', 'false')
  expect(search()).toBeInTheDocument()
})
test('a collection that fits the viewport has no search field', async () => {
  deckApi([deck, named(103, 'Other', 'Karn', { archived: true })]); showDeckApp()
  await screen.findByRole('button', { name: `${deck.name} bearbeiten` })
  expect(vi.mocked(collectionOverflows)).toHaveBeenCalled()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
})
test('returning from the editor restores search, archive state and scroll; fresh results are re-filtered', async () => {
  vi.mocked(collectionOverflows).mockReturnValue(true)
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const api = deckApi([named(101, 'Garten', 'Atraxa'), named(102, 'Gift', 'Karn'), named(103, 'Archiv', 'Karn', { archived: true })])
  showDeckApp()
  await screen.findByRole('button', { name: 'Gift bearbeiten' })
  fireEvent.click(screen.getByRole('button', { name: 'Archivierte Decks' }))
  fireEvent.change(search(), { target: { value: 'g' } })
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 })
  await editDeck('Gift')
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Umbenannt' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('Umbenannt wurde gespeichert.')
  // The renamed deck no longer matches "g" and legitimately disappears.
  expect(await screen.findByRole('searchbox', { name: 'Deckname oder Commander suchen' })).toHaveValue('g')
  await waitFor(() => expect(cardNames(screen.getByRole('list', { name: 'Aktive Decks' }))).toEqual(['Garten bearbeiten']))
  // No archived deck matches "g", so the archive section is hidden while searching.
  expect(screen.queryByRole('button', { name: 'Archivierte Decks' })).not.toBeInTheDocument()
  fireEvent.change(search(), { target: { value: '' } })
  expect(screen.getByRole('button', { name: 'Archivierte Decks' })).toHaveAttribute('aria-expanded', 'true')
  expect(scrollTo).toHaveBeenCalledWith(0, 420)
  expect(api.writes()).toHaveLength(1)
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  scrollTo.mockRestore()
})
test('a fresh visit through navigation does not restore an older collection context', async () => {
  vi.mocked(collectionOverflows).mockReturnValue(true)
  deckApi([deck, named(103, 'Other')]); showDeckApp()
  await screen.findByRole('button', { name: 'Other bearbeiten' })
  fireEvent.change(search(), { target: { value: 'Other' } })
  await editDeck('Other')
  fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
  await screen.findByRole('heading', { name: 'Dashboard' })
  fireEvent.click(screen.getByRole('link', { name: 'Decks' }))
  expect(await screen.findByRole('searchbox', { name: 'Deckname oder Commander suchen' })).toHaveValue('')
})

test('logout retires owner links and late list responses cannot restore links in a replacement session', async () => {
  const api = deckApi([{ ...deck, manaBoxUrl: 'https://manabox.app/decks/Synthetic-Mixed_123' }]), pending = deferred()
  showDeckApp(); await screen.findByRole('link', { name: /ManaBox/ })
  api.next('/api/decks', () => pending.promise)
  fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Decks' }))
  expect(screen.queryByRole('link', { name: /ManaBox/ })).not.toBeInTheDocument()
  clickAccountLogout()
  await screen.findByText('Logged out.')
  api.state.decks = [deck]
  await signInDeck()
  await act(async () => pending.resolve(response([{ ...deck, manaBoxUrl: 'https://manabox.app/decks/Retired' }])))
  expect(screen.queryByRole('link', { name: /ManaBox/ })).not.toBeInTheDocument()
})
