import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  ApiError, getGroup, listGames,
  type Game, type GroupDetails, type PlayerCount,
} from './api'
import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { Link } from 'react-router'
import { groupUrl } from './groupNavigation'
import { gameSummary, gameUrl, recordedTime } from './gamePresentation'
import type { GroupTab } from './groupNavigation'
import GroupStatistics, { type StatisticsSort, type StatisticsView } from './GroupStatistics'
import { EditorLeave } from './editorGuard'

type Props = {
  group: GroupDetails
  tab?: GroupTab
  onUnauthorized: () => void
  onAccessLost: () => void
  onCheckingAccess: (checking: boolean) => void
  onGroupConfirmed: (group: GroupDetails) => void
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The game request failed.'
}

// The parent keys this area by selected group; App keys the
// entire group manager by confirmed session. Abort and generation checks retire
// responses (including 401s) before they can affect a different lifetime.
export default function GameManager({ group, tab = 'games', ...handlers }: Props) {
  const leave = useContext(EditorLeave)
  const id = group.id
  const callbacks = useRef(handlers)
  useEffect(() => { callbacks.current = handlers })
  const alive = useRef(false)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const [revision, setRevision] = useState(0)
  const [access, setAccess] = useState<'confirmed' | 'checking' | 'error'>('confirmed')
  const [statisticsRevision, setStatisticsRevision] = useState(0)
  const [statisticsBlocked, setStatisticsBlocked] = useState(false)
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'checking' | 'error'; games?: Game[]; error?: string }>({ status: 'loading' })
  // Kept above the ready content so game refreshes and acknowledged writes
  // retain presentation choices while the statistics request is remounted.
  // First visit mounts one statistics view; tab switches only hide its panel.
  const [statisticsVisited, setStatisticsVisited] = useState(tab === 'statistics')
  if (tab === 'statistics' && !statisticsVisited) setStatisticsVisited(true)
  const [statisticsPlayerCount, setStatisticsPlayerCount] = useState<PlayerCount | undefined>(undefined)
  const [statisticsView, setStatisticsView] = useState<StatisticsView>('players')
  const [focusStatistics, setFocusStatistics] = useState(false)
  const statisticsRetry = useRef<HTMLButtonElement>(null)
  const focusStatisticsRetry = useRef(false)
  useEffect(() => {
    if (statisticsBlocked && access === 'confirmed' && focusStatisticsRetry.current) {
      focusStatisticsRetry.current = false
      if (tab === 'statistics') statisticsRetry.current?.focus()
    }
  }, [statisticsBlocked, access, tab])
  const [statisticsSort, setStatisticsSort] = useState<StatisticsSort>({ players: null, decks: null })
  const [recoveryMessage, setRecoveryMessage] = useState('')
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current?.abort() }
  }, [])

  const accessFailed = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) callbacks.current.onUnauthorized()
    else if (error instanceof ApiError && [403, 404].includes(error.status)) callbacks.current.onAccessLost()
    else {
      setAccess('error')
      setState({ status: 'error' })
    }
  }, [])

  const recover = useCallback(async (error: unknown) => {
    if (!alive.current) return
    const version = ++generation.current
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const ambiguous = !(error instanceof ApiError) || ![400, 401, 403, 404, 409].includes(error.status)
    const explanation = ambiguous
      ? 'Der Speichervorgang wurde nicht bestätigt und könnte bereits gespeichert worden sein. Nicht erneut speichern, bevor du den Serverstand geprüft hast.'
      : error instanceof ApiError && error.status === 409
        ? 'Konflikt: Bitte den aktuellen Spielverlauf prüfen und eine neue Bearbeitung bewusst starten.'
        : 'Die Anfrage wurde abgelehnt. Bitte den aktuellen Spielverlauf und deine Berechtigung prüfen.'
    setRecoveryMessage(explanation)
    setState({ status: 'checking' })
    setAccess('checking')
    // Failed writes and access denials require explicit review/retry after the
    // safe check. In particular, a persistent statistics 403 must not loop GETs.
    focusStatisticsRetry.current = true
    setStatisticsBlocked(true)
    setStatisticsRevision(value => value + 1)
    callbacks.current.onCheckingAccess(true)
    if (error instanceof ApiError && error.status === 401) {
      callbacks.current.onUnauthorized()
      return
    }
    try {
      const confirmed = await getGroup(id, controller.signal)
      if (!alive.current || version !== generation.current) return
      callbacks.current.onGroupConfirmed(confirmed)
      callbacks.current.onCheckingAccess(false)
      setAccess('confirmed')
      setState({ status: 'error', error: `${explanation} ${message(error)} Group access is confirmed. Refresh games to review server state before trying again.` })
    } catch (accessError) {
      if (!alive.current || version !== generation.current) return
      accessFailed(accessError)
    }
  }, [id, accessFailed])

  useEffect(() => {
    const version = ++generation.current
    const controller = new AbortController()
    request.current = controller
    async function load() {
      let checkingAccess = revision > 0
      try {
        if (revision > 0) {
          const confirmed = await getGroup(id, controller.signal)
          if (!alive.current || version !== generation.current) return
          callbacks.current.onGroupConfirmed(confirmed)
          callbacks.current.onCheckingAccess(false)
          setAccess('confirmed')
          checkingAccess = false
        }
        const games = await listGames(id, controller.signal)
        if (alive.current && version === generation.current && !controller.signal.aborted) {
          setState({ status: 'ready', games })
        }
      } catch (error) {
        if (!alive.current || version !== generation.current) return
        if (checkingAccess) accessFailed(error)
        else if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await recover(error)
        else setState({ status: 'error', error: `${message(error)} Refresh games to try again.` })
      }
    }
    void load()
    return () => { controller.abort() }
  }, [id, revision, recover, accessFailed])

  function refresh() {
    setRecoveryMessage('')
    request.current?.abort()
    generation.current++
    setState({ status: 'loading' })
    setAccess('checking')
    setStatisticsBlocked(false)
    setStatisticsRevision(value => value + 1)
    callbacks.current.onCheckingAccess(true)
    setRevision((value) => value + 1)
  }

  return <>
    {recoveryMessage && access !== 'confirmed' && <Alert severity="error">{recoveryMessage}</Alert>}
    <div role="tabpanel" id="group-panel-games" aria-labelledby="group-tab-games" hidden={tab !== 'games'} tabIndex={0}>
      <section aria-labelledby={`games-${id}`}>
        <Typography component="h3" variant="h5" id={`games-${id}`} sx={{ mb: 2 }}>Spiele</Typography>
        <Button color="secondary" disabled={state.status === 'loading' || state.status === 'checking'}
          onClick={() => leave(refresh)}>Refresh games</Button>
        {state.status === 'loading' && <p role="status">Loading game history…</p>}
        {state.error && <Alert severity="error">{state.error}</Alert>}
        {state.status === 'ready' && <GameContent group={group} games={state.games!} />}
      </section>
    </div>
    {access === 'checking' && <p role="status">Checking group access…</p>}
    {access === 'error' && <div>
      <Alert severity="error">Group access could not be verified. Refresh games or members to try again.</Alert>
      <button type="button" onClick={() => leave(refresh)}>Refresh group access</button>
    </div>}
    <Box sx={{ color: 'text.primary', bgcolor: 'background.default', minWidth: 0 }} role="tabpanel" id="group-panel-statistics" aria-labelledby="group-tab-statistics" hidden={tab !== 'statistics'} tabIndex={0}>
      {statisticsVisited && access === 'confirmed' && (statisticsBlocked ? <div>
        <p role="status">Gruppenzugriff bestätigt. Bitte Statistiken aktualisieren, um den Serverstand zu prüfen.</p>
        <Button ref={statisticsRetry} color="secondary" onClick={() => { setFocusStatistics(true); setStatisticsBlocked(false) }}>Statistiken aktualisieren</Button>
      </div> : <GroupStatistics key={statisticsRevision} groupId={id} onAccessError={recover} sort={statisticsSort} onSort={setStatisticsSort}
        playerCount={statisticsPlayerCount} onPlayerCount={setStatisticsPlayerCount} view={statisticsView} onView={setStatisticsView} focusRefresh={focusStatistics && tab === 'statistics'} onRefreshFocused={() => setFocusStatistics(false)} />)}
    </Box>
  </>
}

