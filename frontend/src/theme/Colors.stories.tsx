import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Stack, Typography } from '@mui/material'
import { appTheme } from './theme'

// Palette groups configured in theme.ts. Values are always read from appTheme;
// MUI-generated helpers (grey, common, other action states) are left out.
const groups: { name: string; keys?: string[] }[] = [
  { name: 'background' }, { name: 'text', keys: ['primary', 'secondary', 'disabled'] }, { name: 'primary' }, { name: 'secondary' },
  { name: 'success' }, { name: 'warning' }, { name: 'error' }, { name: 'info' },
  { name: 'interaction' }, { name: 'mana' }, { name: 'divider' }, { name: 'action', keys: ['disabled', 'disabledBackground'] },
]

function tokens(name: string, keys?: string[]): [string, string][] {
  const value: unknown = appTheme.palette[name as keyof typeof appTheme.palette]
  if (typeof value === 'string') return [[`palette.${name}`, value]]
  return Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && (!keys || keys.includes(entry[0])))
    .map(([key, color]) => [`palette.${name}.${key}`, color])
}

function Palette() {
  return <Stack sx={{ gap: 3 }}>
    {groups.map(group => <Box component="section" key={group.name} aria-labelledby={`palette-${group.name}`}>
      <Typography component="h2" variant="h6" id={`palette-${group.name}`} sx={{ mb: 1 }}>{group.name}</Typography>
      <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0, gap: 1 }}>
        {tokens(group.name, group.keys).map(([path, color]) => <Box component="li" key={path}
          sx={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', gap: 2, alignItems: 'center' }}>
          <Box aria-hidden="true" sx={{ width: 48, height: 48, borderRadius: 1, bgcolor: color, border: '1px solid', borderColor: 'interaction.border' }} />
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography component="code" sx={{ display: 'block', fontFamily: 'monospace' }}>{path}</Typography>
            <Typography variant="numeric" sx={{ color: 'text.secondary' }}>{color}</Typography>
          </Box>
        </Box>)}
      </Stack>
    </Box>)}
  </Stack>
}

const meta = { title: 'Foundations/Colors' } satisfies Meta

export default meta

export const ThemePalette: StoryObj = { render: () => <Palette /> }
