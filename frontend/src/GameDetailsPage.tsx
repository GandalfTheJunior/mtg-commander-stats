import { FullCardView } from './FullCardView'
import { ManaBoxLink } from './ManaBoxLink'
import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Popover, Stack, Typography } from '@mui/material'
import { ApiError, deleteGame, getGame, getGroup, type CurrentUser, type Game, type GroupDetails } from './api'
import type { Notice } from './App'
import { colorNames } from './deckColors'
import { groupUnavailable, groupUrl } from './groupNavigation'
import { gameSummary, mayManageGame, publicName, recordedTime, sameId } from './gamePresentation'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uncertainDelete = 'Die Löschung wurde nicht bestätigt; der Ausgang kann ungewiss sein (Berechtigung, CSRF oder Übertragungsfehler). Prüfe den frisch geladenen Serverstand vor einem weiteren Versuch. Es wird nichts automatisch erneut gelöscht.'
type State = { status: 'checking' | 'error' | 'missing' } | { status: 'ready'; group: GroupDetails; game: Game }

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
      if (current()) setState({ status: 'missing' })
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
      void Promise.resolve().then(() => { if (!controller.signal.aborted) setState({ status: 'missing' }) })
    } else void Promise.resolve().then(() => { if (!controller.signal.aborted) void load(controller.signal) })
    // The signal fences successes AND errors from transports ignoring abort,
    // including a retired 401 and CSRF preparation before a DELETE is sent.
    return () => { controller.abort(); request.current?.abort() }
  }, [groupId, gameId, load])
  useEffect(() => { if (state.status === 'ready') heading.current?.focus() }, [state])
  useEffect(() => {
    const refresh = () => {
      if (pending.current || !validId.test(groupId) || !validId.test(gameId)) return
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setConfirm(false)
      setState({ status: 'checking' })
      void load(controller.signal)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [groupId, gameId, load])

  function retry() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ status: 'checking' })
    setConfirm(false)
    void load(controller.signal)
  }

  async function remove() {
    if (pending.current || !confirm || state.status !== 'ready' || !mayManageGame(state.group, state.game, currentUser.id)) return
    pending.current = true
    setBusy(true)
    cancelled.current = false
    setConfirm(false)
    setState({ status: 'checking' })
    const signal = request.current!.signal
    try {
      await deleteGame(groupId, gameId, signal)
      if (signal.aborted) return
      callbacks.current.onNotice({ kind: 'success', message: 'Spiel gelöscht. Die bisherige Decknutzung bleibt erhalten.' })
      void callbacks.current.navigate(groupUrl(groupId, 'games'), { replace: true, state: null })
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
  const participants = ready ? [...ready.game.participants].sort((a, b) => a.startPosition - b.startPosition) : []
  return <Stack component="section" aria-label="Spieldetails" sx={{ gap: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
    <Button component={Link} to={groupUrl(groupId, 'games')} color="secondary" sx={{ alignSelf: 'flex-start' }}>Zur Spielehistorie</Button>
    {notice && <Alert severity="warning" role="status">{notice}</Alert>}
    {state.status === 'missing' && <Typography role="status">Spiel nicht mehr verfügbar</Typography>}
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
      </Stack>
      <Box>
        <Typography>{ready.game.playedOn ? <>Gespielt am <time dateTime={ready.game.playedOn}>{ready.game.playedOn.split('-').reverse().join('.')}</time></> : 'Spieldatum unbekannt'}</Typography>
        {ready.game.result === 'DRAW' && <Typography sx={{ mt: 1, color: 'text.secondary' }}>Unentschieden</Typography>}
      </Box>
      <Stack component="ol" aria-label="Teilnehmende und Decks" sx={{ listStyle: 'none', m: 0, p: 0, gap: 2 }}>
        {participants.map(person => {
          const isWinner = ready.game.result === 'WIN' && sameId(person.userId, ready.game.winnerUserId ?? '')
          const accent = ready.game.alternateWinCon ? 'info.main' : 'secondary.main'
          return <Card component="li" key={person.userId} sx={{
            minWidth: 0, p: 1.5, border: '2px solid', borderColor: isWinner ? accent : 'divider',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
              <Box aria-label="Gespeicherte Kartenillustrationen" sx={{ position: 'relative', flexShrink: 0,
                width: person.deck.commanders.length === 2 ? { xs: 92, sm: 136 } : { xs: 56, sm: 80 },
                pb: person.deck.companion ? '44px' : 0 }}>
                {person.deck.companion && <Box sx={{ position: 'absolute', bottom: 0, left: '25%', width: { xs: 44, sm: 56 }, height: { xs: 64, sm: 80 }, zIndex: 0,
                  '& img, & [role="img"]': { width: { xs: 32, sm: 48 }, height: { xs: 48, sm: 64 }, borderRadius: 1 } }}>
                  <FullCardView card={person.deck.companion} artwork compact preload="immediate" />
                </Box>}
                <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${person.deck.commanders.length}, minmax(0, 1fr))`, gap: 0.5, position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
                  {person.deck.commanders.map(commander => <Box key={`${person.deckId}:${commander.oracleId}:${commander.position}`} sx={{ height: { xs: 72, sm: 96 }, minWidth: 0, borderRadius: 1, overflow: 'hidden', pointerEvents: 'auto' }}>
                    <FullCardView card={commander} artwork compact preload="immediate" />
                  </Box>)}
                </Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 0.5 }}>
                  <Typography component="h3" variant="h6" sx={{ flex: 1, minWidth: 0 }}>{publicName(person, people)}</Typography>
                  {isWinner && <InformationIcon label={ready.game.alternateWinCon ? 'Alternative Siegbedingung' : 'Normaler Sieg'} symbol="✦" trophy={!ready.game.alternateWinCon} color={accent} />}
                </Stack>
                {person.deck.commanders.map((commander, index) => <Typography key={commander.position} sx={{ fontWeight: 600 }}>
                  {commander.name}{index === 0 && person.deck.companion && <InformationIcon label="Companion anzeigen" content={person.deck.companion.name} symbol="Ⓒ" />}
                </Typography>)}
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {person.deck.name}<ManaBoxLink url={person.deck.manaBoxUrl} deckName={person.deck.name} compact />
                </Typography>
              </Box>
            </Box>
            <Stack direction="row" sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Startplatz {person.startPosition}</Typography>
              {ready.game.result === 'WIN' && person.placement !== null && <Typography variant="body2" sx={{ fontWeight: 700 }}>Platz {person.placement}</Typography>}
            </Stack>
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
              {person.stillInGame === null ? 'Überlebensstatus unbekannt' : person.stillInGame ? 'Noch im Spiel' : 'Ausgeschieden'}
              {!ready.group.members.some(member => sameId(member.userId, person.userId)) && ' · Ehemaliges Mitglied'}
              {person.deck.archived && ' · Archiviertes Deck'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Farbidentität: {person.deck.colorIdentity.length ? person.deck.colorIdentity.map(color => `${color} (${colorNames[color]})`).join(' · ') : 'Farblos'}</Typography>
          </Card>
        })}
      </Stack>
      <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider', color: 'text.secondary' }}>
        <Typography variant="body2">Erfasst am <time dateTime={ready.game.recordedAt}>{recordedTime(ready.game)}</time></Typography>
        <Typography variant="body2">Ersteller: {creator ? publicName(creator, people) : ready.game.creatorId}</Typography>
        <Typography variant="body2">Spielkennung: {ready.game.id}</Typography>
      </Box>
      {allowed && <Stack direction="row" sx={{ gap: 1, '& > button': { flex: 1, minWidth: 0 } }}>
        <Button variant="contained" disabled={busy} onClick={() => callbacks.current.onEdit(ready.group.id, ready.game.id)}>Spiel bearbeiten</Button>
        <Button ref={trigger} variant="outlined" color="error" disabled={busy} onClick={() => { cancelled.current = true; setConfirm(true) }}>Spiel löschen</Button>
      </Stack>}
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

function InformationIcon({ label, content = label, symbol, color = 'text.secondary', trophy = false }: {
  label: string; content?: string; symbol: string; color?: string; trophy?: boolean
}) {
  const id = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return <>
    <IconButton aria-label={label} aria-haspopup="dialog" aria-expanded={Boolean(anchor)} aria-controls={anchor ? id : undefined}
      onClick={event => setAnchor(event.currentTarget)} sx={{ color, width: 44, height: 44, verticalAlign: 'middle',
        '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
      {trophy ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 15v6m-4 0h8" /></svg> : <span aria-hidden="true">{symbol}</span>}
    </IconButton>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
      <Box role="dialog" id={id} aria-label={label} sx={{ p: 1.5, maxWidth: 280, overflowWrap: 'anywhere' }}>
        <Typography>{content}</Typography>
        <Button onClick={() => setAnchor(null)}>Schließen</Button>
      </Box>
    </Popover>
  </>
}
