import { useEffect, useRef, useState } from 'react'
import { ApiError, getGroupStatistics, type GroupStatistics as Statistics } from './api'

type Sort<Column> = { column: Column; direction: 'ascending' | 'descending' }
type PlayerColumn = 'username' | 'games' | 'wins' | 'winRatePercent'
type DeckColumn = 'name' | 'ownerUsername' | 'games' | 'wins' | 'winRatePercent'
export type StatisticsSort = { players: Sort<PlayerColumn> | null; decks: Sort<DeckColumn> | null }
type Props = {
  groupId: string
  onAccessError: (error: unknown) => void
  sort: StatisticsSort
  onSort: (sort: StatisticsSort) => void
}
const numericColumns = [
  { column: 'games', label: 'Games' }, { column: 'wins', label: 'Wins' }, { column: 'winRatePercent', label: 'Win rate' },
] as const
const playerColumns = [{ column: 'username', label: 'Player' }, ...numericColumns] as const
const deckColumns = [{ column: 'name', label: 'Deck' }, { column: 'ownerUsername', label: 'Owner' }, ...numericColumns] as const
const textOrder = new Intl.Collator('en', { sensitivity: 'accent' })

function sortedRows<Row>(rows: Row[], sort: Sort<keyof Row> | null) {
  if (!sort) return rows
  // Always sort a copy of the fresh backend array. Stable sorting preserves its
  // order for ties in either direction, rather than using the previous sort.
  return rows.toSorted((left, right) => {
    const a = left[sort.column], b = right[sort.column]
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : textOrder.compare(String(a), String(b))
    return sort.direction === 'ascending' ? comparison : -comparison
  })
}

function SortHeader<Column extends string>({ column, label, sort, onSort }: {
  column: Column; label: string; sort: Sort<Column> | null; onSort: (sort: Sort<Column>) => void
}) {
  const active = sort?.column === column
  const numeric = numericColumns.some(item => item.column === column)
  return <th scope="col" aria-sort={active ? sort.direction : undefined}>
    <button type="button" className="statistics-sort" onClick={() => onSort({ column,
      direction: active ? (sort.direction === 'ascending' ? 'descending' : 'ascending') : numeric ? 'descending' : 'ascending',
    })}>
      {label}{active && <span aria-hidden="true">{sort.direction === 'ascending' ? ' ↑' : ' ↓'}</span>}
    </button>
  </th>
}
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Statistics }
const percent = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

// Mounted only inside the confirmed group's ready game area. Retiring that
// area on refresh, recovery, group or session changes also retires statistics.
export default function GroupStatistics({ groupId, onAccessError, sort, onSort }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const accessError = useRef(onAccessError)
  useEffect(() => { accessError.current = onAccessError })

  useEffect(() => {
    let active = true
    const version = ++generation.current
    const controller = new AbortController()
    getGroupStatistics(groupId, controller.signal).then((data) => {
      if (active && version === generation.current) setState({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!active || version !== generation.current) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        accessError.current(error)
      } else {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load statistics.' })
      }
    })
    return () => { active = false; controller.abort() }
  }, [groupId, revision])

  return <section className="statistics" aria-labelledby={`statistics-${groupId}`}>
    <h3 id={`statistics-${groupId}`}>Statistics</h3>
    <button type="button" className="secondary" disabled={state.status === 'loading'} onClick={() => {
      generation.current++
      setState({ status: 'loading' })
      setRevision((value) => value + 1)
    }}>Refresh statistics</button>
    {state.status === 'loading' && <p role="status">Loading statistics…</p>}
    {state.status === 'error' && <p role="alert" className="error">{state.message} Refresh statistics to try again.</p>}
    {state.status === 'ready' && (state.data.players.length === 0 && state.data.decks.length === 0
      ? <p>No statistics yet. Record a game in this group to see player and deck results.</p>
      : <>
        <h4 id={`player-statistics-${groupId}`}>Player statistics</h4>
        <div className="statistics-scroll" role="region" aria-labelledby={`player-statistics-${groupId}`} tabIndex={0}>
          <table aria-labelledby={`player-statistics-${groupId}`}>
            <thead><tr>{playerColumns.map(header => <SortHeader key={header.column} {...header} sort={sort.players}
              onSort={players => onSort({ ...sort, players })} />)}</tr></thead>
            <tbody>{sortedRows(state.data.players, sort.players).map((row) => <tr key={row.userId}>
              <th scope="row">{row.username}<small className="member-id">User ID: {row.userId}</small></th>
              <td>{row.games}</td><td>{row.wins}</td><td>{percent.format(row.winRatePercent)}%</td>
            </tr>)}</tbody>
          </table>
        </div>
        <h4 id={`deck-statistics-${groupId}`}>Deck statistics</h4>
        <div className="statistics-scroll" role="region" aria-labelledby={`deck-statistics-${groupId}`} tabIndex={0}>
          <table aria-labelledby={`deck-statistics-${groupId}`}>
            <thead><tr>{deckColumns.map(header => <SortHeader key={header.column} {...header} sort={sort.decks}
              onSort={decks => onSort({ ...sort, decks })} />)}</tr></thead>
            <tbody>{sortedRows(state.data.decks, sort.decks).map((row) => <tr key={row.deckId}>
              <th scope="row">{row.name}{row.archived && <span> — Archived</span>}
                <small>{row.commander}</small><small className="member-id">Deck ID: {row.deckId}</small></th>
              <td>{row.ownerUsername}<small className="member-id">User ID: {row.ownerUserId}</small></td>
              <td>{row.games}</td><td>{row.wins}</td><td>{percent.format(row.winRatePercent)}%</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>)}
  </section>
}
