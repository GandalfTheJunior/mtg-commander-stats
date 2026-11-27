import { magicColors, type MagicColor } from './api'

export const colorNames = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün' }

/** Accessible text for a WUBRG identity; an empty identity is colorless. */
export const colorLabel = (colors: readonly MagicColor[]) =>
  `Farbidentität: ${magicColors.filter(color => colors.includes(color)).map(color => colorNames[color]).join(', ') || 'Farblos'}`
