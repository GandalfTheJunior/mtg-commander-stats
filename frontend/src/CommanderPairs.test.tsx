import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { deck, deckApi, showDeckApp } from './test/deckFixtures'
import { savedCommander } from './test/commanderFixtures'
import { deferred, response, uid } from './test/gameFixtures'
import { scryfallUnavailable, type CommanderChoice, type SavedCommander } from './api'

const first = () => screen.getByRole('combobox', { name: /^Commander/ })
const second = () => screen.getByRole('combobox', { name: /Zweiter Commander|Doctor's companion/ })
const input = (field: HTMLElement, text: string) => { fireEvent.change(field, { target: { value: text } }); fireEvent.focus(field) }
const path = (query: string, choice?: CommanderChoice) => `/api/scryfall/commanders?q=${encodeURIComponent(query)}${choice ? `&partnerOf=${choice.selectionRef.scryfallCardId}${choice.selectionRef.gameplayFaceIndex !== undefined ? `&partnerGameplayFaceIndex=${choice.selectionRef.gameplayFaceIndex}` : ''}` : ''}`
const choice = (name: string, roles: string[], id = 302): CommanderChoice => ({ ...savedCommander(name), thumbnailUrl: null,
  scryfallCardId: uid(id), selectionRef: { scryfallCardId: uid(id) }, pairing: { roles, partnerWith: [], variants: [] } })
const piper = { ...choice('The Prismatic Piper', ['PARTNER']), requiresChosenColor: true }
const partner = { ...choice('Second Piper', ['PARTNER'], 303), requiresChosenColor: true, colorIdentity: ['U'] as const }
const searches = (api: ReturnType<typeof deckApi>) => api.fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/scryfall/'))
async function start() {
  const api = deckApi(); showDeckApp('/decks/new'); await screen.findByRole('textbox', { name: /Deckname/ })
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Pair deck' } })
  return api
}
async function selectFirst(api: ReturnType<typeof deckApi>, card: CommanderChoice) {
  api.next(path(card.name), () => response([card])); input(first(), card.name)
  fireEvent.click(await screen.findByRole('option', { name: card.name }))
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

test('ordinary Partner opens an empty debounced search; both choices contribute and each slot requires its own pregame color', async () => {
  const api = await start(); await selectFirst(api, piper)
  expect(second()).toHaveValue('')
  expect(searches(api)).toHaveLength(1)
  vi.useFakeTimers()
  input(second(), 'S'); await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(searches(api)).toHaveLength(1)
  api.next(path('Second', piper), () => response([partner])); input(second(), 'Second')
  await act(async () => { await vi.advanceTimersByTimeAsync(299) }); expect(searches(api)).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  const result = screen.getByRole('option', { name: partner.name }); expect(result).toHaveTextContent(/^Second Piper$/)
  fireEvent.keyDown(second(), { key: 'ArrowDown' }); fireEvent.keyDown(second(), { key: 'Enter' })
  vi.useRealTimers()
  const groups = screen.getAllByRole('radiogroup')
  expect(groups).toHaveLength(2)
  fireEvent.click(within(groups[0]).getByRole('radio', { name: 'Rot' }))
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  expect(api.writes()).toHaveLength(0)
  expect(screen.getByText('Bitte eine Farbe für den zweiten Commander wählen.')).toBeInTheDocument()
  fireEvent.click(within(groups[1]).getByRole('radio', { name: 'Grün' }))
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Blau (U)' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Grün (G)' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Pair deck', commanders: [
    { selectionRef: piper.selectionRef, chosenColor: 'R' }, { selectionRef: partner.selectionRef, chosenColor: 'G' }] })
})

test.each([
  ['Background', ['BACKGROUND'], false, 'erforderlich'],
  ['Faceless One', ['BACKGROUND', 'CHOOSE_BACKGROUND'], true, 'optional'],
  ['Choose commander', ['CHOOSE_BACKGROUND'], true, 'optional'],
  ['Doctor', ['DOCTOR'], true, "Doctor's companion (optional)"],
  ['Clara', ['COMPANION'], true, 'optional'],
  ['Friends', [], true, 'optional'],
] as const)('%s reveals the appropriate second field without requiring a pair for a standalone choice', async (name, roles, sole, label) => {
  const api = await start()
  const card = { ...choice(name, [...roles]), canBeSoleCommander: sole,
    pairing: { roles: [...roles], partnerWith: [], variants: name === 'Friends' ? ['friends forever'] : [] } }
  await selectFirst(api, card)
  expect(second()).toHaveAccessibleName(expect.stringContaining(label))
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  if (sole) await waitFor(() => expect(api.writes()).toHaveLength(1))
  else { expect(api.writes()).toHaveLength(0); expect(second()).toHaveFocus() }
})

test('Partner with offers an immediate explicit button that can be dismissed, keyboard activated and removed without forcing a pair', async () => {
  const api = await start()
  const named = { ...choice('Named first', []), pairing: { roles: [], variants: [], partnerWith: ['named second'] } }
  const reciprocal = { ...choice('Named second', [], 303), pairing: { roles: [], variants: [], partnerWith: ['named first'] } }
  api.next(path('', named), () => response([reciprocal]))
  await selectFirst(api, named)
  expect(await screen.findByRole('button', { name: 'Named second' })).toBeInTheDocument()
  expect(second()).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Vorschlag ausblenden' }))
  expect(screen.queryByRole('button', { name: 'Named second' })).not.toBeInTheDocument()
  expect(second()).toHaveValue('')
  api.next(path('Named', named), () => response([reciprocal])); input(second(), 'Named')
  await screen.findByRole('option', { name: reciprocal.name })
  fireEvent.keyDown(second(), { key: 'ArrowDown' }); fireEvent.keyDown(second(), { key: 'Enter' })
  expect(second()).toHaveValue(reciprocal.name)
  fireEvent.click(screen.getByRole('button', { name: 'Zweiten Commander entfernen' }))
  expect(second()).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string).commanders).toHaveLength(1)
})

