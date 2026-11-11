import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Box, Button, Card, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import type { DeckStatistics, GroupStatistics, ManaStatistics, PlayerCount, PlayerStatistics } from './api'
import { groupUrl } from './groupNavigation'
import { countsText, formatRate, useGroupStatistics } from './statisticsData'
import {
  ambiguousDecks, ambiguousPlayers, observedSections, ownerLabel, playerLabel, rankedColors, sectionGames, sortDecks, sortPlayers,
  type DeckColumn, type PlayerColumn, type ReportSort, type SortDirection,
} from './statisticsOrder'
import { chooserState, reportOrigin, reportTitles, statisticsUrl, useStatisticsMemory, type StatisticsPresentation, type StatisticsReport } from './statisticsState'
import { BackLink, CommanderTitle, EmptyState, IdentityDisclosure, LoadFeedback, PlayerCountControl, RateBar, SeatLine, SkeletonCards } from './StatisticsParts'

const subtitles: Record<StatisticsReport, string> = {
  players: 'Alle Spieler mit aufgezeichneten Partien',
  decks: 'Alle Decks mit aufgezeichneten Partien',
  'starting-seats': 'Startplätze je Tischgröße getrennt',
  'mana-colors': 'Farbidentitäten gespielter Decks',
}
const subset = (playerCount?: PlayerCount) => playerCount ? `für ${playerCount}-Spieler-Partien ` : ''

/** One focused, read-only report with the shared player-count filter. Filter and
 * sorts are in-memory group-session choices; a fresh page load starts at defaults. */
export default function StatisticsReportPage({ groupId, report, onAccessError }: {
  groupId: string; report: StatisticsReport; onAccessError: (error: unknown) => void
}) {
  const location = useLocation()
  const memory = useStatisticsMemory(groupId)
  const [presentation, setPresentation] = useState<StatisticsPresentation>(memory.read)
  const [disclosed, setDisclosed] = useState<Set<string>>(() => new Set())
  const { load, retry } = useGroupStatistics(groupId, presentation.playerCount, onAccessError)
  function change(patch: Partial<StatisticsPresentation>) {
    memory.update(patch)
    setPresentation(current => ({ ...current, ...patch }))
  }
  const toggle = (id: string) => setDisclosed(current => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const origin = reportOrigin(location.state)
  const back = origin.kind === 'overview' ? <BackLink to={groupUrl(groupId)}>Zurück zur Übersicht</BackLink>
    : origin.kind === 'chooser' ? <BackLink to={statisticsUrl(groupId, 'chooser')} state={chooserState(origin.expanded)}>Zurück zu Statistiken</BackLink>
      : <BackLink to={statisticsUrl(groupId)}>Zurück zu Statistiken</BackLink>
  const { playerCount } = presentation
  return <Stack component="section" aria-labelledby="statistics-report-heading" sx={{ gap: 2, minWidth: 0 }}>
    {back}
    <Box>
      <Typography component="h3" variant="h5" id="statistics-report-heading" sx={{ overflowWrap: 'anywhere' }}>{reportTitles[report]}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{subtitles[report]}</Typography>
    </Box>
    <PlayerCountControl value={playerCount} onChange={value => change({ playerCount: value })} />
    <LoadFeedback load={load} onRetry={retry} />
    {report === 'players' && <PlayerReport groupId={groupId} load={load.status === 'ready' ? load.data.players : null} loading={load.status === 'loading'}
      playerCount={playerCount} sort={presentation.players} onSort={players => change({ players })} disclosed={disclosed} onToggle={toggle} />}
    {report === 'decks' && <DeckReport groupId={groupId} load={load.status === 'ready' ? load.data.decks : null} loading={load.status === 'loading'}
      playerCount={playerCount} sort={presentation.decks} onSort={decks => change({ decks })} disclosed={disclosed} onToggle={toggle} />}
    {report === 'starting-seats' && <SeatReport data={load.status === 'ready' ? load.data : null} loading={load.status === 'loading'} playerCount={playerCount} />}
    {report === 'mana-colors' && <ManaReport data={load.status === 'ready' ? load.data : null} loading={load.status === 'loading'} playerCount={playerCount} />}
  </Stack>
}

type Column<Name extends string> = { column: Name; label: string; numeric: boolean }
const numeric = [{ column: 'games', label: 'Spiele', numeric: true }, { column: 'wins', label: 'Siege', numeric: true }, { column: 'winRate', label: 'Siegrate', numeric: true }] as const
const playerColumns: Column<PlayerColumn>[] = [{ column: 'name', label: 'Spieler', numeric: false }, ...numeric]
const deckColumns: Column<DeckColumn>[] = [{ column: 'name', label: 'Deckname', numeric: false }, { column: 'owner', label: 'Besitzer', numeric: false }, ...numeric]
const selectStyle = {
  width: '100%', minWidth: 0, minHeight: 48, px: 1.5, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1, font: 'inherit',
  color: 'text.primary', bgcolor: 'background.paper', colorScheme: 'dark', '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 },
}

/** Mobile sorting: explicit column selector and direction control. */
function SortControls<Name extends string>({ id, columns, sort, onSort }: { id: string; columns: Column<Name>[]; sort: ReportSort<Name>; onSort: (sort: ReportSort<Name>) => void }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 1.5,
    '@media (max-width: 360px)': { gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 } }}>
    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Typography component="label" htmlFor={`${id}-column`} variant="body2" sx={{ color: 'text.secondary' }}>Sortieren nach</Typography>
      <Box component="select" id={`${id}-column`} value={sort.column} onChange={event => onSort({ ...sort, column: event.target.value as Name })} sx={selectStyle}>
        {columns.map(column => <option key={column.column} value={column.column}>{column.label}</option>)}
      </Box>
    </Box>
    <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Typography component="label" htmlFor={`${id}-direction`} variant="body2" sx={{ color: 'text.secondary' }}>Reihenfolge</Typography>
      <Box component="select" id={`${id}-direction`} value={sort.direction} onChange={event => onSort({ ...sort, direction: event.target.value as SortDirection })} sx={selectStyle}>
        <option value="descending">Absteigend</option>
        <option value="ascending">Aufsteigend</option>
      </Box>
    </Box>
  </Box>
}

