import { EditorGuard } from './editorGuard'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import GameEditor from './GameEditor'
import { renderApp } from './test/renderApp'
import { deckFor, deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'
import { gameCard as card, selectGameDeck, selectGameMember, selectGamePlayer, selectGameWinner } from './test/gameEntry'
import { localToday } from './gameOutcome'
import { savedCommander } from './test/commanderFixtures'
import type { Game, GroupDetails } from './api'

const names = ['Owner', 'Same name (…0002)', 'Same name (…0003)', 'Fourth']
const name = (n: number) => names[n - 1]
function show(game: Game | null = null, details: GroupDetails = group, initialMembers?: string[]) {
  const onSubmit = vi.fn(), onAccessError = vi.fn()
  const view = renderApp(<GameEditor group={details} game={game} currentUserId={uid(1)} initialMembers={initialMembers} busy={false} onSubmit={onSubmit} onAccessError={onAccessError} />)
  return { ...view, onSubmit, onAccessError }
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Spiel speichern' }))
const result = (n: number) => screen.getByRole('combobox', { name: `Ergebnis für ${name(n)}` })
const setResult = (n: number, value: string) => fireEvent.change(result(n), { target: { value } })
const mode = (value: 'Sieg' | 'Unentschieden') => fireEvent.click(screen.getByRole('button', { name: value }))
const alternate = () => fireEvent.click(screen.getByRole('switch', { name: 'Alternative Siegbedingung' }))
const pickerOpen = (title: string) => screen.queryByRole('dialog', { name: title })
async function fill(...players: number[]) {
  for (const [index, n] of players.entries()) await selectGamePlayer(index + 1, name(n), deckFor(n))
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('a new group-scoped game starts with today, Sieg, alternate off and four empty collapsed slots', () => {
  gameApi(); show()
  expect(screen.getAllByRole('region', { name: /^Spieler \d$/ })).toHaveLength(4)
  expect(screen.getAllByRole('button', { name: /^Spieler \d auswählen$/ })).toHaveLength(4)
  expect(screen.getByLabelText('Spieldatum')).toHaveValue(localToday())
  expect(screen.getByRole('button', { name: 'Sieg' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('switch', { name: 'Alternative Siegbedingung' })).not.toBeChecked()
  expect(screen.getByText('Friday games')).toBeInTheDocument()
  expect(pickerOpen('Gruppenmitglied auswählen')).not.toBeInTheDocument()
})

test.each([2, 3, 4, 5, 6])('%s participants chain member and deck pickers and submit seats, date and winner-only', async count => {
  const api = gameApi()
  const details = { ...group, members: [...group.members, ...[5, 6].map(n => ({ userId: uid(n), username: `Player ${n}`, role: 'MEMBER' as const }))] }
  for (const n of [5, 6]) api.next(`/api/groups/${group.id}/members/${uid(n)}/decks`, () => response([deckFor(n)]))
  const { onSubmit } = show(null, details)
  for (let n = 1; n <= count; n++) {
    if (n > 4) fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }))
    else fireEvent.click(card(n).getByRole('button', { name: `Spieler ${n} auswählen` }))
    const members = within(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' }))
    // Members assigned elsewhere in this match are excluded.
    expect(members.getAllByRole('button', { name: /Mit Benutzerkonto/ })).toHaveLength(6 - (n - 1))
    fireEvent.click(members.getByRole('button', { name: `${name(n) ?? `Player ${n}`} · Mit Benutzerkonto${n === 1 ? ' · Du' : ''}` }))
    await selectGameDeck(n, deckFor(n))
  }
  if (count === 6) expect(screen.getByRole('button', { name: 'Spieler hinzufügen' })).toBeDisabled()
  else expect(screen.getByRole('button', { name: 'Spieler hinzufügen' })).toBeEnabled()
  selectGameWinner(name(1))
  save()
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ playedOn: localToday(), result: 'WIN', alternateWinCon: false,
    participants: Array.from({ length: count }, (_, i) => ({ userId: uid(i + 1), deckId: deckFor(i + 1).id, startPosition: i + 1, ...(i ? {} : { placement: 1 }) })) })
})

test('closing the picker collapses an original slot, removes an added slot, and the add action stops at six', async () => {
  gameApi(); show()
  fireEvent.click(card(2).getByRole('button', { name: 'Spieler 2 auswählen' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' })).getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(pickerOpen('Gruppenmitglied auswählen')).not.toBeInTheDocument())
  expect(card(2).getByRole('button', { name: 'Spieler 2 auswählen' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }))
  // The open modal hides the background from assistive technology.
  expect(screen.getAllByRole('region', { name: /^Spieler \d$/, hidden: true })).toHaveLength(5)
  fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' }), { key: 'Escape' })
  await waitFor(() => expect(screen.getAllByRole('region', { name: /^Spieler \d$/ })).toHaveLength(4))
  fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }))
  await selectGameMember(5, name(2))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deck auswählen' })).getByRole('button', { name: 'Schließen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }))
  fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' }), { key: 'Escape' })
  await waitFor(() => expect(pickerOpen('Gruppenmitglied auswählen')).not.toBeInTheDocument())
  expect(screen.getAllByRole('region', { name: /^Spieler \d$/ })).toHaveLength(5)
})

