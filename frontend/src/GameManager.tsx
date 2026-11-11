import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ApiError, getGroup, gamesHistoryPage,
  type GamePreview, type GroupDetails, type PlayerCount,
} from './api'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { Link } from 'react-router'
import { groupUrl } from './groupNavigation'
import CompactGameCard from './CompactGameCard'
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
  /** Nonblocking post-save panel shown directly above the history (#196). */
  savedPanel?: ReactNode
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The game request failed.'
}

// The parent keys this area by selected group; App keys the
// entire group manager by confirmed session. Abort and generation checks retire
// responses (including 401s) before they can affect a different lifetime.
export default function GameManager({ group, tab = 'games', savedPanel, ...handlers }: Props) {
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
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'checking' | 'error'; games?: GamePreview[]; nextCursor?: string | null; error?: string }>({ status: 'loading' })
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
      if (!alive.current || version !== generation.current || controller.signal.aborted) return
      callbacks.current.onGroupConfirmed(confirmed)
      callbacks.current.onCheckingAccess(false)
      setAccess('confirmed')
      setState({ status: 'error', error: `${explanation} ${message(error)} Group access is confirmed. Refresh games to review server state before trying again.` })
    } catch (accessError) {
      if (!alive.current || version !== generation.current || controller.signal.aborted) return
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
          if (!alive.current || version !== generation.current || controller.signal.aborted) return
          callbacks.current.onGroupConfirmed(confirmed)
          callbacks.current.onCheckingAccess(false)
          setAccess('confirmed')
          checkingAccess = false
        }
        const page = await gamesHistoryPage(id, undefined, controller.signal)
        if (alive.current && version === generation.current && !controller.signal.aborted) {
          setState({ status: 'ready', ...page })
        }
      } catch (error) {
        if (!alive.current || version !== generation.current || controller.signal.aborted) return
        if (checkingAccess) accessFailed(error)
        else if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await recover(error)
        else setState({ status: 'error', error: `${message(error)} Refresh games to try again.` })
      }
    }
    void load()
    return () => { controller.abort() }
  }, [id, revision, recover, accessFailed])

  const pagePending = useRef(false)
  const [pageStatus, setPageStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const sentinel = useRef<HTMLDivElement>(null)
  const append = useCallback(async () => {
    if (pagePending.current || state.status !== 'ready' || !state.nextCursor) return
    pagePending.current = true
    setPageStatus('loading')
    const version = generation.current
    const controller = new AbortController()
    request.current = controller
    try {
      const page = await gamesHistoryPage(id, state.nextCursor, controller.signal)
      if (!alive.current || version !== generation.current || controller.signal.aborted) return
      setState(previous => {
        const seen = new Set(previous.games?.map(game => game.id.toLowerCase()))
        return { status: 'ready', games: [...(previous.games ?? []), ...page.games.filter(game => !seen.has(game.id.toLowerCase()))], nextCursor: page.nextCursor }
      })
      setPageStatus('idle')
    } catch (error) {
      if (!alive.current || version !== generation.current || controller.signal.aborted) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await recover(error)
      else setPageStatus('error')
    } finally {
      if (version === generation.current) pagePending.current = false
    }
  }, [id, state, recover])
  useEffect(() => {
    if (tab !== 'games' || state.status !== 'ready' || !state.nextCursor || pageStatus !== 'idle' || !sentinel.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void append()
    })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [append, state, tab, pageStatus])

  function refresh() {
    pagePending.current = false
    setPageStatus('idle')
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
        <Button component={Link} to={`${groupUrl(group.id, 'games')}/new`} variant="contained"
          sx={{ mb: 2, minHeight: 48 }}>Spiel erfassen</Button>
        {savedPanel}
        <Typography component="h3" variant="h5" id={`games-${id}`} sx={{ mb: 2 }}>Spielehistorie</Typography>
        {state.status === 'loading' && <p role="status">Spielehistorie wird geladen…</p>}
        {state.error && <Alert severity="error">{state.error}</Alert>}
        {state.status === 'error' && <Button onClick={() => leave(refresh)}>Refresh games</Button>}
        {state.status === 'ready' && <>
          <GameContent games={state.games!} />
          {pageStatus === 'loading' && <Typography role="status">Weitere Spiele werden geladen…</Typography>}
          {pageStatus === 'error' && <Alert severity="error">Weitere Spiele konnten nicht geladen werden.
            <Button onClick={() => { void append() }}>Erneut versuchen</Button>
          </Alert>}
          {state.nextCursor ? <div data-history-sentinel ref={sentinel} aria-hidden="true" style={{ height: 1 }} /> :
            state.games!.length > 0 && <Typography role="status">Du hast das Ende der Bibliothek erreicht.</Typography>}
        </>}
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

function GameContent({ games }: { games: GamePreview[] }) {
  return games.length === 0 ?
    <Typography>Tamiyo hat noch keine Aufzeichnungen angefertigt. Sobald ihr ein paar Runden gespielt habt, seht ihr hier eure Historie.</Typography> :
    <Stack component="ol" aria-label="Game history" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 }}>
      {games.map(game => <Box component="li" key={game.id} sx={{ minWidth: 0 }}><CompactGameCard game={game} /></Box>)}
    </Stack>
}
