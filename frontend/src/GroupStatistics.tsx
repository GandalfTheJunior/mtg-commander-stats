import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, Card, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, useMediaQuery, useTheme,
} from '@mui/material'
import { commanderNames, ApiError, getGroupStatistics, type GroupStatistics as Statistics } from './api'

type Sort<Column> = { column: Column; direction: 'ascending' | 'descending' }
type PlayerColumn = 'username' | 'games' | 'wins' | 'winRatePercent'
type DeckColumn = 'name' | 'ownerUsername' | 'games' | 'wins' | 'winRatePercent'
export type StatisticsView = 'players' | 'decks'
export type StatisticsSort = { players: Sort<PlayerColumn> | null; decks: Sort<DeckColumn> | null }
type Props = {
  groupId: string
  onAccessError: (error: unknown) => void
  sort: StatisticsSort
  onSort: (sort: StatisticsSort) => void
  view: StatisticsView
  onView: (view: StatisticsView) => void
  focusRefresh?: boolean
  onRefreshFocused?: () => void
}
const numericColumns = [
  { column: 'games', label: 'Spiele' }, { column: 'wins', label: 'Siege' }, { column: 'winRatePercent', label: 'Siegrate' },
] as const
const playerColumns = [{ column: 'username', label: 'Spieler' }, ...numericColumns] as const
const deckColumns = [{ column: 'name', label: 'Deck' }, { column: 'ownerUsername', label: 'Besitzer' }, ...numericColumns] as const
const textOrder = new Intl.Collator('en', { sensitivity: 'accent' })