test('closing the deck picker keeps the member expanded without a deck; save is blocked with field focus', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2)
  await selectGameMember(3, name(3))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deck auswählen' })).getByRole('button', { name: 'Schließen' }))
  await waitFor(() => expect(card(3).getByRole('button', { name: 'Deck auswählen' })).toHaveFocus())
  expect(card(3).getByText('Noch kein Deck ausgewählt')).toBeInTheDocument()
  selectGameWinner(name(1))
  save()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(card(3).getByRole('button', { name: 'Deck auswählen' })).toHaveFocus()
  expect(screen.getByText(/Spieler 3: Bitte ein Deck auswählen/)).toBeInTheDocument()
  fireEvent.click(card(3).getByRole('button', { name: 'Spieler 3 entfernen' }))
  save()
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ participants: [1, 2].map((n, i) => ({ userId: uid(n), deckId: deckFor(n).id, startPosition: i + 1, ...(i ? {} : { placement: 1 }) })) }))
})

test('only the selected member’s decks are offered; member change clears deck and results while late responses are fenced', async () => {
  const api = gameApi(), late = deferred()
  api.next(`/api/groups/${group.id}/members/${uid(2)}/decks`, () => late.promise)
  const { onAccessError } = show()
  await selectGameMember(1, name(2))
  expect(within(screen.getByRole('dialog', { name: 'Deck auswählen' })).getByRole('status')).toHaveTextContent('werden geladen')
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Deck auswählen' })).getByRole('button', { name: 'Schließen' }))
  await selectGameMember(1, name(4))
  await act(async () => late.resolve(response({}, 401)))
  expect(onAccessError).not.toHaveBeenCalled()
  const dialog = within(screen.getByRole('dialog', { name: 'Deck auswählen' }))
  expect(await dialog.findByRole('button', { name: /Deck 4/ })).toBeInTheDocument()
  expect(dialog.queryByRole('button', { name: /Deck 2/ })).not.toBeInTheDocument()
  await selectGameDeck(1, deckFor(4))
  await selectGamePlayer(2, name(3), deckFor(3))
  selectGameWinner(name(4))
  expect(screen.getByRole('img', { name: `${name(4)}: Sieger des Spiels, Platz 1` })).toBeInTheDocument()
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  await selectGameMember(1, name(2))
  // The member change already cleared the previous deck and every mode's results.
  const background = within(screen.getByRole('region', { name: 'Spieler 1', hidden: true }))
  expect(screen.queryByRole('img', { name: /Sieger des Spiels, Platz 1/, hidden: true })).not.toBeInTheDocument()
  expect(background.queryByText('Deck 4')).not.toBeInTheDocument()
})

