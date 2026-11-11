import { Box } from '@mui/material'
import { magicColors, type MagicColor } from './api'
import { colorLabel } from './deckColors'

/** Compact read-only WUBRG (or colorless C) identity symbols with one accessible text alternative. */
export function ManaSymbols({ colors, size = 24 }: { colors: readonly MagicColor[]; size?: number }) {
  const symbols = magicColors.filter(color => colors.includes(color))
  const shown: (MagicColor | 'C')[] = symbols.length ? symbols : ['C']
  return <Box role="img" aria-label={colorLabel(colors)}
    sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
    {shown.map(symbol => <Box key={symbol} component="span" aria-hidden="true" sx={{
      width: size, height: size, boxSizing: 'border-box', borderRadius: '50%', display: 'grid', placeItems: 'center',
      border: '1px solid', borderColor: 'interaction.border', bgcolor: `mana.${symbol}`, color: symbol === 'B' ? 'mana.W' : 'mana.B',
      fontSize: size * 0.5, fontWeight: 700, lineHeight: 1,
    }}>{symbol}</Box>)}
  </Box>
}
