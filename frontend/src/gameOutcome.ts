import type { Game, GameInput, GameParticipant } from './api'

export type OutcomeMode = 'WIN' | 'ALTERNATE' | 'DRAW'
export type OutcomeDraft = {
  placement?: number
  alternate?: { winner: boolean; stillInGame: boolean; placement?: number }
  draw?: boolean
}
export const gameMode = (game: Game | null): OutcomeMode =>
  game?.result === 'DRAW' ? 'DRAW' : game?.alternateWinCon ? 'ALTERNATE' : 'WIN'

export function savedOutcome(game: Game, p: GameParticipant): OutcomeDraft {
  if (game.result === 'DRAW') return { draw: p.stillInGame }
  if (game.alternateWinCon) return { alternate: {
    winner: p.userId === game.winnerUserId, stillInGame: p.userId !== game.winnerUserId && p.stillInGame,
    ...(!p.stillInGame ? { placement: p.placement! } : {}),
  } }
  return { placement: p.placement! }
}
export const alternateOutcome = (draft: OutcomeDraft) =>
  draft.alternate ?? { winner: false, stillInGame: true }
export function effectivePlace(draft: OutcomeDraft, mode: OutcomeMode): number | undefined {
  if (mode === 'DRAW') return undefined
  if (mode === 'WIN') return draft.placement
  const alt = alternateOutcome(draft)
  return alt.winner ? 1 : alt.stillInGame ? 2 : alt.placement
}
export function outcomeError(drafts: OutcomeDraft[], mode: OutcomeMode): string {
  if (mode === 'DRAW') return drafts.some(d => d.draw ?? true) ? '' : 'Mindestens ein Spieler muss noch im Spiel sein.'
  const places = drafts.map(d => effectivePlace(d, mode))
  if (places.filter(p => p === 1).length !== 1) return 'Genau ein Spieler muss Platz 1 / Winner sein.'
  if (mode === 'ALTERNATE' && !drafts.some(d => {
    const alt = alternateOutcome(d)
    return !alt.winner && alt.stillInGame
  })) return 'Alternate WinCon braucht mindestens einen anderen Spieler noch im Spiel.'
  if (places.some(p => p === undefined)) return 'Bitte für jeden ausgeschiedenen Teilnehmer einen Platz auswählen.'
  const sorted = (places as number[]).toSorted((a, b) => a - b)
  if (sorted.some((place, i) => place < 1 || place > drafts.length ||
    (i === 0 || place !== sorted[i - 1]) && place !== i + 1) ||
    mode === 'ALTERNATE' && drafts.some(d => {
      const alt = alternateOutcome(d)
      return !alt.winner && !alt.stillInGame && (alt.placement ?? 0) <= 2
    })) return 'Ungültige Platzfolge: Gleichstände brauchen Wettbewerbslücken, z. B. 1, 2, 2, 4.'
  return ''
}
export function outcomeFields(draft: OutcomeDraft, mode: OutcomeMode) {
  if (mode === 'DRAW') return { stillInGame: draft.draw ?? true }
  if (mode === 'WIN') return { placement: draft.placement! }
  const alt = alternateOutcome(draft)
  if (alt.winner) return { winner: true as const }
  return { stillInGame: alt.stillInGame, ...(!alt.stillInGame ? { placement: alt.placement! } : {}) }
}
// Also used at the transport boundary: cached inactive fields and read-only data
// must never reach the strict complete-write API.
export function gamePayload(input: GameInput): GameInput {
  return { result: input.result, alternateWinCon: input.result === 'WIN' && input.alternateWinCon,
    participants: input.participants.map(p => ({
      userId: p.userId, deckId: p.deckId, startPosition: p.startPosition,
      ...(input.result === 'DRAW' ? { stillInGame: p.stillInGame! } :
        !input.alternateWinCon ? { placement: p.placement! } :
          p.winner ? { winner: true as const } :
            { stillInGame: p.stillInGame!, ...(!p.stillInGame ? { placement: p.placement! } : {}) }),
    })) }
}
