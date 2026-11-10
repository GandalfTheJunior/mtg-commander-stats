import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { ApiError, getGame, getGroup, saveGame, type Game, type GameInput, type GroupDetails } from './api'
import GameEditor from './GameEditor'
import type { Notice } from './App'
import { groupUnavailable, groupUrl } from './groupNavigation'
import { gameUrl, mayManageGame } from './gamePresentation'
import type { CurrentUser } from './api'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function GameEditorPage({ currentUser, onUnauthorized, onNotice }: {
  currentUser: CurrentUser
  onUnauthorized: () => void
  onNotice: (notice: Notice) => void
}) {
  const { groupId = '', gameId } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState<GroupDetails | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [writeError, setWriteError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const callbacks = useRef({ onUnauthorized, onNotice, navigate })
  useEffect(() => { callbacks.current = { onUnauthorized, onNotice, navigate } })
  const accessLost = useCallback(() => {
    setGroup(null)
    setGame(null)
    callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
    void callbacks.current.navigate('/playgroups', { replace: true, state: null })
  }, [])
  const failed = useCallback(async (error: unknown, signal: AbortSignal) => {
    if (signal.aborted) return
    if (error instanceof ApiError && error.status === 401) { callbacks.current.onUnauthorized(); return }
    if (error instanceof ApiError && error.status === 404 && !gameId) { accessLost(); return }
    if (error instanceof ApiError && error.status === 403) {
      try { await getGroup(groupId, signal) }
      catch (checkError) {
        if (signal.aborted) return
        if (checkError instanceof ApiError && [403, 404].includes(checkError.status)) { accessLost(); return }
        if (checkError instanceof ApiError && checkError.status === 401) { callbacks.current.onUnauthorized(); return }
      }
    }
    if (!signal.aborted) {
      setGroup(null)
      setGame(null)
      setStatus('error')
    }
  }, [groupId, gameId, accessLost])
  useEffect(() => {
    const request = new AbortController()
    controller.current = request
    async function load() {
      if (!validId.test(groupId) || (gameId && !validId.test(gameId))) { accessLost(); return }
      let freshGroup: GroupDetails
      try {
        freshGroup = await getGroup(groupId, request.signal)
      } catch (error) {
        if (!request.signal.aborted && error instanceof ApiError && [403, 404].includes(error.status)) accessLost()
        else await failed(error, request.signal)
        return
      }
      try {
        if (request.signal.aborted) return
        const freshGame = gameId ? await getGame(groupId, gameId, request.signal) : null
        if (request.signal.aborted) return
        if (freshGame && !mayManageGame(freshGroup, freshGame, currentUser.id)) {
          setStatus('denied')
          return
        }
        setGroup(freshGroup)
        setGame(freshGame)
        setStatus('ready')
      } catch (error) { await failed(error, request.signal) }
    }
    void load()
    return () => request.abort()
  }, [groupId, gameId, revision, accessLost, failed, currentUser.id])

  // The child's layout effect releases its guard only after an acknowledged save.
  // Navigate after that commit so ordinary links and POP never bypass dirty drafts.
  useEffect(() => {
    if (!completed) return
    callbacks.current.onNotice({ kind: 'success', message: 'Spiel erfolgreich gespeichert.' })
    void callbacks.current.navigate(groupUrl(groupId, 'games'), { replace: true, state: null })
  }, [completed, groupId])

  async function write(input: GameInput) {
    const signal = controller.current?.signal
    if (!group || !signal || signal.aborted || busy) return
    setBusy(true)
    setWriteError('')
    try {
      await saveGame(groupId, input, gameId, signal)
      if (signal.aborted) return
      setCompleted(true)
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof ApiError && error.status === 401) callbacks.current.onUnauthorized()
      else if (error instanceof ApiError && error.status === 403) await failed(error, signal)
      else setWriteError(error instanceof ApiError && error.status === 400
        ? 'Der Server hat die Angaben abgelehnt. Bitte Eingaben prüfen.'
        : 'Der Speichervorgang wurde nicht bestätigt und könnte bereits gespeichert worden sein. Prüfe die Spielehistorie vor einem erneuten Versuch.')
    } finally { if (!signal.aborted) setBusy(false) }
  }
  return <Stack component="section" sx={{ gap: 2 }}>
    <Button component={Link} to={gameId ? gameUrl(groupId, gameId) : groupUrl(groupId, 'games')} sx={{ alignSelf: 'flex-start' }}>
      {gameId ? 'Zurück zum Spiel' : 'Zur Spielehistorie'}
    </Button>
    {status === 'denied' && <Alert severity="warning">Dieses Spiel kann nicht bearbeitet werden.</Alert>}
    {status === 'loading' && <Typography role="status">Gruppenberechtigung wird geprüft…</Typography>}
    {status === 'error' && <><Alert severity="error">Die Berechtigung oder das Spiel konnte nicht geprüft werden.</Alert>
      <Button onClick={() => { setStatus('loading'); setRevision(value => value + 1) }}>Erneut versuchen</Button></>}
    {status === 'ready' && group && <GameEditor group={group} game={game} busy={busy} completed={completed} writeError={writeError}
      onSubmit={input => { void write(input) }} onCancel={() => { void navigate(groupUrl(groupId, 'games')) }}
      onAccessError={error => { const signal = controller.current?.signal; if (signal) void failed(error, signal) }} />}
  </Stack>
}
