import { expect, test } from 'vitest'
import type { MagicColor } from '../api'
import { frameFinish, type FrameTone } from './frameFinish'

const cases: { colors: MagicColor[]; left: FrameTone; right: FrameTone; kind: string; label: string }[] = [
  { colors: [], left: 'silver', right: 'silver', kind: 'silver', label: 'Silber' },
  { colors: ['W'], left: 'W', right: 'W', kind: 'mono', label: 'Perlmutt' },
  { colors: ['U'], left: 'U', right: 'U', kind: 'mono', label: 'Blaues Metall' },
  { colors: ['B'], left: 'B', right: 'B', kind: 'mono', label: 'Dunkles Metall' },
  { colors: ['R'], left: 'R', right: 'R', kind: 'mono', label: 'Rotes Metall' },
  { colors: ['G'], left: 'G', right: 'G', kind: 'mono', label: 'Grünes Metall' },
  { colors: ['W', 'U'], left: 'W', right: 'U', kind: 'split', label: 'Weiß links · Blau rechts' },
  { colors: ['U', 'B'], left: 'U', right: 'B', kind: 'split', label: 'Blau links · Schwarz rechts' },
  { colors: ['R', 'G'], left: 'R', right: 'G', kind: 'split', label: 'Rot links · Grün rechts' },
  { colors: ['W', 'U', 'B'], left: 'gold', right: 'gold', kind: 'gold', label: 'Gold' },
  { colors: ['W', 'U', 'B', 'R'], left: 'gold', right: 'gold', kind: 'gold', label: 'Gold' },
  { colors: ['W', 'U', 'B', 'R', 'G'], left: 'gold', right: 'gold', kind: 'gold', label: 'Gold' },
]
test.each(cases)('base identity $colors gives $label', ({ colors, ...expected }) => {
  expect(frameFinish(colors)).toMatchObject(expected)
})
test('two-colour placement is canonical WUBRG, with an accessible colourless identity', () => {
  expect(frameFinish(['G', 'U'])).toMatchObject({ left: 'U', right: 'G', identityLabel: 'Blau (U) · Grün (G)' })
  expect(frameFinish([]).identityLabel).toBe('Farblos')
})