function sortedRows<Row>(rows: Row[], sort: Sort<keyof Row> | null) {
  if (!sort) return rows
  // Sort fresh backend arrays, never a previously sorted display. Stable sort
  // preserves the received order for ties in both directions.
  return rows.toSorted((left, right) => {
    const a = left[sort.column], b = right[sort.column]
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : textOrder.compare(String(a), String(b))
    return sort.direction === 'ascending' ? comparison : -comparison
  })
}
function initialDirection(column: string) {
  return numericColumns.some(item => item.column === column) ? 'descending' : 'ascending'
}
const directionLabel = (direction: 'ascending' | 'descending') => direction === 'ascending' ? 'Aufsteigend' : 'Absteigend'
const focusStyle = { '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Statistics }
const percent = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
type DisplayRow = { id: string; title: string; games: number; wins: number; winRatePercent: number;
  commanders?: { name: string }[]; owner?: string; ownerId?: string; archived?: boolean }

// Presentation choices live in GameManager above this keyed request lifetime.
// Access rechecks, refreshes, group/session changes retire outstanding requests.
export default function GroupStatistics({ groupId, onAccessError, sort, onSort, view, onView, focusRefresh, onRefreshFocused }: Props) {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const [state, setState] = useState<State>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [disclosed, setDisclosed] = useState<Set<string>>(() => new Set())
  const generation = useRef(0)
  const accessError = useRef(onAccessError)
  const refreshButton = useRef<HTMLButtonElement>(null)
  const displacedFocus = useRef(false)
  useEffect(() => { accessError.current = onAccessError })
  useEffect(() => {
    if (focusRefresh) { refreshButton.current?.focus(); onRefreshFocused?.() }
  }, [focusRefresh, onRefreshFocused])
  // Browsers move focus to body when the focused responsive variant is
  // removed. Track focus before removal; never steal focus from another panel.
  useEffect(() => {
    if (displacedFocus.current && document.activeElement === document.body) refreshButton.current?.focus()
    displacedFocus.current = false
  }, [desktop])

  useEffect(() => {
    let active = true
    const version = ++generation.current
    const controller = new AbortController()
    getGroupStatistics(groupId, controller.signal).then((data) => {
      if (active && version === generation.current) setState({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!active || version !== generation.current) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) accessError.current(error)
      else setState({ status: 'error', message: error instanceof Error ? error.message : 'Statistiken konnten nicht geladen werden.' })
    })
    return () => { active = false; controller.abort() }
  }, [groupId, revision])

  const selectedSort = sort[view]
  const columns = view === 'players' ? playerColumns : deckColumns
  const label = view === 'players' ? 'Spielerstatistiken' : 'Deckstatistiken'
  const headingId = `statistics-${groupId}`
  const orderId = `statistics-order-${groupId}`
  const selectId = `statistics-sort-${groupId}`
  function chooseColumn(column: PlayerColumn | DeckColumn | '') {
    if (view === 'players') onSort({ ...sort, players: column ? { column: column as PlayerColumn, direction: initialDirection(column) } : null })
    else onSort({ ...sort, decks: column ? { column: column as DeckColumn, direction: initialDirection(column) } : null })
  }
  function reverseDirection() {
    if (view === 'players' && sort.players) onSort({ ...sort, players: { ...sort.players, direction: sort.players.direction === 'ascending' ? 'descending' : 'ascending' } })
    if (view === 'decks' && sort.decks) onSort({ ...sort, decks: { ...sort.decks, direction: sort.decks.direction === 'ascending' ? 'descending' : 'ascending' } })
  }
  const rows: DisplayRow[] = state.status !== 'ready' ? [] : view === 'players'
    ? sortedRows(state.data.players, sort.players).map(row => ({ ...row, id: row.userId, title: row.username }))
    : sortedRows(state.data.decks, sort.decks).map(row => ({ ...row, id: row.deckId, title: row.name, owner: row.ownerUsername, ownerId: row.ownerUserId }))

  function identity(row: DisplayRow) {
    const id = `statistics-id-${groupId}-${view}-${row.id}`
    const open = disclosed.has(id)
    // Received position supplies context for namesakes without permanently
    // announcing raw UUIDs. It stays associated with the same row on sorting.
    const position = state.status === 'ready' ? (view === 'players'
      ? state.data.players.findIndex(item => item.userId === row.id)
      : state.data.decks.findIndex(item => item.deckId === row.id)) + 1 : 0
    return <>
      <Button color="secondary" aria-expanded={open} aria-controls={id}
        aria-label={`Kennung ${open ? 'verbergen' : 'anzeigen'}: ${view === 'players' ? 'Spieler' : 'Deck'} ${row.title} (Eintrag ${position})`}
        onClick={() => setDisclosed(previous => {
          const next = new Set(previous)
          if (open) next.delete(id); else next.add(id)
          return next
        })} sx={{ textAlign: 'left', justifyContent: 'flex-start', px: 0.5 }}>
        Kennung {open ? 'verbergen' : 'anzeigen'}
      </Button>
      <Box id={id} hidden={!open} sx={{ overflowWrap: 'anywhere', fontWeight: 400 }}>
        {open && <><Typography variant="body2">{view === 'players' ? 'Spielerkennung' : 'Deckkennung'}: {row.id}</Typography>
          {row.ownerId && <Typography variant="body2">Besitzerkennung: {row.ownerId}</Typography>}</>}
      </Box>
    </>
  }
  function title(row: DisplayRow) {
    return <>{row.title}{row.archived && <Typography component="span" sx={{ display: 'block', color: 'text.secondary' }}>Archiviert</Typography>}
      {row.commanders && <Typography component="span" sx={{ display: 'block', fontWeight: 400, color: 'text.secondary' }}>Commander: {commanderNames({ commanders: row.commanders })}</Typography>}</>
  }

  return <Stack component="section" aria-labelledby={headingId} sx={{ gap: 2, pt: 2, minWidth: 0, color: 'text.primary', bgcolor: 'background.default', overflowWrap: 'anywhere' }}>
    <Typography component="h3" variant="h5" id={headingId}>Statistiken</Typography>
    <Stack direction="row" role="group" aria-label="Statistikansicht" sx={{ gap: 1 }}>
      {(['players', 'decks'] as const).map(value => <Button key={value} color="secondary" variant="outlined"
        aria-pressed={view === value} onClick={() => onView(value)} sx={{ flex: 1, minWidth: 0 }}>{value === 'players' ? 'Spieler' : 'Decks'}</Button>)}
    </Stack>
    <Button ref={refreshButton} color="secondary" aria-disabled={state.status === 'loading'} sx={{ alignSelf: 'flex-start', '&[aria-disabled="true"]': { color: 'text.disabled', bgcolor: 'action.disabledBackground' } }} onClick={() => {
      if (state.status === 'loading') return
      generation.current++
      setState({ status: 'loading' })
      setRevision(value => value + 1)
    }}>Statistiken aktualisieren</Button>
    {state.status === 'loading' && <Typography role="status">Statistiken werden geladen…</Typography>}
    {state.status === 'error' && <Alert severity="error">{state.message} Zum erneuten Versuch Statistiken aktualisieren.</Alert>}
    <Box onFocusCapture={() => { displacedFocus.current = true }} onBlurCapture={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) displacedFocus.current = false
    }}>
      {desktop ? <Button color="secondary" disabled={!selectedSort} onClick={() => chooseColumn('')}>Standardreihenfolge</Button>
        : <Stack sx={{ gap: 1 }}>
          <Box component="label" htmlFor={selectId}>Sortieren nach</Box>
          <Box component="select" id={selectId} value={selectedSort?.column ?? ''}
            onChange={event => chooseColumn(event.target.value as PlayerColumn | DeckColumn | '')}
            sx={{ minWidth: 0, width: '100%', minHeight: 48, p: 1, border: '1px solid', borderColor: 'interaction.border',
              borderRadius: 1, font: 'inherit', color: 'text.primary', bgcolor: 'background.paper', colorScheme: 'dark', ...focusStyle }}>
            <option value="">Standardreihenfolge</option>
            {columns.map(column => <option key={column.column} value={column.column}>{column.label}</option>)}
          </Box>
          <Button color="secondary" variant="outlined" disabled={!selectedSort} onClick={reverseDirection}
            aria-label={`Sortierrichtung: ${selectedSort ? directionLabel(selectedSort.direction) : 'Keine Sortierung'}`}>
            {selectedSort ? directionLabel(selectedSort.direction) : 'Aufsteigend / Absteigend'}
          </Button>
        </Stack>}
      <Typography id={orderId} role="status" variant="body2" sx={{ color: 'text.secondary', my: 1 }}>
        {label}: {selectedSort ? `${columns.find(column => column.column === selectedSort.column)?.label}, ${directionLabel(selectedSort.direction)}` : 'Standardreihenfolge'}
      </Typography>
      {state.status === 'ready' && (rows.length === 0 ? <Typography role="status">
        {view === 'players' ? 'Noch keine Spielerstatistiken.' : 'Noch keine Deckstatistiken.'} Erfasse ein Spiel in dieser Gruppe, um Ergebnisse zu sehen.
      </Typography> : desktop ? <Table aria-label={label} sx={{ width: '100%', tableLayout: 'fixed', '& th, & td': { px: 1, py: 1.5, verticalAlign: 'top', borderColor: 'divider', overflowWrap: 'anywhere' }, '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead><TableRow>{columns.map(({ column, label }, index) => <TableCell key={column} component="th" scope="col"
          sx={{ width: index === 0 ? view === 'players' ? '46%' : '28%' : column === 'ownerUsername' ? '21%' : undefined }}
          aria-sort={selectedSort?.column === column ? selectedSort.direction : undefined}>
          <Button color="secondary" aria-describedby={orderId} sx={{ p: 0.5, minWidth: 0, textAlign: 'left', justifyContent: 'flex-start' }}
            onClick={() => selectedSort?.column === column ? reverseDirection() : chooseColumn(column)}>
            {label}{selectedSort?.column === column && <Box component="span" aria-hidden="true">{selectedSort.direction === 'ascending' ? ' ↑' : ' ↓'}</Box>}
          </Button>
        </TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.map(row => <TableRow key={row.id}>
          <TableCell component="th" scope="row">{title(row)}{identity(row)}</TableCell>
          {view === 'decks' && <TableCell>{row.owner}</TableCell>}
          <TableCell>{row.games}</TableCell><TableCell>{row.wins}</TableCell><TableCell>{percent.format(row.winRatePercent)}%</TableCell>
        </TableRow>)}</TableBody>
      </Table> : <Stack component="ul" aria-label={label} sx={{ listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 }}>
        {rows.map(row => <Card component="li" key={row.id} sx={{ p: 2, minWidth: 0 }}>
          <Typography component="h4" variant="h6" sx={{ fontSize: '1.125rem' }}>{title(row)}</Typography>
          {view === 'decks' && <Typography sx={{ mt: 1, color: 'text.secondary' }}>Besitzer: {row.owner}</Typography>}
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1, my: 2 }}>
            {numericColumns.map(({ column, label }) => <Box key={column}>
              <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
              <Typography component="dd" variant="numeric" sx={{ m: 0 }}>{column === 'winRatePercent' ? `${percent.format(row[column])}%` : row[column]}</Typography>
            </Box>)}
          </Box>
          {identity(row)}
        </Card>)}
      </Stack>)}
    </Box>
  </Stack>
}