/** Desktop sorting: semantic sortable header buttons with aria-sort. */
function SortHeader<Name extends string>({ column, sort, onSort, width }: { column: Column<Name>; sort: ReportSort<Name>; onSort: (sort: ReportSort<Name>) => void; width?: string }) {
  const active = sort.column === column.column
  return <TableCell component="th" scope="col" aria-sort={active ? sort.direction : undefined} sx={{ width }}>
    <Button color="secondary" onClick={() => onSort(active
      ? { column: column.column, direction: sort.direction === 'ascending' ? 'descending' : 'ascending' }
      : { column: column.column, direction: column.numeric ? 'descending' : 'ascending' })}
      sx={{ p: 0.5, minWidth: 0, textAlign: 'left', justifyContent: 'flex-start' }}>
      {column.label}{active && <Box component="span" aria-hidden="true">{sort.direction === 'ascending' ? ' ↑' : ' ↓'}</Box>}
    </Button>
  </TableCell>
}

const tableStyle = { width: '100%', tableLayout: 'fixed', '& th, & td': { px: 1, py: 1.5, verticalAlign: 'top', borderColor: 'divider', overflowWrap: 'anywhere' }, '& td': { fontVariantNumeric: 'tabular-nums' } } as const
const cardList = { listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 } as const

function RateCell({ value }: { value: number }) {
  return <TableCell><Typography variant="numeric" component="p" sx={{ m: 0, mb: 0.5, fontWeight: 600 }}>{formatRate(value)}</Typography><RateBar value={value} /></TableCell>
}

type RowReport<Row, Name extends string> = {
  groupId: string; load: Row[] | null; loading: boolean; playerCount?: PlayerCount
  sort: ReportSort<Name>; onSort: (sort: ReportSort<Name>) => void; disclosed: Set<string>; onToggle: (id: string) => void
}

function useDesktop() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.up('md'))
}