function GameContent({ group, games }: { group: GroupDetails; games: Game[] }) {
  return <Stack sx={{ gap: 2, minWidth: 0 }}>
    <Button component={Link} to={`${groupUrl(group.id, 'games')}/new`} variant="contained"
      sx={{ alignSelf: 'flex-start', minHeight: 48 }}>Spiel erfassen</Button>
    <Typography component="h4" variant="h6">Spielverlauf</Typography>
    {games.length === 0 ? <Typography>No recorded games yet.</Typography> : <Stack component="ol" aria-label="Game history" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 }}>
      {games.map(game => <Box component="li" key={game.id} sx={{ minWidth: 0 }}>
        <Card component="article" aria-label={`Game ${game.id}`} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <CardActionArea component={Link} to={gameUrl(group.id, game.id)}
            aria-label={`Spieldetails: ${gameSummary(game)} · ${game.participants.length} Teilnehmende · Erfasst am ${recordedTime(game)} · ${game.id}`}
            sx={{ p: 2, minHeight: 48, display: 'block', textAlign: 'left', color: 'text.primary', textDecoration: 'none', '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
            <Typography component="h5" variant="h6" sx={{ overflowWrap: 'anywhere', fontSize: '1.125rem', lineHeight: 1.45 }}>{gameSummary(game)}</Typography>
            <Typography sx={{ mt: 1, color: 'text.secondary' }}>{game.participants.length} Teilnehmende</Typography>
            <Typography sx={{ color: 'text.secondary' }}>Erfasst am <time dateTime={game.recordedAt}>{recordedTime(game)}</time></Typography>
          </CardActionArea>
        </Card>
      </Box>)}
    </Stack>}
  </Stack>
}
