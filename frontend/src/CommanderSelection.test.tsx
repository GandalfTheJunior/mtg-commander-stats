import { clickAccountLogout } from './test/accountActions'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { deck, deckApi, editDeck, showDeckApp } from './test/deckFixtures'
import { savedCommander } from './test/commanderFixtures'
import { deferred, response, uid } from './test/gameFixtures'
import { scryfallUnavailable } from './api'

const fblthp = "Just like Fblthp, the card you're looking for seems to have gotten lost!"
const field = () => screen.getByRole('combobox', { name: 'Commander' })
const type = (value: string) => { fireEvent.change(field(), { target: { value } }); fireEvent.focus(field()) }
const saveButton = () => screen.getByRole('button', { name: 'Deck erstellen' })
const request = (name: string) => `/api/scryfall/commanders?q=${encodeURIComponent(name)}`
const piper = { ...savedCommander('The Prismatic Piper', ['U']), requiresChosenColor: true, thumbnailUrl: null }
const searches = (api: ReturnType<typeof deckApi>) => api.fetchMock.mock.calls.filter(([path]) => path.startsWith('/api/scryfall/commanders'))
async function create() {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Search deck' } })
  return api
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test('starts at two characters after a debounce and commits only an explicit keyboard selection', async () => {
  const api = await create()
  expect(field()).not.toHaveFocus()
  vi.useFakeTimers()
  for (const query of ['K', '\u0085\u001c', '  K ']) {
    type(query)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(searches(api)).toHaveLength(0)
  }
  type('Karn')
  await act(async () => { await vi.advanceTimersByTimeAsync(299) })
  expect(searches(api)).toHaveLength(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(searches(api)).toHaveLength(1)
  vi.useRealTimers()
  // Suggestion rows show name and colors, no thumbnail artwork.
  const option = await screen.findByRole('option', { name: 'Karn' })
  expect(option).toHaveAccessibleDescription('Farbidentität: Farblos')
  expect(option.querySelector('img')).toBeNull()
  expect(saveButton()).toBeDisabled()
  fireEvent.keyDown(field(), { key: 'ArrowDown' })
  fireEvent.keyDown(field(), { key: 'Enter' })
  const row = screen.getByRole('region', { name: 'Commander' })
  expect(row).toHaveTextContent('Karn')
  expect(within(row).getByRole('img', { name: 'Farbidentität: Farblos' })).toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Commander' })).not.toBeInTheDocument()
  expect(saveButton()).toBeEnabled()
  expect(api.writes()).toHaveLength(0)
})

test('at most five suggestions are visible in an internally scrolling list; dismissing keeps the typed text', async () => {
  const api = await create()
  api.next(request('Niv'), () => response(Array.from({ length: 7 }, (_, index) => ({ ...savedCommander(`Niv ${index}`, ['U', 'R']),
    selectionRef: { scryfallCardId: uid(600 + index) }, scryfallCardId: uid(600 + index), thumbnailUrl: null }))))
  type('Niv')
  const list = await screen.findByRole('listbox', { name: 'Commander: Vorschläge' })
  expect(within(list).getAllByRole('option')).toHaveLength(7)
  expect(list).toHaveStyle({ overflowY: 'auto', maxHeight: '280px' })
  fireEvent.keyDown(field(), { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(field()).toHaveValue('Niv')
  fireEvent.blur(field())
  expect(field()).toHaveValue('Niv')
  expect(screen.getByText('Kein Commander ausgewählt')).toBeInTheDocument()
  expect(api.writes()).toHaveLength(0)
})

test('Ändern reopens the search in place; leaving it without a selection keeps the previous card', async () => {
  const api = await create()
  type('Karn'); fireEvent.click(await screen.findByRole('option', { name: 'Karn' }))
  fireEvent.click(screen.getByRole('button', { name: 'Commander ändern' }))
  expect(field()).toHaveFocus()
  type('Other')
  await screen.findByRole('option', { name: 'Other' })
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl beibehalten' }))
  expect(screen.getByRole('region', { name: 'Commander' })).toHaveTextContent('Karn')
  fireEvent.click(saveButton())
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string).commanders).toEqual([{ selectionRef: deck.commanders[0].selectionRef }])
})

test('a required chosen color appears directly under its Commander and is submitted with the reference only', async () => {
  const api = await create()
  api.next(request(piper.name), () => response([piper]))
  type(piper.name); fireEvent.click(await screen.findByRole('option', { name: piper.name }))
  const row = screen.getByRole('region', { name: 'Commander' })
  const colors = within(row).getByRole('radiogroup', { name: `Farbe vor Spielbeginn – ${piper.name}` })
  expect(within(colors).getAllByRole('radio')).toHaveLength(5)
  expect(within(colors).getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true)
  expect(saveButton()).toBeDisabled()
  fireEvent.click(within(colors).getByRole('radio', { name: 'Rot' }))
  expect(within(row).getByRole('img', { name: 'Farbidentität: Blau, Rot' })).toBeInTheDocument()
  fireEvent.click(saveButton()); await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Search deck', format: 'COMMANDER',
    commanders: [{ selectionRef: piper.selectionRef, chosenColor: 'R' }] })
})

