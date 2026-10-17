import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Menu, MenuItem, Stack, Typography } from '@mui/material'
import { ApiError, deleteGame, getGame, getGroup, type CurrentUser, type Game, type GroupDetails } from './api'
import type { Notice } from './App'
import { colorNames } from './deckColors'
import { groupUnavailable, groupUrl } from './groupNavigation'
import { gameSummary, gameUnavailable, mayManageGame, publicName, recordedTime, sameId } from './gamePresentation'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uncertainDelete = 'Die Löschung wurde nicht bestätigt; der Ausgang kann ungewiss sein (Berechtigung, CSRF oder Übertragungsfehler). Prüfe den frisch geladenen Serverstand vor einem weiteren Versuch. Es wird nichts automatisch erneut gelöscht.'
type State = { status: 'checking' | 'error' } | { status: 'ready'; group: GroupDetails; game: Game }

export default function GameDetailsPage({ currentUser, onUnauthorized, onNotice, onEdit }: {
  currentUser: CurrentUser
  onUnauthorized: () => void
  onNotice: (notice: Notice) => void
  onEdit: (groupId: string, gameId: string) => void
}) {
  const { groupId = '', gameId = '' } = useParams()
  const navigate = useNavigate()
  const callbacks = useRef({ onUnauthorized, onNotice, onEdit, navigate })
  useLayoutEffect(() => { callbacks.current = { onUnauthorized, onNotice, onEdit, navigate } })
  const [state, setState] = useState<State>({ status: 'checking' })
  const [notice, setNotice] = useState('')
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const request = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)

  const load = useCallback(async (signal: AbortSignal) => {
    const current = () => !signal.aborted
    const unavailableGroup = () => {
      callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
      void callbacks.current.navigate('/playgroups', { replace: true, state: null })
    }
    const unavailableGame = () => {
      callbacks.current.onNotice({ kind: 'error', message: gameUnavailable })
      void callbacks.current.navigate(groupUrl(groupId), { replace: true, state: null })
    }
    const groupError = (error: unknown) => {
      if (!current()) return
      if (error instanceof ApiError && error.status === 401) callbacks.current.onUnauthorized()
      else if (error instanceof ApiError && [400, 403, 404].includes(error.status)) unavailableGroup()
      else setState({ status: 'error' })
    }
    let group: GroupDetails
    try { group = await getGroup(groupId, signal) }
    catch (error) { groupError(error); return }
    if (!current()) return
    try {
      const game = await getGame(groupId, gameId, signal)
      if (current()) setState({ status: 'ready', group, game })
    } catch (error) {
      if (!current()) return
      if (error instanceof ApiError && error.status === 401) { callbacks.current.onUnauthorized(); return }
      if (error instanceof ApiError && [403, 404].includes(error.status)) {
        // A game denial cannot establish membership loss. Even a 404 may be a
        // disappeared group; distinguish it using a fresh safe membership read.
        try { await getGroup(groupId, signal) }
        catch (accessError) { groupError(accessError); return }
        if (!current()) return
        if (error.status === 404) { unavailableGame(); return }
      }
      setState({ status: 'error' })
    }
  }, [groupId, gameId])

  useLayoutEffect(() => {
    const controller = new AbortController()
    request.current = controller
    if (!validId.test(groupId)) {
      callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
      void callbacks.current.navigate('/playgroups', { replace: true, state: null })
    } else if (!validId.test(gameId)) {
      callbacks.current.onNotice({ kind: 'error', message: gameUnavailable })
      void callbacks.current.navigate(groupUrl(groupId), { replace: true, state: null })
    } else void Promise.resolve().then(() => { if (!controller.signal.aborted) void load(controller.signal) })
    // The signal fences successes AND errors from transports ignoring abort,
    // including a retired 401 and CSRF preparation before a DELETE is sent.
    return () => { controller.abort(); request.current?.abort() }
  }, [groupId, gameId, load])
  useEffect(() => { if (state.status === 'ready') heading.current?.focus() }, [state])

  function retry() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ status: 'checking' })
    setMenu(null)
    setConfirm(false)
    void load(controller.signal)
  }

  async function remove() {
    if (pending.current || !confirm || state.status !== 'ready' || !mayManageGame(state.group, state.game, currentUser.id)) return
    pending.current = true
    setBusy(true)
    cancelled.current = false
    setConfirm(false)
    setMenu(null)
    setState({ status: 'checking' })
    const signal = request.current!.signal
    try {
      await deleteGame(groupId, gameId, signal)
      if (signal.aborted) return
      callbacks.current.onNotice({ kind: 'success', message: 'Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.' })
      void callbacks.current.navigate(groupUrl(groupId), { replace: true, state: null })
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof ApiError && error.status === 401) callbacks.current.onUnauthorized()
      else {
        setNotice(uncertainDelete)
        // Never repeat a write. Read current membership and the game, including
        // the possibly committed/deleted case, before restoring any private UI.
        await load(signal)
      }
    } finally {
      if (!signal.aborted) { pending.current = false; setBusy(false) }
    }
  }

  const ready = state.status === 'ready' ? state : null
  const allowed = ready && mayManageGame(ready.group, ready.game, currentUser.id)
  const people = ready ? [...ready.game.participants, ...ready.group.members.filter(member => !ready.game.participants.some(person => sameId(person.userId, member.userId)))] : []
  const creator = ready && people.find(person => sameId(person.userId, ready.game.creatorId))
  const winner = ready?.game.participants.find(person => person.userId === ready.game.winnerUserId)
  return <Stack component="section" aria-label="Spieldetails" sx={{ gap: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
    <Button component={Link} to={groupUrl(groupId)} color="secondary" sx={{ alignSelf: 'flex-start' }}>Zurück zu Spiele</Button>
    {notice && <Alert severity="warning" role="status">{notice}</Alert>}
    {state.status === 'checking' && <Typography role="status">{busy ? 'Löschung und Serverstand werden geprüft…' : 'Gruppenberechtigung und Spiel werden geprüft…'}</Typography>}
    {state.status === 'error' && <>
      <Alert severity="error">Gruppenberechtigung oder Spieldaten konnten nicht sicher bestätigt werden. Private Spieldetails bleiben verborgen.</Alert>
      <Button onClick={retry} disabled={busy}>Spieldetails erneut prüfen</Button>
    </>}
    {ready && <>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h2" variant="h4" ref={heading} tabIndex={-1} sx={{ '&:focus': { outline: '2px solid', outlineColor: 'interaction.focus', outlineOffset: 3 } }}>Spieldetails</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{ready.group.name}</Typography>
        </Box>
        {allowed && <IconButton ref={trigger} aria-label="Spielaktionen" aria-haspopup="menu" aria-controls={menu ? 'game-actions' : undefined} aria-expanded={Boolean(menu)}
          disabled={busy} onClick={event => setMenu(event.currentTarget)} sx={{ minWidth: 48, minHeight: 48, '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>⋮</IconButton>}
      </Stack>
      <Card component="article" aria-label={`Game ${ready.game.id}`} sx={{ p: 2, minWidth: 0 }}>
        <Typography component="h3" variant="h5">{ready.game.result === 'WIN' ? 'Sieg' : 'Unentschieden'}</Typography>
        {winner && <Typography sx={{ mt: 1 }}>Gewonnen: {publicName(winner, people)} · {winner.deck.name}</Typography>}
        <Typography sx={{ mt: 1 }}>Erfasst am <time dateTime={ready.game.recordedAt}>{recordedTime(ready.game)}</time></Typography>
        <Typography>Ersteller: {creator ? publicName(creator, people) : ready.game.creatorId}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Spielkennung: {ready.game.id}</Typography>
      </Card>
      <Typography component="h3" variant="h6">Teilnehmende ({ready.game.participants.length})</Typography>
      <Stack component="ol" aria-label="Teilnehmende und Decks" sx={{ listStyle: 'none', m: 0, p: 0, gap: 2 }}>
        {ready.game.participants.map(person => <Card component="li" key={person.userId} sx={{ p: 2, minWidth: 0 }}>
          <Typography component="h4" variant="h6">{publicName(person, people)}{person.userId === ready.game.winnerUserId && ' · Sieg'}</Typography>
          {!ready.group.members.some(member => sameId(member.userId, person.userId)) && <Typography sx={{ color: 'text.secondary' }}>Ehemaliges Mitglied</Typography>}
          <Typography sx={{ mt: 1, fontWeight: 600 }}>{person.deck.name}</Typography>
          <Typography>Commander: {person.deck.commander}</Typography>
          <Typography>Farbidentität: {person.deck.colorIdentity.length ? person.deck.colorIdentity.map(color => `${color} (${colorNames[color]})`).join(' · ') : 'Farblos'}</Typography>
          {person.deck.archived && <Typography sx={{ color: 'text.secondary' }}>Archiviertes Deck</Typography>}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Deckkennung: {person.deckId}</Typography>
        </Card>)}
      </Stack>
      {allowed && <Menu id="game-actions" anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} slotProps={{ list: { 'aria-label': 'Spielaktionen', sx: { '& .MuiMenuItem-root': { minHeight: 48, whiteSpace: 'normal', '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } } } } }}>
        <MenuItem onClick={() => { setMenu(null); callbacks.current.onEdit(ready.group.id, ready.game.id) }}>Bearbeiten</MenuItem>
        <MenuItem onClick={() => { setMenu(null); cancelled.current = true; setConfirm(true) }}>Löschen</MenuItem>
      </Menu>}
    </>}
    <Dialog open={confirm && Boolean(allowed)} onClose={() => setConfirm(false)} aria-labelledby="delete-game-title"
      slotProps={{ transition: { onEntered: () => cancel.current?.focus(), onExited: () => { if (cancelled.current) trigger.current?.focus() } } }}>
      <DialogTitle id="delete-game-title">Spiel endgültig löschen?</DialogTitle>
      <DialogContent><DialogContentText sx={{ overflowWrap: 'anywhere' }}>
        {ready && <>{gameSummary(ready.game)} · Erfasst am {recordedTime(ready.game)} · Spielkennung {ready.game.id}. </>}
        Die Löschung ist endgültig. Die bisherige Decknutzung wird nicht zurückgesetzt.
      </DialogContentText></DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button ref={cancel} autoFocus onClick={() => setConfirm(false)}>Abbrechen</Button>
        <Button color="error" disabled={busy} onClick={() => { void remove() }}>Endgültig löschen</Button>
      </DialogActions>
    </Dialog>
  </Stack>
}