function PlayerReport({ groupId, load, loading, playerCount, sort, onSort, disclosed, onToggle }: RowReport<PlayerStatistics, PlayerColumn>) {
  const desktop = useDesktop()
  const rows = load ? sortPlayers(load, sort) : []
  const ambiguous = ambiguousPlayers(rows)
  const disclosure = (player: PlayerStatistics, index: number) => {
    if (!ambiguous.has(player.userId)) return null
    const id = `statistics-id-${groupId}-player-${player.userId}`
    return <IdentityDisclosure id={id} open={disclosed.has(id)} onToggle={() => onToggle(id)} label={`${playerLabel(player)}, Eintrag ${index + 1}`}
      lines={[['Spielerkennung', player.userId]]} />
  }
  return <>
    {!desktop && <SortControls id={`statistics-players-${groupId}`} columns={playerColumns} sort={sort} onSort={onSort} />}
    {loading && <SkeletonCards count={3} />}
    {load && (rows.length === 0 ? <EmptyState>{playerCount ? `Keine Spielerstatistiken ${subset(playerCount)}vorhanden.` : 'Noch keine Spielerstatistiken. Erfasst ein Spiel in dieser Gruppe, um Ergebnisse zu sehen.'}</EmptyState>
      : desktop ? <Table aria-label="Spielerstatistiken" sx={tableStyle}>
        <TableHead><TableRow>{playerColumns.map(column => <SortHeader key={column.column} column={column} sort={sort} onSort={onSort} width={column.column === 'name' ? '40%' : column.column === 'winRate' ? '24%' : undefined} />)}</TableRow></TableHead>
        <TableBody>{rows.map((player, index) => <TableRow key={player.userId}>
          <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>{playerLabel(player)}{disclosure(player, index)}</TableCell>
          <TableCell>{player.games}</TableCell><TableCell>{player.wins}</TableCell><RateCell value={player.winRatePercent} />
        </TableRow>)}</TableBody>
      </Table>
      : <Stack component="ul" aria-label="Spielerstatistiken" sx={cardList}>
        {rows.map((player, index) => <Card component="li" key={player.userId} sx={{ p: 2, minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography component="h4" variant="h6" sx={{ fontSize: '1.125rem', minWidth: 0, overflowWrap: 'anywhere' }}>{playerLabel(player)}</Typography>
            <Typography variant="numeric" sx={{ fontWeight: 700, fontSize: '1.125rem', flexShrink: 0 }}>{formatRate(player.winRatePercent)}</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 1 }}>{countsText(player.games, player.wins)}</Typography>
          <RateBar value={player.winRatePercent} />
          {disclosure(player, index)}
        </Card>)}
      </Stack>)}
  </>
}

function ArchivedChip() {
  return <Chip size="small" label="Archiviert" variant="outlined" sx={{ flexShrink: 0, color: 'text.secondary' }} />
}