test('empty success and provider failure have exactly the agreed copy; retry repeats the current query and stale work stays retired', async () => {
  const api = await create()
  const old = deferred()
  api.next(request('Old'), () => old.promise)
  type('Old'); await waitFor(() => expect(searches(api)).toHaveLength(1))
  expect(screen.getByRole('progressbar', { name: 'Commander: Suche läuft' })).toBeInTheDocument()
  api.next(request('Empty'), () => response([])); type('Empty')
  await screen.findByText(fblthp)
  await act(async () => old.resolve(response([{ ...savedCommander('Old'), thumbnailUrl: null }])))
  expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument()
  api.next(request('Fail'), () => response({}, 503)); type('Fail')
  expect(screen.queryByText(fblthp)).not.toBeInTheDocument()
  await screen.findByText(scryfallUnavailable)
  api.next(request('Fail'), () => response([]))
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await screen.findByText(fblthp)
  expect(field()).toHaveValue('Fail')
  type(''); expect(screen.queryByText(fblthp)).not.toBeInTheDocument()
  expect(screen.queryByText(scryfallUnavailable)).not.toBeInTheDocument()
})

test('a partner-only result requires a counterpart and reversible references pass through without face controls', async () => {
  const api = await create()
  api.next(request('Face'), () => response([{ ...savedCommander('Background'), canBeSoleCommander: false, pairing: { roles: ['BACKGROUND'], partnerWith: [], variants: [] }, thumbnailUrl: null }]))
  type('Face')
  fireEvent.click(await screen.findByRole('option', { name: 'Background' }))
  expect(screen.getByText('Background benötigt einen kompatiblen zweiten Commander.')).toBeInTheDocument()
  expect(saveButton()).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Commander 2 entfernen' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Commander 1 ändern' }))
  api.next(request('Face'), () => response([{ ...savedCommander('Face Commander'), selectionRef: { scryfallCardId: deck.commanders[0].scryfallCardId, gameplayFaceIndex: 1 }, thumbnailUrl: null }]))
  type('Face')
  fireEvent.click(await screen.findByRole('option', { name: 'Face Commander' }))
  expect(screen.queryByRole('combobox', { name: 'Zweiter Commander' })).not.toBeInTheDocument()
  fireEvent.click(saveButton()); await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string).commanders[0].selectionRef.gameplayFaceIndex).toBe(1)
})

test('Pauper Commander searches use the selected format', async () => {
  const api = await create()
  fireEvent.click(screen.getByRole('radio', { name: 'Pauper Commander' }))
  expect(screen.getByRole('radio', { name: 'Pauper Commander' })).toHaveAttribute('aria-checked', 'true')
  type('Karn'); fireEvent.click(await screen.findByRole('option', { name: 'Karn' }))
  expect(searches(api).map(([path]) => path)).toEqual(['/api/scryfall/commanders?q=Karn&format=PAUPER_COMMANDER'])
  expect(screen.queryByRole('button', { name: /Companion hinzufügen/ })).not.toBeInTheDocument()
  fireEvent.click(saveButton()); await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toMatchObject({ format: 'PAUPER_COMMANDER' })
})

test.each([false, true])('saved choice restores without lookup and name-only edits omit Commanders (used=%s)', async everUsed => {
  const api = deckApi([{ ...deck, everUsed, commanders: [{ ...piper, chosenColor: 'R', effectiveColorIdentity: ['U', 'R'] }], colorIdentity: ['U', 'R'] }])
  showDeckApp(); await editDeck()
  expect(screen.getByRole('radio', { name: 'Rot' })).toBeChecked()
  if (everUsed) expect(screen.getByRole('radiogroup', { name: /Farbe vor Spielbeginn/ })).toHaveAttribute('aria-readonly', 'true')
  else expect(screen.getByRole('radiogroup', { name: /Farbe vor Spielbeginn/ })).not.toHaveAttribute('aria-readonly')
  if (everUsed) {
    fireEvent.click(screen.getByRole('radio', { name: 'Grün' }))
    expect(await screen.findByText('Feld gesperrt – dieses Deck wurde bereits gespielt.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Rot' })).toBeChecked()
  }
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Offline rename' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('Offline rename wurde gespeichert.')
  expect(api.fetchMock.mock.calls.some(([path]) => path.startsWith('/api/scryfall'))).toBe(false)
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Offline rename' })
})

test('navigation retires the search so a late unauthorized response cannot expire a later session', async () => {
  const api = deckApi(), pending = deferred()
  const { signInDeck } = await import('./test/deckFixtures')
  showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  api.next(request('Pending'), () => pending.promise)
  type('Pending'); await waitFor(() => expect(searches(api)).toHaveLength(1))
  const signal = searches(api)[0][1]!.signal!
  clickAccountLogout()
  await screen.findByText('Logged out.')
  expect(signal.aborted).toBe(true)
  await signInDeck()
  await act(async () => pending.resolve(response({}, 401)))
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
})