test('decks fail per member with retry; another account without decks offers only another member', async () => {
  const api = gameApi()
  api.next(`/api/groups/${group.id}/members/${uid(3)}/decks`, () => response({ invalid: [] }))
  api.next(`/api/groups/${group.id}/members/${uid(4)}/decks`, () => response([]))
  show()
  await selectGameMember(1, name(3))
  const dialog = within(screen.getByRole('dialog', { name: 'Deck auswählen' }))
  expect(await dialog.findByText(/Deckauswahl fehlgeschlagen/)).toBeInTheDocument()
  expect(dialog.queryByText('Keine Decks verfügbar')).not.toBeInTheDocument()
  fireEvent.click(dialog.getByRole('button', { name: 'Decks erneut laden' }))
  await selectGameDeck(1, deckFor(3))
  await selectGameMember(2, name(4))
  const empty = within(screen.getByRole('dialog', { name: 'Deck auswählen' }))
  expect(await empty.findByText('Keine Decks verfügbar')).toBeInTheDocument()
  expect(empty.getByText(/Nur Fourth kann/)).toBeInTheDocument()
  expect(empty.queryByRole('button', { name: /Deck erstellen/ })).not.toBeInTheDocument()
  fireEvent.click(empty.getByRole('button', { name: 'Anderes Mitglied auswählen' }))
  expect(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' })).toBeInTheDocument()
})

test('Deck erstellen is offered only for the signed-in user and quick profiles, never another account', async () => {
  gameApi()
  const details = { ...group, members: [...group.members, { userId: uid(5), username: 'Hairy Zombie', role: 'MEMBER' as const, quickProfile: true }] }
  show(null, details)
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 auswählen' }))
  const members = within(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' }))
  expect(members.getByRole('button', { name: 'Hairy Zombie · Schnellprofil' })).toBeInTheDocument()
  expect(members.getByRole('button', { name: 'Owner · Mit Benutzerkonto · Du' })).toBeInTheDocument()
  fireEvent.click(members.getByRole('button', { name: /^Owner/ }))
  expect(await within(await screen.findByRole('dialog', { name: 'Deck auswählen' })).findByRole('button', { name: /Deck erstellen/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
  await selectGameMember(2, name(2))
  const other = within(await screen.findByRole('dialog', { name: 'Deck auswählen' }))
  await other.findByRole('button', { name: /Deck 2/ })
  expect(other.queryByRole('button', { name: /Deck erstellen/ })).not.toBeInTheDocument()
})

test('a new quick profile is saved, routes into its deck creation, survives cancel, and a created deck is selected', async () => {
  const api = gameApi()
  const profile = { userId: uid(7), username: 'Extrovert Cat', role: 'MEMBER', quickProfile: true }
  const created = { ...deckFor(7), everUsed: false, archived: false, manaBoxUrl: null }
  api.next(`/api/groups/${group.id}/quick-profiles`, () => response(profile, 201), 'POST')
  api.next(`/api/groups/${group.id}/members/${uid(7)}/decks`, () => response([]))
  api.next(`/api/groups/${group.id}/members/${uid(7)}/decks`, () => response([]))
  show()
  await fill(1)
  selectGameWinner(name(1))
  fireEvent.click(card(2).getByRole('button', { name: 'Spieler 2 auswählen' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' })).getByRole('button', { name: 'Schnellprofil erstellen' }))
  expect(await screen.findByRole('heading', { name: 'Deck für Extrovert Cat erstellen' })).toBeInTheDocument()
  expect(screen.queryByRole('form', { name: 'Spiel erfassen' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  // Cancel returns to the saved profile's deck picker with all match inputs intact.
  const dialog = within(await screen.findByRole('dialog', { name: 'Deck auswählen' }))
  expect(dialog.getByText('Extrovert Cat · Schnellprofil')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: `${name(1)}: Sieger des Spiels, Platz 1`, hidden: true })).toBeInTheDocument()
  expect(api.fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/quick-profiles') && init?.method === 'POST')).toHaveLength(1)
  fireEvent.click(await dialog.findByRole('button', { name: /Deck erstellen/ }))
  await screen.findByRole('heading', { name: 'Deck für Extrovert Cat erstellen' })
  api.next(`/api/groups/${group.id}/quick-profiles/${uid(7)}/decks`, init => {
    expect(JSON.parse(init!.body as string)).toEqual(expect.objectContaining({ name: 'Cat deck' }))
    return response(created, 201)
  }, 'POST')
  fireEvent.change(screen.getByRole('textbox', { name: /Deckname/ }), { target: { value: 'Cat deck' } })
  const base = api.fetchMock
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => path.startsWith('/api/scryfall/commanders?')
    ? response([{ ...savedCommander('Commander 7'), thumbnailUrl: null }]) : base(path, init)))
  const field = screen.getByRole('combobox', { name: /Commander/ })
  fireEvent.change(field, { target: { value: 'Commander 7' } })
  fireEvent.focus(field)
  fireEvent.click(await screen.findByRole('option', { name: 'Commander 7' }))
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await screen.findByRole('form', { name: 'Spiel erfassen' })
  expect(card(2).getByText('Deck 7')).toBeInTheDocument()
  expect(card(2).getByRole('button', { name: 'Spieler 2 bearbeiten' })).toHaveFocus()
  expect(card(2).getByText('Extrovert Cat')).toBeInTheDocument()
})

test('one-click winner, replacing the winner, deliberate ties and full ranking save directly', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2, 3, 4)
  selectGameWinner(name(3))
  expect(screen.queryByRole('button', { name: /: Sieger des Spiels$/ })).not.toBeInTheDocument()
  expect(within(result(1)).getAllByRole('option').map(option => option.textContent)).toEqual(['Keine Platzierung', 'Sieger des Spiels', 'Platz 2', 'Platz 3', 'Platz 4'])
  setResult(1, 'WINNER')
  expect(screen.getByRole('img', { name: `${name(1)}: Sieger des Spiels, Platz 1` })).toBeInTheDocument()
  // The former winner returns to an unknown rank; there are never two first places.
  expect(result(3)).toHaveValue('')
  setResult(2, '2'); setResult(3, '2'); setResult(4, '4')
  save()
  expect(onSubmit.mock.lastCall![0].participants.map((p: { placement?: number }) => p.placement)).toEqual([1, 2, 2, 4])
  expect(screen.queryByRole('dialog', { name: 'Fehlende Platzierungen' })).not.toBeInTheDocument()
  setResult(4, '3')
  save()
  expect(onSubmit).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/Ungültige Platzfolge/)).toBeInTheDocument()
})

test('partial rankings ask before saving; Anpassen keeps choices and the discard option saves winner-only', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2, 3)
  selectGameWinner(name(2))
  setResult(3, '2')
  save()
  const dialog = within(await screen.findByRole('dialog', { name: 'Fehlende Platzierungen' }))
  expect(dialog.getByText('Es gibt noch Spieler mit fehlenden Platzierungen. Möchtest du sie noch anpassen?')).toBeInTheDocument()
  fireEvent.click(dialog.getByRole('button', { name: 'Anpassen' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fehlende Platzierungen' })).not.toBeInTheDocument())
  expect(onSubmit).not.toHaveBeenCalled()
  expect(result(3)).toHaveValue('2')
  save()
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Fehlende Platzierungen' })).getByRole('button', { name: 'Spiel ohne Platzierungen speichern' }))
  expect(onSubmit.mock.lastCall![0].participants).toEqual([
    { userId: uid(1), deckId: deckFor(1).id, startPosition: 1 },
    { userId: uid(2), deckId: deckFor(2).id, startPosition: 2, placement: 1 },
    { userId: uid(3), deckId: deckFor(3).id, startPosition: 3 },
  ])
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fehlende Platzierungen' })).not.toBeInTheDocument())
  expect(result(3)).toHaveValue('')
})

test('a missing winner blocks save and the partial dialog cannot bypass it', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2)
  save()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Fehlende Platzierungen' })).not.toBeInTheDocument()
  expect(screen.getByText(/Bitte den Sieger des Spiels auswählen/)).toBeInTheDocument()
})

test('alternate WIN shows shared survivor place 2, needs a survivor for complete mode, and winner-only clears statuses', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2, 3, 4)
  alternate()
  selectGameWinner(name(1))
  expect(within(result(2)).getAllByRole('option').map(option => option.textContent)).toEqual(['Keine Platzierung', 'Sieger des Spiels', 'Noch im Spiel · Platz 2', 'Platz 3', 'Platz 4'])
  setResult(2, 'SURVIVOR'); setResult(3, 'SURVIVOR'); setResult(4, '4')
  save()
  expect(onSubmit.mock.lastCall![0]).toEqual(expect.objectContaining({ result: 'WIN', alternateWinCon: true, participants: [
    { userId: uid(1), deckId: deckFor(1).id, startPosition: 1, winner: true },
    ...[2, 3].map(n => ({ userId: uid(n), deckId: deckFor(n).id, startPosition: n, stillInGame: true })),
    { userId: uid(4), deckId: deckFor(4).id, startPosition: 4, stillInGame: false, placement: 4 },
  ] }))
  setResult(2, '3'); setResult(3, '3')
  save()
  expect(screen.getByText(/mindestens ein anderer Spieler noch im Spiel/)).toBeInTheDocument()
  setResult(2, ''); setResult(3, '')
  save()
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Fehlende Platzierungen' })).getByRole('button', { name: 'Spiel ohne Platzierungen speichern' }))
  expect(onSubmit.mock.lastCall![0].participants.slice(1)).toEqual([2, 3, 4].map(n => ({ userId: uid(n), deckId: deckFor(n).id, startPosition: n })))
})

test('DRAW has no winner action, preselects no status, requires every status and at least one survivor', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2, 3)
  mode('Unentschieden')
  expect(screen.queryByRole('switch', { name: 'Alternative Siegbedingung' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Sieger des Spiels/ })).not.toBeInTheDocument()
  for (const n of [1, 2, 3]) expect(result(n)).toHaveValue('')
  setResult(1, 'OUT'); setResult(2, 'OUT')
  save()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Fehlende Platzierungen' })).not.toBeInTheDocument()
  setResult(3, 'OUT'); save()
  expect(screen.getByText(/Mindestens ein Spieler muss noch im Spiel sein/)).toBeInTheDocument()
  for (const n of [1, 2, 3]) setResult(n, 'IN')
  save()
  expect(onSubmit.mock.lastCall![0]).toEqual({ playedOn: localToday(), result: 'DRAW', alternateWinCon: false,
    participants: [1, 2, 3].map(n => ({ userId: uid(n), deckId: deckFor(n).id, startPosition: n, stillInGame: true })) })
})

