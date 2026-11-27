import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { magicColors, type MagicColor } from './api'

import { colorNames } from './deckColors'
// Decorative theme swatches supplement fully named controls.
export function ManaColorPicker({ value, onChange, disabled = false, descriptionId, selected = true }: {
  value: MagicColor[]; onChange: (value: MagicColor[]) => void; disabled?: boolean; descriptionId?: string; selected?: boolean
}) {
  return <Box component="fieldset" aria-describedby={descriptionId} sx={{ m: 0, p: 2, minWidth: 0, borderColor: 'interaction.border', color: 'text.primary', bgcolor: 'background.paper' }}>
    <Typography component="legend">Farbidentität</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 1 }}>
      {magicColors.map(color => <Button key={color} type="button" color="secondary" variant="outlined"
        aria-label={`${colorNames[color]} (${color})`} aria-pressed={value.includes(color)} disabled={disabled}
        onClick={() => onChange(magicColors.filter(candidate => candidate === color ? !value.includes(color) : value.includes(candidate)))}
        sx={{ minHeight: 112, px: 1, gap: 0.5, flexDirection: 'column', color: 'text.primary', borderColor: 'interaction.border' }}>
        <Box component="span" aria-hidden="true" sx={{ width: 16, height: 16, flexShrink: 0, borderRadius: '50%', bgcolor: theme => theme.palette.mana[color], border: '2px solid', borderColor: 'interaction.border' }} />
        <span>{colorNames[color]} ({color})</span><span aria-hidden="true">{value.includes(color) ? '✓' : '–'}</span>
      </Button>)}
    </Box>
    <Typography sx={{ mt: 1, color: 'text.secondary' }} role="status">{value.length ? value.map(color => colorNames[color]).join(' · ') : selected ? 'Farblos' : 'Bitte einen Commander und gegebenenfalls eine Farbe wählen.'}</Typography>
  </Box>
}
