import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Alert, Box, Button, Card, Skeleton, Stack, Typography } from '@mui/material'
import type { DeckStatistics, PlayerCount, SeatStatistics } from './api'
import { countsText, formatRate, type StatisticsLoad } from './statisticsData'

const focusRing = { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 }
const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', margin: '-1px', p: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

/** Decorative horizontal win-rate bar; the percentage is always present as text. */
export function RateBar({ value }: { value: number }) {
  return <Box aria-hidden="true" sx={{ height: 8, borderRadius: 4, bgcolor: 'background.default', border: '1px solid', borderColor: 'interaction.border', overflow: 'hidden', minWidth: 0 }}>
    <Box sx={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', bgcolor: 'secondary.main' }} />
  </Box>
}

export function BackLink({ to, state, children }: { to: string; state?: unknown; children: ReactNode }) {
  return <Button component={Link} to={to} state={state} color="secondary" sx={{ alignSelf: 'flex-start', px: 0.5 }}>
    <Box component="span" aria-hidden="true" sx={{ mr: 1 }}>‹</Box>{children}
  </Button>
}

/** Announces loading/results to assistive technology and offers explicit retry. */
export function LoadFeedback({ load, onRetry }: { load: StatisticsLoad; onRetry: () => void }) {
  return <>
    <Typography role="status" sx={visuallyHidden}>
      {load.status === 'loading' ? 'Statistiken werden geladen…' : load.status === 'ready' ? 'Statistiken geladen.' : ''}
    </Typography>
    {load.status === 'error' && <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Erneut versuchen</Button>}
      sx={{ alignItems: 'center', '& .MuiAlert-action': { pt: 0 } }}>
      Die Statistiken konnten nicht geladen werden.
    </Alert>}
  </>
}

const reducedMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }
export function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return <Stack aria-hidden="true" sx={{ gap: 1.5 }}>
    {Array.from({ length: rows }, (_, index) => <Box key={index}>
      <Skeleton variant="text" width="60%" sx={reducedMotion} />
      <Skeleton variant="text" width="40%" sx={reducedMotion} />
      <Skeleton variant="rounded" height={8} sx={reducedMotion} />
    </Box>)}
  </Stack>
}
/** Report-shaped placeholders: cards for player/deck rows, a section, or six compact color rows. */
export function SkeletonCards({ count, rows = 1, compact = false }: { count: number; rows?: number; compact?: boolean }) {
  return <Stack aria-hidden="true" sx={{ gap: compact ? 1 : 2 }}>
    {Array.from({ length: count }, (_, index) => <Card key={index} sx={{ p: compact ? 1.5 : 2 }}><SkeletonLines rows={rows} /></Card>)}
  </Stack>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card sx={{ p: 2 }}><Typography>{children}</Typography></Card>
}

const playerCounts: (PlayerCount | undefined)[] = [undefined, 2, 3, 4, 5, 6]
/** The shared Alle/2/3/4/5/6 segmented radio group; native radios provide
 * keyboard arrows and screen-reader semantics. Narrow phones use 3 × 2. */
export function PlayerCountControl({ value, onChange }: { value?: PlayerCount; onChange: (value: PlayerCount | undefined) => void }) {
  const name = useId()
  return <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
    <Typography component="legend" variant="body2" sx={{ color: 'text.secondary', mb: 0.5, p: 0 }}>Spielerzahl</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 0.5, p: 0.5, border: '1px solid', borderColor: 'interaction.border', borderRadius: 2, bgcolor: 'background.paper',
      '@media (max-width: 360px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } }}>
      {playerCounts.map(count => {
        const checked = value === count
        return <Box component="label" key={count ?? 'all'} sx={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 44, minWidth: 0, borderRadius: 1.5, cursor: 'pointer',
          fontVariantNumeric: 'tabular-nums', fontWeight: checked ? 700 : 400, color: checked ? 'secondary.contrastText' : 'text.primary',
          bgcolor: checked ? 'secondary.main' : 'transparent', '&:hover': checked ? undefined : { bgcolor: 'interaction.hover' }, '&:has(input:focus-visible)': focusRing }}>
          <Box component="input" type="radio" name={name} value={count ?? ''} checked={checked} onChange={() => onChange(count)}
            sx={{ position: 'absolute', inset: 0, m: 0, opacity: 0, cursor: 'pointer' }} />
          {count ?? 'Alle'}
        </Box>
      })}
    </Box>
  </Box>
}

/** Quiet, on-request identifier disclosure for otherwise ambiguous visible rows. */
export function IdentityDisclosure({ id, open, onToggle, label, lines }: {
  id: string; open: boolean; onToggle: () => void; label: string; lines: [string, string][]
}) {
  return <Box sx={{ mt: 1, pt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
    <Button color="secondary" aria-expanded={open} aria-controls={id} aria-label={`Kennung ${open ? 'verbergen' : 'anzeigen'}: ${label}`} onClick={onToggle}
      sx={{ px: 0.5, width: '100%', justifyContent: 'space-between', fontWeight: 400, color: 'text.secondary' }}>
      Kennung {open ? 'verbergen' : 'anzeigen'}<Box component="span" aria-hidden="true">{open ? '▴' : '▾'}</Box>
    </Button>
    <Box id={id} hidden={!open} sx={{ overflowWrap: 'anywhere', px: 0.5 }}>
      {open && lines.map(([name, value]) => <Typography key={name} variant="body2">{name}: {value}</Typography>)}
    </Box>
  </Box>
}

/** Commander name(s) as the dominant deck title; every Commander wraps on its own line. */
export function CommanderTitle({ deck, component = 'span' }: { deck: DeckStatistics; component?: 'span' | 'h4' }) {
  return <Typography component={component} sx={{ fontWeight: 700, fontSize: '1.0625rem', m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
    {deck.commanders.map(commander => <Box component="span" key={commander.position} sx={{ display: 'block' }}>{commander.name}</Box>)}
  </Typography>
}

/** A seat row; a null rate means no observations and is never shown as 0 %. */
export function SeatLine({ seat }: { seat: SeatStatistics }) {
  return <Box component="li" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.8fr)', columnGap: 2, alignItems: 'center', minWidth: 0 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }}>Startplatz {seat.startPosition}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{countsText(seat.games, seat.wins)}</Typography>
    </Box>
    <Box sx={{ minWidth: 0, textAlign: 'right' }}>
      {seat.winRatePercent === null
        ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>Keine Beobachtung</Typography>
        : <><Typography variant="numeric" component="p" sx={{ fontWeight: 600, m: 0 }}>{formatRate(seat.winRatePercent)}</Typography><RateBar value={seat.winRatePercent} /></>}
    </Box>
  </Box>
}
