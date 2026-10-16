import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

/** Development/test evidence, with no API or application-state dependency. */
export function ThemeFixture() {
  const [name, setName] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [selected, setSelected] = useState(false)
  return (
    <Box sx={{ bgcolor: 'background.default', color: 'text.primary', p: 2, minHeight: '100vh', boxSizing: 'border-box' }}>
      <Stack sx={{ maxWidth: 720, mx: 'auto', gap: 3, overflowWrap: 'anywhere' }}>
        <Typography component="h1" variant="wordmark">MTG Commander Stats</Typography>
        <Typography sx={{ color: 'text.secondary' }}>Development fixture — use Tab to inspect keyboard focus.</Typography>
        <Card component="section" aria-labelledby="theme-controls" sx={{ p: 2, overflow: 'visible' }}>
          <Typography id="theme-controls" component="h2" variant="h6">Themed controls</Typography>
          <Box component="form" noValidate onSubmit={(event) => { event.preventDefault(); setInvalid(!name.trim()) }}
            sx={{ display: 'grid', gap: 3, mt: 3 }}>
            <TextField id="fixture-name" label="Example name" value={name} error={invalid}
              onChange={(event) => { setName(event.target.value); setInvalid(false) }}
              helperText={invalid ? 'Error: enter a name.' : 'Try an empty submit, then a long name.'}
              slotProps={{ htmlInput: { required: true } }} />
            <TextField id="fixture-error" label="Validation example" defaultValue="Invalid value" error
              helperText="Error: this example needs correction." />
            <TextField id="fixture-disabled" label="Unavailable field" defaultValue="Disabled value" disabled
              helperText="Unavailable while saving." />
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Button variant="contained" type="submit">Validate name</Button>
              <Button variant="outlined" color="secondary" aria-pressed={selected} onClick={() => setSelected(!selected)}>
                {selected ? 'Selected option' : 'Select option'}
              </Button>
              <Button variant="text">Text action</Button>
              <Button variant="contained" disabled>Saving unavailable</Button>
            </Stack>
          </Box>
        </Card>
        <Paper component="section" aria-label="Raised surface" sx={{ bgcolor: 'background.raised', p: 2 }}>
          <Stack sx={{ gap: 2 }}>
            <Typography>Long text: Atraxa, Praetors’ Voice and the extraordinarily long Commander deck name.</Typography>
            <Typography sx={{ color: 'text.secondary' }}>Secondary warm text on a raised surface.</Typography>
            <Typography variant="numeric">12 games · 58.33%</Typography>
            <Typography sx={{ color: 'success.main' }}>Success: example saved.</Typography>
            <Typography sx={{ color: 'warning.main' }}>Warning: review this example.</Typography>
            <Typography sx={{ color: 'error.main' }}>Error: correction required.</Typography>
            <Typography sx={{ color: 'info.main' }}>Information: development only.</Typography>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