test('mode round trips restore each mode’s cached results and only the active mode is submitted', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2, 3)
  selectGameWinner(name(1)); setResult(2, '2'); setResult(3, '3')
  mode('Unentschieden'); setResult(1, 'IN'); setResult(2, 'OUT'); setResult(3, 'OUT')
  mode('Sieg')
  expect(result(3)).toHaveValue('3')
  alternate()
  expect(screen.getAllByRole('button', { name: /: Sieger des Spiels$/ })).toHaveLength(3)
  selectGameWinner(name(2)); setResult(1, 'SURVIVOR'); setResult(3, 'SURVIVOR')
  mode('Unentschieden')
  expect(result(2)).toHaveValue('OUT')
  mode('Sieg')
  // Returning to Sieg restores the last active win variant.
  expect(screen.getByRole('switch', { name: 'Alternative Siegbedingung' })).toBeChecked()
  expect(result(1)).toHaveValue('SURVIVOR')
  alternate()
  expect(screen.getByRole('img', { name: `${name(1)}: Sieger des Spiels, Platz 1` })).toBeInTheDocument()
  save()
  expect(onSubmit.mock.lastCall![0]).toEqual(expect.objectContaining({ result: 'WIN', alternateWinCon: false }))
  expect(onSubmit.mock.lastCall![0].participants.map((p: object) => Object.keys(p).filter(key => !['userId', 'deckId', 'startPosition'].includes(key)))).toEqual([['placement'], ['placement'], ['placement']])
})

