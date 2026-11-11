import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { deck, deckApi, showDeckApp } from './test/deckFixtures'
import { savedCommander } from './test/commanderFixtures'
import { deferred, response, uid } from './test/gameFixtures'
import { scryfallUnavailable, type CommanderChoice, type SavedCommander } from './api'

const firstField = () => screen.getByRole('combobox', { name: /^Commander( 1)?$/ })
const secondField = () => screen.getByRole('combobox', { name: /Zweiter Commander|Doctor's companion/ })
const input = (field: HTMLElement, text: string) => { fireEvent.change(field, { target: { value: text } }); fireEvent.focus(field) }
const path = (query: string, choice?: CommanderChoice) => `/api/scryfall/commanders?q=${encodeURIComponent(query)}${choice ? `&partnerOf=${choice.selectionRef.scryfallCardId}${choice.selectionRef.gameplayFaceIndex !== undefined ? `&partnerGameplayFaceIndex=${choice.selectionRef.gameplayFaceIndex}` : ''}` : ''}`
const choice = (name: string, roles: string[], id = 302): CommanderChoice => ({ ...savedCommander(name), thumbnailUrl: null,
  scryfallCardId: uid(id), selectionRef: { scryfallCardId: uid(id) }, pairing: { roles, partnerWith: [], variants: [] } })
const piper = { ...choice('The Prismatic Piper', ['PARTNER']), requiresChosenColor: true }
const partner = { ...choice('Second Piper', ['PARTNER'], 303), requiresChosenColor: true, colorIdentity: ['U'] as const }
const searches = (api: ReturnType<typeof deckApi>) => api.fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/scryfall/commanders'))
const save = () => screen.getByRole('button', { name: 'Deck erstellen' })
async function start() {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Pair deck' } })
  return api
}
async function selectFirst(api: ReturnType<typeof deckApi>, card: CommanderChoice) {
  api.next(path(card.name), () => response([card])); input(firstField(), card.name)
  fireEvent.click(await screen.findByRole('option', { name: card.name }))
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test('ordinary Partner is added explicitly; both slots contribute and each requires its own pregame color', async () => {
  const api = await start(); await selectFirst(api, piper)
  expect(screen.queryByRole('combobox', { name: 'Zweiter Commander' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' }))
  expect(secondField()).toHaveValue('')
  expect(secondField()).toHaveFocus()
  expect(searches(api)).toHaveLength(1)
  vi.useFakeTimers()
  input(secondField(), 'S'); await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(searches(api)).toHaveLength(1)
  api.next(path('Second', piper), () => response([partner])); input(secondField(), 'Second')
  await act(async () => { await vi.advanceTimersByTimeAsync(299) }); expect(searches(api)).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.getByRole('option', { name: partner.name })).toBeInTheDocument()
  fireEvent.keyDown(secondField(), { key: 'Enter' })
  vi.useRealTimers()
  const one = screen.getByRole('region', { name: 'Commander 1' }), two = screen.getByRole('region', { name: 'Commander 2' })
  expect(two).toHaveTextContent(partner.name)
  fireEvent.click(within(one).getByRole('radio', { name: 'Rot' }))
  expect(save()).toBeDisabled()
  fireEvent.click(within(two).getByRole('radio', { name: 'Grün' }))
  expect(within(two).getByRole('img', { name: 'Farbidentität: Blau, Grün' })).toBeInTheDocument()
  expect(save()).toBeEnabled()
  fireEvent.click(save())
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Pair deck', format: 'COMMANDER', commanders: [
    { selectionRef: piper.selectionRef, chosenColor: 'R' }, { selectionRef: partner.selectionRef, chosenColor: 'G' }] })
})

test.each([
  ['Faceless One', ['BACKGROUND', 'CHOOSE_BACKGROUND'], '+ Zweiten Commander hinzufügen'],
  ['Choose commander', ['CHOOSE_BACKGROUND'], '+ Zweiten Commander hinzufügen'],
  ['Doctor', ['DOCTOR'], "+ Doctor's companion hinzufügen"],
  ['Clara', ['COMPANION'], '+ Zweiten Commander hinzufügen'],
  ['Friends', [], '+ Zweiten Commander hinzufügen'],
] as const)('%s offers an optional second Commander without requiring a pair', async (name, roles, action) => {
  const api = await start()
  await selectFirst(api, { ...choice(name, [...roles]), pairing: { roles: [...roles], partnerWith: [], variants: name === 'Friends' ? ['friends forever'] : [] } })
  expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
  fireEvent.click(save())
  await waitFor(() => expect(api.writes()).toHaveLength(1))
})

test('a mandatory counterpart reveals its search with an explanation and cannot be removed alone', async () => {
  const api = await start()
  const background = { ...choice('Background', ['BACKGROUND']), canBeSoleCommander: false }
  const chooser = { ...choice('Chooser', ['CHOOSE_BACKGROUND'], 303) }
  await selectFirst(api, background)
  expect(screen.getByText('Background benötigt einen kompatiblen zweiten Commander.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Auswahl beibehalten' })).not.toBeInTheDocument()
  expect(save()).toBeDisabled()
  api.next(path('Chooser', background), () => response([chooser])); input(secondField(), 'Chooser')
  fireEvent.click(await screen.findByRole('option', { name: 'Chooser' }))
  expect(screen.queryByRole('button', { name: 'Commander 2 entfernen' })).not.toBeInTheDocument()
  expect(save()).toBeEnabled()
})

test('Partner with immediately suggests its counterpart, which still requires an explicit selection; removal offers Undo', async () => {
  const api = await start()
  const named = { ...choice('Named first', []), pairing: { roles: [], variants: [], partnerWith: ['named second'] } }
  const reciprocal = { ...choice('Named second', [], 303), pairing: { roles: [], variants: [], partnerWith: ['named first'] } }
  await selectFirst(api, named)
  api.next(path('', named), () => response([reciprocal]))
  fireEvent.click(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' }))
  const suggestion = await screen.findByRole('option', { name: 'Named second' })
  expect(secondField()).toHaveValue('')
  expect(screen.queryByRole('button', { name: 'Commander 2 ändern' })).not.toBeInTheDocument()
  fireEvent.click(suggestion)
  expect(screen.getByRole('region', { name: 'Commander 2' })).toHaveTextContent('Named second')
  fireEvent.click(screen.getByRole('button', { name: 'Commander 2 entfernen' }))
  expect(screen.getByRole('status')).toHaveTextContent('Zweiter Commander entfernt.')
  expect(screen.queryByRole('button', { name: 'Commander 2 ändern' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  expect(screen.getByRole('region', { name: 'Commander 2' })).toHaveTextContent('Named second')
  fireEvent.click(screen.getByRole('button', { name: 'Commander 2 entfernen' }))
  fireEvent.click(save())
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string).commanders).toHaveLength(1)
  // The suggestion was requested once, when the second search opened.
  expect(searches(api).filter(([url]) => url === path('', named))).toHaveLength(1)
})

test('replacing the first Commander keeps a still compatible partner but removes an incompatible one with Undo', async () => {
  const api = await start(); await selectFirst(api, choice('First', ['PARTNER']))
  fireEvent.click(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' }))
  const second = choice('Second', ['PARTNER'], 303)
  api.next(path('Second', choice('First', ['PARTNER'])), () => response([second])); input(secondField(), 'Second')
  fireEvent.click(await screen.findByRole('option', { name: 'Second' }))
  // Another ordinary Partner stays compatible.
  fireEvent.click(screen.getByRole('button', { name: 'Commander 1 ändern' }))
  const other = choice('Other partner', ['PARTNER'], 304)
  api.next(path('Other'), () => response([other])); input(firstField(), 'Other')
  fireEvent.click(await screen.findByRole('option', { name: 'Other partner' }))
  expect(screen.getByRole('region', { name: 'Commander 2' })).toHaveTextContent('Second')
  // A Commander without pairing removes the second slot, explained inline and undoable.
  fireEvent.click(screen.getByRole('button', { name: 'Commander 1 ändern' }))
  const omnath = choice('Omnath', [], 305)
  api.next(path('Omnath'), () => response([omnath])); input(firstField(), 'Omnath')
  fireEvent.click(await screen.findByRole('option', { name: 'Omnath' }))
  expect(screen.getByRole('status')).toHaveTextContent('Zweiter Commander entfernt, da er nicht mehr kompatibel ist.')
  expect(screen.queryByRole('region', { name: 'Commander 2' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
  expect(screen.getByRole('region', { name: 'Commander 1' })).toHaveTextContent('Other partner')
  expect(screen.getByRole('region', { name: 'Commander 2' })).toHaveTextContent('Second')
  expect(api.writes()).toHaveLength(0)
})

test('replacing the first Commander retires second-search requests and their late unauthorized responses', async () => {
  const api = await start(); await selectFirst(api, piper)
  fireEvent.click(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' }))
  const pending = deferred(); api.next(path('Pending', piper), () => pending.promise)
  input(secondField(), 'Pending'); await waitFor(() => expect(searches(api)).toHaveLength(2))
  const signal = searches(api)[1][1]!.signal!
  fireEvent.click(screen.getByRole('button', { name: 'Commander ändern' }))
  const omnath = choice('Omnath', [], 305)
  api.next(path('Omnath'), () => response([omnath])); input(firstField(), 'Omnath')
  fireEvent.click(await screen.findByRole('option', { name: 'Omnath' }))
  expect(screen.queryByRole('combobox', { name: 'Zweiter Commander' })).not.toBeInTheDocument()
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(response({}, 401)))
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
})

test('second-search provider failure, retry and empty results stay inline', async () => {
  const api = await start(); const ordinary = choice('First', ['PARTNER'])
  await selectFirst(api, ordinary)
  fireEvent.click(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' }))
  api.next(path('Fail', ordinary), () => response({}, 503)); input(secondField(), 'Fail')
  await screen.findByText(scryfallUnavailable)
  api.next(path('Fail', ordinary), () => response([])); fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await screen.findByText("Just like Fblthp, the card you're looking for seems to have gotten lost!")
  expect(secondField()).toHaveValue('Fail')
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl beibehalten' }))
  expect(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' })).toBeInTheDocument()
  fireEvent.click(save())
  await waitFor(() => expect(api.writes()).toHaveLength(1))
})

test.each([false, true])('saved pairs restore both colors offline and used pairs stay locked (used=%s)', async everUsed => {
  const one: SavedCommander = { ...savedCommander(piper.name), ...piper, chosenColor: 'R', effectiveColorIdentity: ['R'] }
  const two: SavedCommander = { ...savedCommander('Second'), ...choice('Second', ['PARTNER'], 303), position: 2, oracleId: uid(402), chosenColor: 'U', requiresChosenColor: true, effectiveColorIdentity: ['U'] }
  const api = deckApi([{ ...deck, everUsed, commanders: [one, two], colorIdentity: ['U', 'R'] }]); showDeckApp(`/decks/${deck.id}/edit`)
  await screen.findByRole('textbox', { name: /Deckname/ })
  const regions = [screen.getByRole('region', { name: 'Commander 1' }), screen.getByRole('region', { name: 'Commander 2' })]
  expect(regions[0]).toHaveTextContent(piper.name); expect(regions[1]).toHaveTextContent('Second')
  expect(within(regions[0]).getByRole('radio', { name: 'Rot' })).toBeChecked()
  expect(within(regions[1]).getByRole('radio', { name: 'Blau' })).toBeChecked()
  expect(within(regions[1]).queryByRole('button', { name: 'Commander 2 entfernen' }) === null).toBe(everUsed)
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Offline pair' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Offline pair' })
  expect(searches(api)).toHaveLength(0)
})

test('restoring a saved single Partner with Commander does not search for its counterpart during an offline rename', async () => {
  const named: SavedCommander = { ...savedCommander('Named first'), pairing: { roles: [], variants: [], partnerWith: ['named second'] } }
  const api = deckApi([{ ...deck, commanders: [named] }]); showDeckApp(`/decks/${deck.id}/edit`)
  await screen.findByRole('textbox', { name: /Deckname/ })
  expect(screen.getByRole('button', { name: '+ Zweiten Commander hinzufügen' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Offline named' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Offline named' })
  expect(searches(api)).toHaveLength(0)
})
