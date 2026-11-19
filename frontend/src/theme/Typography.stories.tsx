import type { CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Stack, Typography, type TypographyProps } from '@mui/material'
import { appTheme } from './theme'

// MUI's standard variants in reading order; any further variant object of
// appTheme.typography (the custom wordmark and numeric) follows in theme order.
const standard = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'subtitle1', 'subtitle2', 'body1', 'body2', 'button', 'caption', 'overline']
const rank = (name: string) => standard.includes(name) ? standard.indexOf(name) : standard.length

// 'inherit' only passes the parent font through.
const variants = Object.entries(appTheme.typography)
  .filter((entry): entry is [string, CSSProperties] => entry[0] !== 'inherit'
    && typeof entry[1] === 'object' && entry[1] !== null && 'fontSize' in entry[1])
  .sort(([a], [b]) => rank(a) - rank(b))

const size = (value: CSSProperties['fontSize']) =>
  typeof value === 'string' ? value.replace(/^(\d+\.\d{3})\d+/, '$1') : `${value}px`

const describe = (style: CSSProperties) => [
  `size ${size(style.fontSize)}`, `weight ${style.fontWeight ?? 'normal'}`, `line height ${style.lineHeight ?? 'normal'}`,
  ...style.fontFamily && style.fontFamily !== appTheme.typography.fontFamily ? [`family ${style.fontFamily}`] : [],
].join(' · ')

function Variants() {
  return <Stack component="ul" sx={{ listStyle: 'none', p: 0, m: 0, gap: 3 }}>
    {variants.map(([name, style]) => <Box component="li" key={name} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography component="code" sx={{ fontFamily: 'monospace', color: 'secondary.main' }}>{name}</Typography>
      <Typography variant={name as TypographyProps['variant']} component="p">Atraxa · 12 Spiele · 58,33 %</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{describe(style)}</Typography>
    </Box>)}
  </Stack>
}

const meta = { title: 'Foundations/Typography' } satisfies Meta

export default meta

export const ThemeVariants: StoryObj = { render: () => <Variants /> }
