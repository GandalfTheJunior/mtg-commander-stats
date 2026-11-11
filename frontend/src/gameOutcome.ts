import type { Game, GameInput, GameParticipant } from './api'

export type OutcomeMode = 'WIN' | 'ALTERNATE' | 'DRAW'
/** Each mode keeps its own unsaved choice while the editor is open.
 * WIN: 1 is the winner, 2…N a known place. ALTERNATE: 1 is the winner,
 * SURVIVOR shares derived place 2, 3…N an eliminated place. DRAW: true while
 * still in the game. Undefined is an explicitly unknown/unchosen value. */
export type OutcomeDraft = { win?: number; alternate?: number | 'SURVIVOR'; draw?: boolean }
export type OutcomeValue = number | 'SURVIVOR' | undefined

export const gameMode = (game: Game | null): OutcomeMode =>
  game?.result === 'DRAW' ? 'DRAW' : game?.alternateWinCon ? 'ALTERNATE' : 'WIN'

const same = (a: string, b: string | null) => b !== null && a.toLowerCase() === b.toLowerCase()

export function savedOutcome(game: Game, p: GameParticipant): OutcomeDraft {
  if (game.result === 'DRAW') return p.stillInGame === null ? {} : { draw: p.stillInGame }
  if (same(p.userId, game.winnerUserId)) return game.alternateWinCon ? { alternate: 1 } : { win: 1 }
  if (!game.alternateWinCon) return p.placement === null ? {} : { win: p.placement }
  if (p.stillInGame === true) return { alternate: 'SURVIVOR' }
  return p.stillInGame === false && p.placement !== null ? { alternate: p.placement } : {}
}

export const outcomeValue = (draft: OutcomeDraft, mode: Exclude<OutcomeMode, 'DRAW'>): OutcomeValue =>
  mode === 'WIN' ? draft.win : draft.alternate
export const withOutcome = (draft: OutcomeDraft, mode: Exclude<OutcomeMode, 'DRAW'>, value: OutcomeValue): OutcomeDraft =>
  mode === 'WIN' ? { ...draft, win: value as number | undefined } : { ...draft, alternate: value }

export type OutcomeCheck = { error: string; partial?: false } | { error: ''; partial: boolean }

/** Validates the active mode. WIN modes are either winner-only or a complete
 * standard-competition ranking (#228); `partial` asks before discarding extras. */
export function checkOutcome(drafts: OutcomeDraft[], mode: OutcomeMode): OutcomeCheck {
  if (mode === 'DRAW') {
    if (drafts.some(d => d.draw === undefined)) return { error: 'Bitte für jeden Spieler „Noch im Spiel“ oder „Ausgeschieden“ wählen.' }
    return drafts.some(d => d.draw) ? { error: '', partial: false } : { error: 'Mindestens ein Spieler muss noch im Spiel sein.' }
  }
  const values = drafts.map(d => outcomeValue(d, mode))
  const winners = values.filter(value => value === 1).length
  if (winners !== 1) return { error: winners ? 'Es darf nur einen Sieger des Spiels geben.' : 'Bitte den Sieger des Spiels auswählen.' }
  const others = values.filter(value => value !== 1)
  const known = others.filter(value => value !== undefined)
  if (known.length === 0) return { error: '', partial: false }
  if (known.length < others.length) return { error: '', partial: true }
  if (mode === 'ALTERNATE' && !others.includes('SURVIVOR')) {
    return { error: 'Bei alternativer Siegbedingung muss mindestens ein anderer Spieler noch im Spiel sein.' }
  }
  const ranks = values.map(value => value === 'SURVIVOR' ? 2 : value as number).toSorted((a, b) => a - b)
  const competition = ranks.every((rank, i) => rank >= 1 && rank <= ranks.length && (i > 0 && rank === ranks[i - 1] || rank === i + 1))
  return competition ? { error: '', partial: false } : { error: 'Ungültige Platzfolge: Gleichstände brauchen Wettbewerbslücken, z. B. 1, 2, 2, 4.' }
}

/** Active-mode fields only; winner-only leaves every other rank and status unknown. */
export function outcomeFields(draft: OutcomeDraft, mode: OutcomeMode, winnerOnly: boolean): Partial<GameInput['participants'][number]> {
  if (mode === 'DRAW') return { stillInGame: draft.draw! }
  const value = outcomeValue(draft, mode)
  if (value === 1) return mode === 'WIN' ? { placement: 1 } : { winner: true }
  if (value === undefined || winnerOnly) return {}
  if (mode === 'WIN') return { placement: value as number }
  return value === 'SURVIVOR' ? { stillInGame: true } : { stillInGame: false, placement: value as number }
}

// Also used at the transport boundary: cached inactive fields and read-only data
// must never reach the strict complete-write API.
export function gamePayload(input: GameInput): GameInput {
  return { result: input.result, alternateWinCon: input.result === 'WIN' && input.alternateWinCon,
    ...('playedOn' in input ? { playedOn: input.playedOn ?? null } : {}),
    participants: input.participants.map(p => ({
      userId: p.userId, deckId: p.deckId, startPosition: p.startPosition,
      ...(input.result === 'DRAW' ? { stillInGame: p.stillInGame! } :
        !input.alternateWinCon ? (p.placement === undefined ? {} : { placement: p.placement }) :
          p.winner ? { winner: true as const } :
            p.stillInGame === undefined ? {} :
              { stillInGame: p.stillInGame, ...(!p.stillInGame ? { placement: p.placement! } : {}) }),
    })) }
}

/** The user's local calendar day, never a UTC conversion. */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