test('removing the winner compacts seats and requires a new winner; deck-only changes keep results', async () => {
  const api = gameApi()
  api.next(`/api/groups/${group.id}/members/${uid(3)}/decks`, () => response([deckFor(3), deckFor(8)]))
  const { onSubmit } = show()
  await fill(1, 2, 3)
  selectGameWinner(name(2))
  fireEvent.click(card(3).getByRole('button', { name: 'Spieler 3 bearbeiten' }))
  setResult(3, '3')
  await selectGameDeck(3, deckFor(8))
  expect(result(3)).toHaveValue('3')
  fireEvent.click(card(2).getByRole('button', { name: 'Spieler 2 bearbeiten' }))
  fireEvent.click(card(2).getByRole('button', { name: 'Spieler 2 entfernen' }))
  expect(card(2).getByText('Startplatz 2')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /: Sieger des Spiels$/ })).toHaveLength(1)
  save()
  expect(onSubmit).not.toHaveBeenCalled()
  selectGameWinner(name(1)); save()
  // Place 3 no longer fits two participants: the complete ranking is invalid until corrected.
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.getByText(/Ungültige Platzfolge/)).toBeInTheDocument()
  setResult(3, '2'); save()
  expect(onSubmit.mock.lastCall![0].participants).toEqual([
    { userId: uid(1), deckId: deckFor(1).id, startPosition: 1, placement: 1 },
    { userId: uid(3), deckId: deckFor(8).id, startPosition: 2, placement: 2 },
  ])
})

