import { expect, test } from 'vitest'
import { outcomeError, type OutcomeDraft } from './gameOutcome'

test.each([2, 3, 4, 5, 6])('competition ranking and mode invariants for %s participants', count => {
  const normal: OutcomeDraft[] = Array.from({ length: count }, (_, i) => ({ placement: i + 1 }))
  expect(outcomeError(normal, 'WIN')).toBe('')
  expect(outcomeError(normal.map(() => ({ placement: 1 })), 'WIN')).not.toBe('')
  expect(outcomeError(normal.map(() => ({})), 'WIN')).not.toBe('')
  expect(outcomeError(normal.map(() => ({ draw: false })), 'DRAW')).not.toBe('')
  expect(outcomeError(normal, 'DRAW')).toBe('')
  const alternate = normal.map((_, i) => ({ alternate: { winner: i === 0, stillInGame: i !== 0 } }))
  expect(outcomeError(alternate, 'ALTERNATE')).toBe('')
  expect(outcomeError(alternate.map(d => ({ alternate: { ...d.alternate, stillInGame: false } })), 'ALTERNATE')).not.toBe('')
})
test('tied survivors count towards eliminated competition ranks', () => {
  const drafts = [
    { alternate: { winner: true, stillInGame: false } },
    ...[1, 2].map(() => ({ alternate: { winner: false, stillInGame: true } })),
    { alternate: { winner: false, stillInGame: false, placement: 4 } },
  ]
  expect(outcomeError(drafts, 'ALTERNATE')).toBe('')
  drafts[3].alternate.placement = 3
  expect(outcomeError(drafts, 'ALTERNATE')).not.toBe('')
})
