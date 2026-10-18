import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  ApiError, getGroup, listGames, saveGame,
  type Game, type GameInput, type GroupDetails,
} from './api'
import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { Link } from 'react-router'
import { gameSummary, gameUrl, mayManageGame, recordedTime, sameId } from './gamePresentation'
import GameEditor from './GameEditor'
import type { GroupTab } from './groupNavigation'
import GroupStatistics, { type StatisticsSort } from './GroupStatistics'
import { EditorLeave } from './editorGuard'

type Props = {
  group: GroupDetails
  tab?: GroupTab
  initialEditId?: string
  onEditConsumed?: () => void
  actorId: string
  onUnauthorized: () => void
  onAccessLost: () => void
  onCheckingAccess: (checking: boolean) => void
  onGroupConfirmed: (group: GroupDetails) => void
  onChanged?: () => void
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The game request failed.'
}

// The parent keys this area by selected group; App keys the
// entire group manager by confirmed session. Abort and generation checks retire
// responses (including 401s) before they can affect a different lifetime.
export default function GameManager({ group, actorId, tab = 'games', initialEditId, ...handlers }: Props) {
  const leave = useContext(EditorLeave)
  const id = group.id
  const editIntent = useRef(initialEditId)
  const actor = useRef({ group, actorId })
  useEffect(() => { actor.current = { group, actorId } })
  const callbacks = useRef(handlers)
  useEffect(() => { callbacks.current = handlers })
  const alive = useRef(false)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const [revision, setRevision] = useState(0)
  const [access, setAccess] = useState<'confirmed' | 'checking' | 'error'>('confirmed')
  const [statisticsRevision, setStatisticsRevision] = useState(0)
  const [statisticsBlocked, setStatisticsBlocked] = useState(false)
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'checking' | 'error'; games?: Game[]; error?: string; editGame?: Game; editError?: string }>({ status: 'loading' })
  // Kept above the ready content so game refreshes and acknowledged writes
  // retain presentation choices while the statistics request is remounted.
  // First visit mounts one statistics view; tab switches only hide its panel.
  const [statisticsVisited, setStatisticsVisited] = useState(tab === 'statistics')
  if (tab === 'statistics' && !statisticsVisited) setStatisticsVisited(true)
  const [statisticsSort, setStatisticsSort] = useState<StatisticsSort>({ players: null, decks: null })
  const [notice, setNotice] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const noticeElement = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (notice && state.status === 'ready' && tab === 'games') noticeElement.current?.focus()
  }, [notice, state.status, tab])
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
    setStatisticsBlocked(true)
    setStatisticsRevision(value => value + 1)
    setNotice('')
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
        let confirmedGroup = actor.current.group
        if (revision > 0) {
          const confirmed = await getGroup(id, controller.signal)
          if (!alive.current || version !== generation.current) return
          confirmedGroup = confirmed
          callbacks.current.onGroupConfirmed(confirmed)
          callbacks.current.onCheckingAccess(false)
          setAccess('confirmed')
          checkingAccess = false
        }
        const games = await listGames(id, controller.signal)
        if (alive.current && version === generation.current && !controller.signal.aborted) {
          const target = editIntent.current
          editIntent.current = undefined
          if (target) callbacks.current.onEditConsumed?.()
          const game = target ? games.find(game => sameId(game.id, target)) : undefined
          const editable = game && mayManageGame(confirmedGroup, game, actor.current.actorId)
          setState({ status: 'ready', games, editGame: editable ? game : undefined,
            editError: target && !editable ? 'Das Spiel kann nicht mehr bearbeitet werden. Bitte prüfe den aktuellen Serverstand.' : undefined })
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
          onClick={() => leave(() => { setNotice(''); refresh() })}>Refresh games</Button>
        {state.status === 'loading' && <p role="status">Loading game history…</p>}
        {state.error && <Alert severity="error">{state.error}</Alert>}
        {notice && <Alert ref={noticeElement} tabIndex={-1} severity="success" role="status">{notice}</Alert>}
        {state.status === 'ready' && <GameContent group={group} games={state.games!} initialEditor={state.editGame} editError={state.editError}
          onError={recover} onStart={() => setNotice('')} onSaved={(text) => {
            setNotice(text)
            callbacks.current.onChanged?.()
            refresh()
          }} />}
      </section>
    </div>
    {access === 'checking' && <p role="status">Checking group access…</p>}
    {access === 'error' && <div>
      <Alert severity="error">Group access could not be verified. Refresh games or members to try again.</Alert>
      <button type="button" onClick={() => leave(refresh)}>Refresh group access</button>
    </div>}
    <Box className="legacy-view" sx={{ bgcolor: '#fff', borderRadius: 2, px: 2, pb: 2 }} role="tabpanel" id="group-panel-statistics" aria-labelledby="group-tab-statistics" hidden={tab !== 'statistics'} tabIndex={0}>
      {statisticsVisited && access === 'confirmed' && (statisticsBlocked ? <div>
        <p role="status">Group access is confirmed. Refresh statistics to review server state before trying again.</p>
        <button type="button" className="secondary" onClick={() => setStatisticsBlocked(false)}>Refresh statistics</button>
      </div> : <GroupStatistics key={statisticsRevision} groupId={id} onAccessError={recover} sort={statisticsSort} onSort={setStatisticsSort} />)}
    </Box>
  </>
}