test('the grip reorders only starting seats by keyboard; the result follows its player', async () => {
  gameApi(); const { onSubmit } = show()
  await fill(1, 2, 3)
  selectGameWinner(name(3))
  const grip = card(3).getByRole('button', { name: `${name(3)} verschieben` })
  fireEvent.keyDown(grip, { key: 'ArrowUp' })
  fireEvent.keyDown(card(2).getByRole('button', { name: `${name(3)} verschieben` }), { key: 'ArrowUp' })
  expect(card(1).getByText('Deck 3')).toBeInTheDocument()
  expect(card(1).getByText('Startplatz 1')).toBeInTheDocument()
  expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(`${name(3)} an Position 1 verschoben.`)
  // Moving never expands a card or touches results.
  expect(card(1).queryByRole('button', { name: 'Mitglied ändern' })).not.toBeInTheDocument()
  save()
  expect(onSubmit.mock.lastCall![0].participants.map((p: { userId: string; startPosition: number; placement?: number }) => [p.userId, p.startPosition, p.placement]))
    .toEqual([[uid(3), 1, 1], [uid(1), 2, undefined], [uid(2), 3, undefined]])
})

test('edit keeps saved seats, results, unknown ranks and an unknown date; historical pairs stay valid', async () => {
  const api = gameApi()
  const saved = recorded({ participants: recorded().participants.map((p, i) => ({ ...p, placement: i ? null : 1 })) })
  saved.participants[0].deck.archived = true
  const details = { ...group, members: group.members.filter(member => member.userId !== uid(2)) }
  const { onSubmit } = show(saved, details)
  expect(screen.getByLabelText('Spieldatum')).toHaveValue('')
  expect(screen.getByText('Spieldatum unbekannt')).toBeInTheDocument()
  expect(screen.getAllByRole('region', { name: /^Spieler \d$/ })).toHaveLength(2)
  expect(screen.getByText('Ehemaliges Mitglied · nur erfasste Zuordnung')).toBeInTheDocument()
  expect(screen.getByText('Archiviertes Deck · nur erfasste Zuordnung')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: `${name(2)}: Sieger des Spiels, Platz 1` })).toBeInTheDocument()
  save()
  expect(onSubmit).toHaveBeenCalledWith({ playedOn: null, result: 'WIN', alternateWinCon: false, participants: [
    { userId: uid(2), deckId: deckFor(2).id, startPosition: 1, placement: 1 }, { userId: uid(3), deckId: deckFor(3).id, startPosition: 2 },
  ] })
  expect(api.fetchMock.mock.calls.some(([url]) => url.includes(`/members/${uid(2)}/`))).toBe(false)
  fireEvent.change(screen.getByLabelText('Spieldatum'), { target: { value: '2026-10-31' } })
  save()
  expect(onSubmit.mock.lastCall![0].playedOn).toBe('2026-10-31')
})

