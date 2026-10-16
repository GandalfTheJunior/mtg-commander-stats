import { useEffect, useRef, useState } from 'react'
import { ApiError, getGroupStatistics, type GroupStatistics as Statistics } from './api'

type Props = { groupId: string; onAccessError: (error: unknown) => void }
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Statistics }
const percent = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

// Mounted only inside the confirmed group's ready game area. Retiring that
// area on refresh, recovery, group or session changes also retires statistics.
export default function GroupStatistics({ groupId, onAccessError }: Props) {
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
            <thead><tr><th scope="col">Player</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Win rate</th></tr></thead>
            <tbody>{state.data.players.map((row) => <tr key={row.userId}>
              <th scope="row">{row.username}<small className="member-id">User ID: {row.userId}</small></th>
              <td>{row.games}</td><td>{row.wins}</td><td>{percent.format(row.winRatePercent)}%</td>
            </tr>)}</tbody>
          </table>
        </div>
        <h4 id={`deck-statistics-${groupId}`}>Deck statistics</h4>
        <div className="statistics-scroll" role="region" aria-labelledby={`deck-statistics-${groupId}`} tabIndex={0}>
          <table aria-labelledby={`deck-statistics-${groupId}`}>
            <thead><tr><th scope="col">Deck</th><th scope="col">Owner</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Win rate</th></tr></thead>
            <tbody>{state.data.decks.map((row) => <tr key={row.deckId}>
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
