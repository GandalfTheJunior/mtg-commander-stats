import { ApiError, listArtworks, searchCommanders, type Artwork, type CommanderChoice } from '../api'
import { safeArtworkUrl } from '../artworkUrl'

// Distinct, standalone Commanders with no pregame chosen-color requirement.
export const hallCommanderPool = [
  'The Ur-Dragon', 'Atraxa, Praetors\' Voice', 'Muldrotha, the Gravetide',
  'Edgar Markov', 'Kaalia of the Vast', 'Yuriko, the Tiger\'s Shadow',
  'Krenko, Mob Boss', 'Giada, Font of Hope', 'Talrand, Sky Summoner',
  'Goreclaw, Terror of Qal Sisma', 'Ayara, First of Locthwain', 'Kozilek, the Great Distortion',
  'Isshin, Two Heavens as One', 'Alela, Artful Provocateur',
] as const

// Exclude the last round, so even repeated RNG values yield a different set.
export function drawHallCommanders(previous: readonly string[] = [], random = Math.random): string[] {
  const pool: string[] = hallCommanderPool.filter(name => !previous.includes(name))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 6)
}
export type HallArtResult = { commander: CommanderChoice; artwork: Artwork; src: string; source: string } | { error: 'auth' | 'unavailable' }

// One sequential batch, at most six searches + six artwork reads, no retries.
export async function loadHallCommanders(names: readonly string[], signal: AbortSignal, publish: (index: number, result: HallArtResult) => void) {
  const seen = new Set<string>()
  for (const [index, name] of names.entries()) {
    if (signal.aborted) return
    try {
      const choices = await searchCommanders(name, signal)
      if (signal.aborted) return
      const commander = choices.find(choice => choice.name === name && choice.canBeSoleCommander && !choice.requiresChosenColor && !seen.has(choice.scryfallCardId))
      if (!commander) { publish(index, { error: 'unavailable' }); continue }
      seen.add(commander.scryfallCardId)
      const options = await listArtworks(commander.selectionRef, signal)
      if (signal.aborted) return
      const artwork = options.find(option => safeArtworkUrl(option.artCropUrl) && safeArtworkUrl(option.scryfallUri, true))
      publish(index, artwork ? { commander, artwork, src: safeArtworkUrl(artwork.artCropUrl)!, source: safeArtworkUrl(artwork.scryfallUri, true)! } : { error: 'unavailable' })
    } catch (cause: unknown) {
      if (signal.aborted) return
      const auth = cause instanceof ApiError && cause.status === 401
      if (auth) {
        // Missing session affects the entire remaining batch. Do not hammer login.
        for (let rest = index; rest < names.length; rest++) publish(rest, { error: 'auth' })
        return
      }
      publish(index, { error: 'unavailable' })
    }
  }
}