test('editing either selection clears its colors; replacing first retires second requests and their late unauthorized responses', async () => {
  const api = await start(); await selectFirst(api, piper)
  const pending = deferred(); api.next(path('Pending', piper), () => pending.promise)
  input(second(), 'Pending'); await waitFor(() => expect(searches(api)).toHaveLength(2))
  const signal = searches(api)[1][1]!.signal!
  input(first(), 'New commander')
  expect(screen.queryByRole('combobox', { name: /Zweiter Commander/ })).not.toBeInTheDocument()
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(response({}, 401)))
  expect(screen.queryByText(/session expired/)).not.toBeInTheDocument()
  expect(first()).toHaveValue('New commander')
})

test('second query invalidation never restores a reference from the same typed name; errors, retry, empty and broken images stay inline', async () => {
  const api = await start(); const ordinary = choice('First', ['PARTNER']); const other = { ...choice('Second', ['PARTNER'], 303), colorIdentity: ['R'] }
  await selectFirst(api, ordinary)
  api.next(path('Second', ordinary), () => response([{ ...other, thumbnailUrl: 'https://cards.scryfall.io/missing.jpg' }]))
  input(second(), 'Second'); const option = await screen.findByRole('option', { name: other.name })
  fireEvent.error(option.querySelector('img')!); expect(option.querySelector('img')).toBeNull()
  fireEvent.click(option); expect(screen.getByRole('button', { name: 'Rot (R)' })).toHaveAttribute('aria-pressed', 'true')
  input(second(), 'Secon'); input(second(), 'Second')
  expect(screen.getByRole('button', { name: 'Rot (R)' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' })); expect(api.writes()).toHaveLength(0)
  api.next(path('Fail', ordinary), () => response({}, 503)); input(second(), 'Fail')
  await screen.findByText(scryfallUnavailable)
  api.next(path('Fail', ordinary), () => response([])); fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await screen.findByText("Just like Fblthp, the card you're looking for seems to have gotten lost!")
  input(second(), ''); expect(screen.queryByText(scryfallUnavailable)).not.toBeInTheDocument()
})

test.each([false, true])('saved pairs restore both colors offline and used pairs stay locked (used=%s)', async everUsed => {
  const one: SavedCommander = { ...savedCommander(piper.name), ...piper, chosenColor: 'R', effectiveColorIdentity: ['R'] }
  const two: SavedCommander = { ...savedCommander('Second'), ...choice('Second', ['PARTNER'], 303), position: 2, oracleId: uid(402), chosenColor: 'U', requiresChosenColor: true, effectiveColorIdentity: ['U'] }
  const api = deckApi([{ ...deck, everUsed, commanders: [one, two], colorIdentity: ['U', 'R'] }]); showDeckApp(`/decks/${deck.id}/edit`)
  await screen.findByRole('textbox', { name: /Deckname/ })
  expect(first()).toHaveValue(piper.name); expect(second()).toHaveValue('Second')
  const colors = screen.getAllByRole('radiogroup')
  expect(within(colors[0]).getByRole('radio', { name: 'Rot' })).toBeChecked()
  expect(within(colors[1]).getByRole('radio', { name: 'Blau' })).toBeChecked()
  expect(within(colors[1]).getByRole('radio', { name: 'Blau' })).toHaveProperty('disabled', everUsed)
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Offline pair' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Offline pair' })
  expect(searches(api)).toHaveLength(0)
})

test('restoring a saved single Partner with Commander does not search or prefill its counterpart during an offline rename', async () => {
  const named: SavedCommander = { ...savedCommander('Named first'), pairing: { roles: [], variants: [], partnerWith: ['named second'] } }
  const api = deckApi([{ ...deck, commanders: [named] }]); showDeckApp(`/decks/${deck.id}/edit`)
  await screen.findByRole('textbox', { name: /Deckname/ })
  expect(second()).toHaveValue('')
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Offline named' } })
  fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(JSON.parse(api.writes()[0][1]!.body as string)).toEqual({ name: 'Offline named' })
  expect(searches(api)).toHaveLength(0)
})

test('removing a directly activated named counterpart does not automatically offer it again', async () => {
  const api = await start()
  const named = { ...choice('Named first', []), pairing: { roles: [], variants: [], partnerWith: ['named second'] } }
  const reciprocal = choice('Named second', [], 303)
  api.next(path('', named), () => response([reciprocal]))
  await selectFirst(api, named)
  fireEvent.click(await screen.findByRole('button', { name: 'Named second' }))
  expect(second()).toHaveValue('Named second')
  fireEvent.click(screen.getByRole('button', { name: 'Zweiten Commander entfernen' }))
  expect(second()).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await waitFor(() => expect(api.writes()).toHaveLength(1))
  expect(searches(api)).toHaveLength(2)
  expect(JSON.parse(api.writes()[0][1]!.body as string).commanders).toHaveLength(1)
})
