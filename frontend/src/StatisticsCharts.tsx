import { Box, Card, Stack, Typography, useTheme } from '@mui/material'
import type { GroupStatistics, StatisticsCounts } from './api'
import { rankedColors } from './statisticsOrder'
const mana = {
  W: { label: 'Weiß (W)' }, U: { label: 'Blau (U)' },
  B: { label: 'Schwarz (B)' }, R: { label: 'Rot (R)' },
  G: { label: 'Grün (G)' }, C: { label: 'Farblos (C)' },
}
const percent = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
function Bar({ label, counts, fill }: { label: string; counts: StatisticsCounts; fill: string }) {
  return <Box component="li" sx={{ listStyle: 'none', minWidth: 0 }}>
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
      <Typography component="span" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{counts.winRatePercent === null ? 'Keine Daten vorhanden' : `${percent.format(counts.winRatePercent)}%`}</Typography>
    </Stack>
    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>{counts.games} Spiele · {counts.wins} Siege</Typography>
    {counts.winRatePercent !== null && <Box aria-hidden="true" sx={{ height: 16, bgcolor: 'action.hover', border: '1px solid', borderColor: 'text.secondary', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ width: `${counts.winRatePercent}%`, height: '100%', bgcolor: fill, boxSizing: 'border-box', border: counts.winRatePercent > 0 ? '1px solid' : undefined, borderColor: 'text.secondary' }} />
    </Box>}
  </Box>
}
export default function StatisticsCharts({ data }: { data: GroupStatistics }) {
  const theme = useTheme()
  const sections = data.startPositions.filter(section => section.seats.some(seat => seat.games > 0))
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start' }}>
    <Card component="section" aria-label="Siegrate nach Startplatz" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
      <Typography component="h4" variant="h6">Siegrate nach Startplatz</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>Getrennt nach Spielerzahl. Unentschieden zählen als Spiele ohne Sieg.</Typography>
      {sections.length === 0 ? <Typography role="status">Keine Daten vorhanden</Typography> : sections.map(section => <Box key={section.playerCount} component="section" aria-label={`${section.playerCount} Spieler`} sx={{ mt: 2 }}>
        <Typography component="h5" variant="subtitle1" sx={{ fontWeight: 700 }}>{section.playerCount} Spieler</Typography>
        <Stack component="ul" sx={{ p: 0, m: 0, mt: 1, gap: 2 }}>{section.seats.map(seat => <Bar key={seat.startPosition} label={`Startplatz ${seat.startPosition}`} counts={seat} fill={theme.palette.secondary.main} />)}</Stack>
      </Box>)}
    </Card>
    <Card component="section" aria-label="Siegrate nach Manafarbe" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
      <Typography component="h4" variant="h6">Siegrate nach Manafarbe</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>Jede Deckteilnahme zählt vollständig für jede Farbe ihrer Farbidentität. Die Kategorien überschneiden sich; die Prozente müssen nicht 100% ergeben.</Typography>
      <Stack component="ul" sx={{ p: 0, m: 0, gap: 2 }}>{rankedColors(data.manaColors).map(row => <Bar key={row.color} label={mana[row.color].label} counts={row} fill={theme.palette.mana[row.color]} />)}</Stack>
    </Card>
  </Box>
}
