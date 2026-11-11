import { expect, test } from 'vitest'
import { checkOutcome, gamePayload, localToday, outcomeFields, savedOutcome, type OutcomeDraft } from './gameOutcome'
import { recorded, uid } from './test/gameFixtures'

test.each([2, 3, 4, 5, 6])('competition ranking and mode invariants for %s participants', count => {
  const normal: OutcomeDraft[] = Array.from({ length: count }, (_, i) => ({ win: i + 1 }))
  expect(checkOutcome(normal, 'WIN')).toEqual({ error: '', partial: false })
  expect(checkOutcome(normal.map(() => ({ win: 1 })), 'WIN').error).not.toBe('')
  expect(checkOutcome(normal.map(() => ({})), 'WIN').error).toBe('Bitte den Sieger des Spiels auswählen.')
  // Winner-only is a complete write: every other placement stays unknown.
  expect(checkOutcome(normal.map((_, i) => i ? {} : { win: 1 }), 'WIN')).toEqual({ error: '', partial: false })
  expect(checkOutcome(normal.map(() => ({ draw: false })), 'DRAW').error).not.toBe('')
  expect(checkOutcome(normal.map(() => ({ draw: true })), 'DRAW').error).toBe('')
  const alternate: OutcomeDraft[] = normal.map((_, i) => ({ alternate: i === 0 ? 1 : 'SURVIVOR' }))
  expect(checkOutcome(alternate, 'ALTERNATE').error).toBe('')
  if (count > 2) expect(checkOutcome(alternate.map((_, i) => ({ alternate: i === 0 ? 1 : count })), 'ALTERNATE').error).toMatch(/noch im Spiel/)
})

test('equal ranks are deliberate competition ties without extra confirmation', () => {
  for (const ranks of [[1, 2, 3, 3], [1, 2, 2, 4], [1, 3, 3, 3]].map(r => r.slice(0, 4))) {
    const result = checkOutcome(ranks.map(win => ({ win })), 'WIN')
    expect(result.error, ranks.join()).toBe(ranks.join() === '1,3,3,3' ? 'Ungültige Platzfolge: Gleichstände brauchen Wettbewerbslücken, z. B. 1, 2, 2, 4.' : '')
  }
  expect(checkOutcome([1, 2, 2, 3].map(win => ({ win })), 'WIN').error).toMatch(/Ungültige Platzfolge/)
})

test('tied survivors count towards eliminated competition ranks', () => {
  const drafts: OutcomeDraft[] = [{ alternate: 1 }, { alternate: 'SURVIVOR' }, { alternate: 'SURVIVOR' }, { alternate: 4 }]
  expect(checkOutcome(drafts, 'ALTERNATE').error).toBe('')
  drafts[3] = { alternate: 3 }
  expect(checkOutcome(drafts, 'ALTERNATE').error).toMatch(/Ungültige Platzfolge/)
})

test('some but not all extra results are partial; DRAW requires every explicit status', () => {
  expect(checkOutcome([{ win: 1 }, { win: 2 }, {}], 'WIN')).toEqual({ error: '', partial: true })
  expect(checkOutcome([{ alternate: 1 }, { alternate: 'SURVIVOR' }, {}], 'ALTERNATE')).toEqual({ error: '', partial: true })
  expect(checkOutcome([{ draw: true }, {}], 'DRAW').error).toBe('Bitte für jeden Spieler „Noch im Spiel“ oder „Ausgeschieden“ wählen.')
  // The PO-defined simultaneous-elimination draw may mark everyone still in the game.
  expect(checkOutcome([{ draw: true }, { draw: true }], 'DRAW').error).toBe('')
})

test('fields serialize only the active mode; winner-only drops every extra rank and alternate status', () => {
  const draft: OutcomeDraft = { win: 3, alternate: 'SURVIVOR', draw: false }
  expect(outcomeFields(draft, 'WIN', false)).toEqual({ placement: 3 })
  expect(outcomeFields(draft, 'WIN', true)).toEqual({})
  expect(outcomeFields(draft, 'ALTERNATE', false)).toEqual({ stillInGame: true })
  expect(outcomeFields(draft, 'ALTERNATE', true)).toEqual({})
  expect(outcomeFields({ alternate: 4 }, 'ALTERNATE', false)).toEqual({ stillInGame: false, placement: 4 })
  expect(outcomeFields({ alternate: 1 }, 'ALTERNATE', true)).toEqual({ winner: true })
  expect(outcomeFields({ win: 1 }, 'WIN', true)).toEqual({ placement: 1 })
  expect(outcomeFields({}, 'ALTERNATE', false)).toEqual({})
  expect(outcomeFields(draft, 'DRAW', false)).toEqual({ stillInGame: false })
})

test('saved unknown ranks and statuses stay unknown when loading an edit', () => {
  const game = recorded({ alternateWinCon: true, participants: recorded().participants.map((p, i) => ({ ...p, placement: i ? null : 1, stillInGame: i ? null : true })) })
  expect(game.participants.map(p => savedOutcome(game, p))).toEqual([{ alternate: 1 }, {}])
  const normal = recorded({ participants: recorded().participants.map((p, i) => ({ ...p, placement: i ? null : 1 })) })
  expect(normal.participants.map(p => savedOutcome(normal, p))).toEqual([{ win: 1 }, {}])
  const draw = recorded({ result: 'DRAW', winnerUserId: null })
  expect(draw.participants.map(p => savedOutcome(draw, p))).toEqual([{ draw: true }, { draw: true }])
})

test('the transport payload keeps playedOn including explicit null and omits it when absent', () => {
  const participants = [{ userId: uid(2), deckId: uid(102), startPosition: 1, placement: 1 }, { userId: uid(3), deckId: uid(103), startPosition: 2 }]
  expect(gamePayload({ result: 'WIN', alternateWinCon: false, playedOn: '2026-11-06', participants })).toEqual({
    result: 'WIN', alternateWinCon: false, playedOn: '2026-11-06', participants,
  })
  expect(gamePayload({ result: 'WIN', alternateWinCon: false, playedOn: null, participants }).playedOn).toBeNull()
  expect('playedOn' in gamePayload({ result: 'WIN', alternateWinCon: false, participants })).toBe(false)
  expect(gamePayload({ result: 'WIN', alternateWinCon: true, participants: [{ ...participants[0], placement: undefined, winner: true }, participants[1]] }).participants)
    .toEqual([{ userId: uid(2), deckId: uid(102), startPosition: 1, winner: true }, { userId: uid(3), deckId: uid(103), startPosition: 2 }])
})

test('local today uses the local calendar day, not a UTC conversion', () => {
  expect(localToday(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06')
  expect(localToday(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
})