test('a former member’s card can only keep its exact recorded pair; duplicates cannot be chosen', async () => {
  gameApi()
  const saved = recorded()
  const details = { ...group, members: group.members.filter(member => member.userId !== uid(2)) }
  show(saved, details)
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  expect(card(1).queryByRole('button', { name: 'Deck ändern' })).not.toBeInTheDocument()
  fireEvent.click(card(2).getByRole('button', { name: 'Spieler 2 bearbeiten' }))
  fireEvent.click(card(2).getByRole('button', { name: 'Mitglied ändern' }))
  const members = within(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' }))
  expect(members.queryByRole('button', { name: /Ehemaliges Mitglied/ })).not.toBeInTheDocument()
  expect(members.getByRole('button', { name: /^Same name/ })).toBeInTheDocument()
})

test('Noch ein Spiel carries only active member IDs into a new, otherwise default entry', async () => {
  gameApi()
  show(null, group, [uid(4), uid(2), uid(99)])
  expect(screen.getAllByRole('region', { name: /^Spieler \d$/ })).toHaveLength(4)
  // Roster order, not the previous seats; unknown/departed IDs are dropped.
  expect(card(1).getByText(name(2))).toBeInTheDocument()
  expect(card(2).getByText('Fourth')).toBeInTheDocument()
  expect(card(1).getByText('Noch kein Deck ausgewählt')).toBeInTheDocument()
  expect(card(3).getByRole('button', { name: 'Spieler 3 auswählen' })).toBeInTheDocument()
  expect(screen.getByLabelText('Spieldatum')).toHaveValue(localToday())
  expect(screen.getByRole('button', { name: 'Sieg' })).toHaveAttribute('aria-pressed', 'true')
  await selectGameDeck(2, deckFor(4))
})

test('dirty guard covers date, seats and hidden mode-specific results, not expansion alone', async () => {
  gameApi()
  const register = vi.fn<(blocked: boolean) => () => void>(() => () => {})
  const renderGuarded = () => renderApp(<EditorGuard.Provider value={register}><GameEditor group={group} game={recorded()} currentUserId={uid(1)} busy={false} onSubmit={vi.fn()} onAccessError={vi.fn()} /></EditorGuard.Provider>)
  const view = renderGuarded()
  expect(register.mock.lastCall?.[0]).toBe(false)
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  expect(register.mock.lastCall?.[0]).toBe(false)
  mode('Unentschieden'); setResult(2, 'OUT'); mode('Sieg')
  expect(register.mock.lastCall?.[0]).toBe(true)
  view.unmount()
  renderGuarded()
  fireEvent.change(screen.getByLabelText('Spieldatum'), { target: { value: '2026-10-30' } })
  expect(register.mock.lastCall?.[0]).toBe(true)
  fireEvent.change(screen.getByLabelText('Spieldatum'), { target: { value: '' } })
  expect(register.mock.lastCall?.[0]).toBe(false)
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 bearbeiten' }))
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 nach unten' }))
  expect(register.mock.lastCall?.[0]).toBe(true)
})

test('a pending quick-profile creation locks its picker, guards navigation and resolves into its own slot', async () => {
  const api = gameApi(), pending = deferred()
  api.next(`/api/groups/${group.id}/quick-profiles`, () => pending.promise, 'POST')
  api.next(`/api/groups/${group.id}/members/${uid(7)}/decks`, () => response([]))
  const register = vi.fn<(blocked: boolean, pending?: boolean) => () => void>(() => () => {})
  renderApp(<EditorGuard.Provider value={register}><GameEditor group={group} game={null} currentUserId={uid(1)} busy={false} onSubmit={vi.fn()} onAccessError={vi.fn()} /></EditorGuard.Provider>)
  fireEvent.click(card(1).getByRole('button', { name: 'Spieler 1 auswählen' }))
  const dialog = await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Schnellprofil erstellen' }))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Schließen' })).toBeDisabled())
  expect(register.mock.lastCall).toEqual([true, true, undefined])
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)) })
  expect(screen.getByRole('dialog', { name: 'Gruppenmitglied auswählen' })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Owner · Mit Benutzerkonto · Du' })).toHaveAttribute('aria-disabled', 'true')
  await act(async () => pending.resolve(response({ userId: uid(7), username: 'Late Cat', role: 'MEMBER', quickProfile: true }, 201)))
  expect(await screen.findByRole('heading', { name: 'Deck für Late Cat erstellen' })).toBeInTheDocument()
})

test('contextual Back/Cancel of a dirty nested deck draft asks first; staying keeps it, discarding returns to the deck picker', async () => {
  gameApi()
  show()
  await selectGameMember(1, 'Owner')
  fireEvent.click(await within(await screen.findByRole('dialog', { name: 'Deck auswählen' })).findByRole('button', { name: /Deck erstellen/ }))
  const deckName = await screen.findByRole('textbox', { name: /Deckname/ })
  // A clean nested draft leaves without a question.
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }))
  fireEvent.click(await within(await screen.findByRole('dialog', { name: 'Deck auswählen' })).findByRole('button', { name: /Deck erstellen/ }))
  fireEvent.change(await screen.findByRole('textbox', { name: /Deckname/ }), { target: { value: 'Half-built' } })
  expect(deckName).not.toBeInTheDocument()
  for (const action of ['Abbrechen', 'Zurück']) {
    fireEvent.click(screen.getByRole('button', { name: action }))
    const confirm = within(await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' }))
    fireEvent.click(confirm.getByRole('button', { name: 'Im Editor bleiben' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: /Deckname/ })).toHaveValue('Half-built')
  }
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Änderungen verwerfen?' })).getByRole('button', { name: 'Verwerfen und zurück' }))
  expect(await screen.findByRole('dialog', { name: 'Deck auswählen' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: /Deckname/ })).not.toBeInTheDocument()
})
