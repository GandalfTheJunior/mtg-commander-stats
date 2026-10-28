import { magicColors, type MagicColor } from '../api'

export type FrameTone = MagicColor | 'silver' | 'gold'
const names: Record<MagicColor, string> = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün' }
const finishes: Record<MagicColor, string> = { W: 'Perlmutt', U: 'Blaues Metall', B: 'Dunkles Metall', R: 'Rotes Metall', G: 'Grünes Metall' }

// The search choice's base identity is authoritative; art printing/pixels play no part.
export function frameFinish(identity: readonly MagicColor[]) {
  const colors = magicColors.filter(color => identity.includes(color))
  const identityLabel = colors.length ? colors.map(color => `${names[color]} (${color})`).join(' · ') : 'Farblos'
  if (!colors.length) return { left: 'silver', right: 'silver', identityLabel, label: 'Silber', kind: 'silver' } as const
  if (colors.length >= 3) return { left: 'gold', right: 'gold', identityLabel, label: 'Gold', kind: 'gold' } as const
  if (colors.length === 1) return { left: colors[0], right: colors[0], identityLabel, label: finishes[colors[0]], kind: 'mono' } as const
  return { left: colors[0], right: colors[1], identityLabel, label: `${names[colors[0]]} links · ${names[colors[1]]} rechts`, kind: 'split' } as const
}