type ContentProps = {
  group: GroupDetails
  games: Game[]
  initialEditor?: Game
  editError?: string
  onError: (error: unknown) => void
  onStart: () => void
  onSaved: (message: string) => void
}

function GameContent({ group, games, initialEditor, editError, onError, onStart, onSaved }: ContentProps) {
  const [editor, setEditor] = useState<Game | 'new' | null>(initialEditor ?? null)
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState('')
  const pending = useRef(false)
  const closing = useRef(false)
  const alive = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; controller.current?.abort() }
  }, [])
  useEffect(() => {
    controller.current = new AbortController()
    return () => { controller.current?.abort() }
  }, [editor])
  useEffect(() => {
    if (!editor && restoreFocus.current) {
      trigger.current?.focus()
      restoreFocus.current = false
    }
  }, [editor])

  async function write(input: GameInput) {
    if (pending.current || !editor) return
    pending.current = true
    setBusy(true)
    setWriteError('')
    const signal = controller.current!.signal
    try {
      await saveGame(group.id, input, editor === 'new' ? undefined : editor.id, signal)
      if (!alive.current || signal.aborted) return
      onSaved(editor === 'new' ? 'Game recorded.' : 'Game updated.')
    } catch (error) {
      if (!alive.current || signal.aborted) return
      if (error instanceof ApiError && error.status === 400) {
        setWriteError(`Der Server hat die Angaben abgelehnt. Bitte Spieler, Decks und Ergebnis prüfen und korrigieren. ${message(error)}`)
      } else onError(error)
    } finally {
      if (alive.current && !signal.aborted) { pending.current = false; setBusy(false) }
    }
  }

  return <Stack sx={{ gap: 2, minWidth: 0 }}>
    {!editor && <Button variant="contained" ref={trigger} sx={{ alignSelf: 'flex-start', minHeight: 48 }} onClick={() => {
      onStart(); closing.current = false; setWriteError(''); setEditor('new')
    }}>Spiel erfassen</Button>}
    {editError && <Typography role="alert">{editError}</Typography>}
    {editor && <GameEditor group={group} game={editor === 'new' ? null : editor} busy={busy} writeError={writeError}
      onSubmit={write} onCancel={() => {
        if (closing.current) return
        closing.current = true
        const wasPending = pending.current
        controller.current?.abort(); pending.current = false; setBusy(false)
        restoreFocus.current = true; setWriteError(''); setEditor(null)
        if (wasPending) onError(new Error('Der abgebrochene Speichervorgang könnte den Server bereits erreicht haben. Bitte den aktuellen Spielverlauf prüfen.'))
      }} onAccessError={onError} />}
    {!editor && <>
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
    </>}
  </Stack>
}
