import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { deck, deckApi, editDeck, showDeckApp } from './test/deckFixtures'
import { savedCommander } from './test/commanderFixtures'
import { deferred, response } from './test/gameFixtures'
import { scryfallUnavailable } from './api'

const field = () => screen.getByRole('combobox', { name: /^Commander/ })
const type = (value: string) => { fireEvent.change(field(), { target: { value } }); fireEvent.focus(field()) }
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
const request = (name: string) => `/api/scryfall/commanders?q=${encodeURIComponent(name)}`
const piper = { ...savedCommander('The Prismatic Piper', ['U']), requiresChosenColor: true, thumbnailUrl: null }
const searches = (api: ReturnType<typeof deckApi>) => api.fetchMock.mock.calls.filter(([path]) => path.startsWith('/api/scryfall'))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test('debounces, distinguishes neutral from colorless, and requires an explicit keyboard selection', async () => {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  expect(screen.queryByText('Farblos')).not.toBeInTheDocument()
  vi.useFakeTimers()
  for (const query of ['K', '\u0085\u001c', ' \u00a0K\u202f']) {
    type(query)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(searches(api)).toHaveLength(0)
  }
  type('Karn')
  await act(async () => { await vi.advanceTimersByTimeAsync(299) })
  expect(searches(api)).toHaveLength(0)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(searches(api)).toHaveLength(1)
  const option = screen.getByRole('option', { name: 'Karn' })
  expect(option).toHaveTextContent(/^Karn$/)
  expect(within(option).queryByRole('img')).not.toBeInTheDocument()
  fireEvent.keyDown(field(), { key: 'ArrowDown' }); fireEvent.keyDown(field(), { key: 'Enter' })
  expect(screen.getByText('Farblos')).toBeInTheDocument()
  type('Karn ')
  expect(screen.queryByText('Farblos')).not.toBeInTheDocument()
  type('Karn')
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  save()
  expect(screen.getByText('Bitte einen Commander aus den Suchergebnissen wählen.')).toBeInTheDocument()
  expect(api.writes()).toHaveLength(0)
})

test('separate mandatory single-color picker combines base identity, resets on typing, and submits only selectionRef/chosenColor', async () => {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  api.next(request(piper.name), () => response([piper]))
  type(piper.name); fireEvent.click(await screen.findByRole('option', { name: piper.name }))
  expect(screen.queryByText('Farblos')).not.toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(5)
  expect(screen.getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true)
  save(); expect(screen.getByText('Bitte eine Farbe wählen.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Rot' }))
  expect(screen.getByRole('button', { name: 'Blau (U)' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toBeDisabled()
  type('The Prismatic Pipe')
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  api.next(request(piper.name), () => response([piper]))
  type(piper.name); fireEvent.click(await screen.findByRole('option', { name: piper.name }))
  expect(screen.getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true)
  fireEvent.click(screen.getByRole('radio', { name: 'Grün' }))
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Piper Deck' } })
  save(); await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Piper Deck', commanders: [{ selectionRef: piper.selectionRef, chosenColor: 'G' }] })
})

test('empty success and provider failure have exactly the agreed copy; retry uses current query and stale work stays retired', async () => {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  const old = deferred()
  api.next(request('Old'), () => old.promise)
  type('Old'); await waitFor(() => expect(searches(api)).toHaveLength(1))
  expect(screen.getByRole('progressbar', { name: 'Commander werden gesucht' })).toBeInTheDocument()
  api.next(request('Empty'), () => response([])); type('Empty')
  const empty = "Just like Fblthp, the card you're looking for seems to have gotten lost!"
  await screen.findByText(empty)
  await act(async () => old.resolve(response([{ ...savedCommander('Old'), thumbnailUrl: null }])))
  expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument()
  api.next(request('Fail'), () => response({}, 503)); type('Fail')
  expect(screen.queryByText(empty)).not.toBeInTheDocument()
  await screen.findByText(scryfallUnavailable)
  expect(screen.queryByText('Scryfall ist gerade nicht erreichbar')).not.toBeInTheDocument()
  api.next(request('Fail'), () => response([]))
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await screen.findByText(empty)
  expect(field()).toHaveValue('Fail')
  type(''); expect(screen.queryByText(empty)).not.toBeInTheDocument()
  expect(screen.queryByText(scryfallUnavailable)).not.toBeInTheDocument()
})

test('a partner-only result requires a counterpart and reversible references pass through without technical face controls', async () => {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  api.next(request('Face'), () => response([{ ...savedCommander('Background'), canBeSoleCommander: false, pairing: { roles: ['BACKGROUND'], partnerWith: [], variants: [] }, thumbnailUrl: null },
    { ...savedCommander('Face Commander'), selectionRef: { scryfallCardId: deck.commanders[0].scryfallCardId, gameplayFaceIndex: 1 }, thumbnailUrl: null }]))
  type('Face')
  const background = await screen.findByRole('option', { name: 'Background' })
  expect(background).toHaveAttribute('aria-disabled', 'false')
  fireEvent.click(background)
  expect(field()).toHaveValue('Background')
  save(); expect(api.writes()).toHaveLength(0)
  api.next(request('Face'), () => response([{ ...savedCommander('Face Commander'), selectionRef: { scryfallCardId: deck.commanders[0].scryfallCardId, gameplayFaceIndex: 1 }, thumbnailUrl: null }]))
  type('Face')
  await screen.findByRole('option', { name: 'Face Commander' })
  fireEvent.click(screen.getByRole('option', { name: 'Face Commander' }))
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Face Deck' } })
  save(); await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string).commanders[0].selectionRef.gameplayFaceIndex).toBe(1)
})

test.each([false, true])('saved choice restores without lookup and name-only edits omit Commanders (used=%s)', async everUsed => {
  const api = deckApi([{ ...deck, everUsed, commanders: [{ ...piper, chosenColor: 'R', effectiveColorIdentity: ['U', 'R'] }], colorIdentity: ['U', 'R'] }])
  showDeckApp(); await editDeck()
  expect(screen.getByRole('radio', { name: 'Rot' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Rot' })).toHaveProperty('disabled', everUsed)
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Offline rename' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await screen.findByText('Offline rename wurde gespeichert.')
  expect(searches(api)).toHaveLength(0)
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Offline rename' })
})

test('navigation retires the search so a late unauthorized response cannot expire a later session', async () => {
  const api = deckApi(), pending = deferred()
  const { signInDeck } = await import('./test/deckFixtures')
  showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  api.next(request('Pending'), () => pending.promise)
  type('Pending'); await waitFor(() => expect(searches(api)).toHaveLength(1))
  const signal = searches(api)[0][1]!.signal!
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Logged out.')
  expect(signal.aborted).toBe(true)
  await signInDeck()
  await act(async () => pending.resolve(response({}, 401)))
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
})