function DeckReport({ groupId, load, loading, playerCount, sort, onSort, disclosed, onToggle }: RowReport<DeckStatistics, DeckColumn>) {
  const desktop = useDesktop()
  const rows = load ? sortDecks(load, sort) : []
  const ambiguous = ambiguousDecks(rows)
  const disclosure = (deck: DeckStatistics, index: number) => {
    if (!ambiguous.has(deck.deckId)) return null
    const id = `statistics-id-${groupId}-deck-${deck.deckId}`
    return <IdentityDisclosure id={id} open={disclosed.has(id)} onToggle={() => onToggle(id)} label={`Deck ${deck.name}, Eintrag ${index + 1}`}
      lines={[['Deckkennung', deck.deckId], ['Besitzerkennung', deck.ownerUserId]]} />
  }
  return <>
    {!desktop && <SortControls id={`statistics-decks-${groupId}`} columns={deckColumns} sort={sort} onSort={onSort} />}
    {loading && <SkeletonCards count={3} rows={1} />}
    {load && (rows.length === 0 ? <EmptyState>{playerCount ? `Keine Deckstatistiken ${subset(playerCount)}vorhanden.` : 'Noch keine Deckstatistiken. Erfasst ein Spiel in dieser Gruppe, um Ergebnisse zu sehen.'}</EmptyState>
      : desktop ? <Table aria-label="Deckstatistiken" sx={tableStyle}>
        <TableHead><TableRow>{deckColumns.map(column => <SortHeader key={column.column} column={column} sort={sort} onSort={onSort}
          width={column.column === 'name' ? '34%' : column.column === 'owner' ? '18%' : column.column === 'winRate' ? '20%' : undefined} />)}</TableRow></TableHead>
        <TableBody>{rows.map((deck, index) => <TableRow key={deck.deckId}>
          <TableCell component="th" scope="row">
            <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'flex-start' }}><CommanderTitle deck={deck} />{deck.archived && <ArchivedChip />}</Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Deck: {deck.name}</Typography>
            {disclosure(deck, index)}
          </TableCell>
          <TableCell>{ownerLabel(deck)}</TableCell><TableCell>{deck.games}</TableCell><TableCell>{deck.wins}</TableCell><RateCell value={deck.winRatePercent} />
        </TableRow>)}</TableBody>
      </Table>
      : <Stack component="ul" aria-label="Deckstatistiken" sx={cardList}>
        {rows.map((deck, index) => <Card component="li" key={deck.deckId} sx={{ p: 2, minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>Commander</Typography>
            {deck.archived && <ArchivedChip />}
          </Stack>
          <CommanderTitle deck={deck} component="h4" />
          <Typography sx={{ color: 'text.secondary', mt: 1, overflowWrap: 'anywhere' }}>Deck: {deck.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>Besitzer: {ownerLabel(deck)}</Typography>
          <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'baseline', mt: 1.5, mb: 0.5 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{countsText(deck.games, deck.wins)}</Typography>
            <Typography variant="numeric" sx={{ fontWeight: 700, fontSize: '1.125rem', flexShrink: 0 }}>{formatRate(deck.winRatePercent)}</Typography>
          </Stack>
          <RateBar value={deck.winRatePercent} />
          {disclosure(deck, index)}
        </Card>)}
      </Stack>)}
  </>
}

function Note({ children }: { children: ReactNode }) {
  return <Typography variant="body2" sx={{ color: 'text.secondary' }}>{children}</Typography>
}

type ChartReport = { data: GroupStatistics | null; loading: boolean; playerCount?: PlayerCount }

/** Separate sections per observed table size, seats in natural order; never pooled. */
function SeatReport({ data, loading, playerCount }: ChartReport) {
  const sections = data ? observedSections(data.startPositions) : []
  return <>
    <Note>Nur Tischgrößen mit aufgezeichneten Startplätzen</Note>
    {loading && <SkeletonCards count={1} rows={4} />}
    {data && (sections.length === 0 ? <EmptyState>{playerCount ? `Keine Startplatzdaten ${subset(playerCount)}vorhanden.` : 'Noch keine Startplätze aufgezeichnet.'}</EmptyState>
      : <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
        {sections.map(section => <Card key={section.playerCount} component="section" aria-labelledby={`seat-section-${section.playerCount}`} sx={{ p: 2, minWidth: 0 }}>
          <Typography component="h4" variant="h6" id={`seat-section-${section.playerCount}`} sx={{ pb: 1, mb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            {section.playerCount} Spieler · {sectionGames(section)} Partien
          </Typography>
          <Stack component="ul" aria-label={`Startplätze bei ${section.playerCount} Spielern`} sx={{ ...cardList, gap: 2 }}>
            {section.seats.map(seat => <SeatLine key={seat.startPosition} seat={seat} />)}
          </Stack>
        </Card>)}
      </Box>)}
  </>
}

const colorNames: Record<ManaStatistics['color'], string> = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün', C: 'Farblos' }

/** Compact single list of observed colors, ranked by actual win ratio. */
function ManaReport({ data, loading, playerCount }: ChartReport) {
  const colors = data ? rankedColors(data.manaColors).filter(row => row.games > 0) : []
  return <>
    <Note>Mehrfarbige Decks zählen je enthaltener Farbe. Spiele = Farbauftritte, nicht eindeutige Partien.</Note>
    {loading && <SkeletonCards count={6} rows={1} compact />}
    {data && (colors.length === 0 ? <EmptyState>{playerCount ? `Keine Manafarben ${subset(playerCount)}vorhanden.` : 'Noch keine Manafarben aufgezeichnet.'}</EmptyState>
      : <Box sx={{ maxWidth: 720 }}><Stack component="ul" aria-label="Siegrate nach Manafarbe" sx={{ ...cardList, gap: 1 }}>
        {colors.map(row => <Card component="li" key={row.color} sx={{ px: 1.5, py: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, alignItems: 'center' }}>
          <Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 1, border: '1px solid', borderColor: 'interaction.border', bgcolor: 'background.raised', fontWeight: 700 }}>{row.color}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography sx={{ fontWeight: 600 }}>{colorNames[row.color]}</Typography>
              <Typography variant="numeric" sx={{ fontWeight: 700, flexShrink: 0 }}>{formatRate(row.winRatePercent!)}</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(64px, 45%)', columnGap: 1.5, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{countsText(row.games, row.wins)}</Typography>
              <RateBar value={row.winRatePercent!} />
            </Box>
          </Box>
        </Card>)}
      </Stack></Box>)}
  </>
}
