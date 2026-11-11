import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Alert, Box, Button, Card, CardActionArea, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, IconButton, List, ListItemButton, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import {
  ApiError, commanderNames, createDeck, createQuickProfile, createQuickProfileDeck, listDecks, listQuickProfileDecks, memberDecks,
  type Deck, type DeckSelection, type Game, type GameInput, type GroupDetails, type GroupMember,
} from './api'
import { CommanderArtwork } from './CommanderArtwork'
import { DeckForm, type DeckFormContext } from './DeckEditor'
import { EditorGuard, EditorLeave, useEditorGuard, type EditorGuardOptions } from './editorGuard'
import {
  checkOutcome, gameMode, localToday, outcomeFields, outcomeValue, savedOutcome, withOutcome,
  type OutcomeDraft, type OutcomeMode, type OutcomeValue,
} from './gameOutcome'
import { publicName, sameId } from './gamePresentation'

type Assignment = { key: number; userId: string; deckId: string; expanded: boolean; added?: boolean; outcome: OutcomeDraft }
type Choice = { status: 'loading' | 'ready' | 'error'; decks: DeckSelection[]; error?: string }
type Picker = { kind: 'member' | 'deck'; key: number }
type Props = {
  group: GroupDetails
  game: Game | null
  currentUserId: string
  /** One-use "Noch ein Spiel – gleiche Spieler" handoff: member IDs only. */
  initialMembers?: string[]
  busy: boolean
  completed?: boolean
  writeError?: string
  onSubmit: (input: GameInput) => void
  onAccessError: (error: unknown) => void
}

const MAX_PLAYERS = 6
const DEFAULT_SLOTS = 4
const focusOutline = { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 }

// One lifetime per selected active member. A slow or failed request cannot hold
// other cards hostage, overwrite a replacement member, or expire a later session.
function DeckLoader({ groupId, userId, onLoaded, onAccessError }: {
  groupId: string; userId: string; onLoaded: (id: string, choice: Choice) => void; onAccessError: (error: unknown) => void
}) {
  const callbacks = useRef({ onLoaded, onAccessError })
  useLayoutEffect(() => { callbacks.current = { onLoaded, onAccessError } })
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    callbacks.current.onLoaded(userId, { status: 'loading', decks: [] })
    memberDecks(groupId, userId, controller.signal).then(decks => {
      if (active) callbacks.current.onLoaded(userId, { status: 'ready', decks })
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) callbacks.current.onAccessError(error)
      else callbacks.current.onLoaded(userId, { status: 'error', decks: [], error: error instanceof Error ? error.message : 'Decks konnten nicht geladen werden.' })
    })
    return () => { active = false; controller.abort() }
  }, [groupId, userId])
  return null
}

// Inactive cached results, seats, date and mode all count; expansion does not.
const material = (rows: Assignment[], mode: OutcomeMode, playedOn: string | null) => JSON.stringify({
  participants: rows.filter(row => row.userId || row.deckId).map(({ userId, deckId, outcome }) => ({ userId, deckId, outcome })), mode, playedOn,
})

function initialRows(game: Game | null, initialMembers: string[] | undefined, members: GroupMember[]): Assignment[] {
  if (game) {
    return game.participants.toSorted((a, b) => a.startPosition - b.startPosition)
      .map((p, key) => ({ key, userId: p.userId, deckId: p.deckId, expanded: false, outcome: savedOutcome(game, p) }))
  }
  // Only the people carry over: roster order deliberately discards the previous seats.
  const repeated = members.filter(member => (initialMembers ?? []).some(id => sameId(id, member.userId))).map(member => member.userId).slice(0, MAX_PLAYERS)
  const rows: Assignment[] = repeated.map((userId, key) => ({ key, userId, deckId: '', expanded: true, outcome: {} }))
  while (rows.length < DEFAULT_SLOTS) rows.push({ key: rows.length, userId: '', deckId: '', expanded: false, outcome: {} })
  return rows
}

export default function GameEditor({ group, game, currentUserId, initialMembers, busy, completed = false, writeError, onSubmit, onAccessError }: Props) {
  const [addedMembers, setAddedMembers] = useState<GroupMember[]>([])
  const members = [...group.members, ...addedMembers.filter(added => !group.members.some(member => sameId(member.userId, added.userId)))]
  const [rows, setRows] = useState<Assignment[]>(() => initialRows(game, initialMembers, group.members))
  const rowsRef = useRef(rows)
  useLayoutEffect(() => { rowsRef.current = rows })
  const nextKey = useRef(rows.length)
  const focusNext = useRef<string | null>(null)
  const [mode, setMode] = useState<OutcomeMode>(gameMode(game))
  const [lastWinMode, setLastWinMode] = useState<Exclude<OutcomeMode, 'DRAW'>>(gameMode(game) === 'ALTERNATE' ? 'ALTERNATE' : 'WIN')
  // New entries start on the user's local calendar day; edits keep the stored value, including unknown.
  const [playedOn, setPlayedOn] = useState<string | null>(() => game ? game.playedOn : localToday())
  const [baseline] = useState(() => material(game ? rows : [], mode, playedOn))
  const [attempts, setAttempts] = useState(0)
  const attempted = attempts > 0
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [retries, setRetries] = useState<Record<string, number>>({})
  // Decks created in this editor stay selectable even while the member's list reloads.
  const [createdDecks, setCreatedDecks] = useState<Record<string, DeckSelection[]>>({})
  const [picker, setPicker] = useState<Picker | null>(null)
  const [nested, setNested] = useState<{ key: number; userId: string } | null>(null)
  const [nestedGuard, setNestedGuard] = useState({ blocked: false, pending: false })
  const [profile, setProfile] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' })
  const [confirmPartial, setConfirmPartial] = useState(false)
  const [movement, setMovement] = useState('')
  const dragKey = useRef<number | null>(null)
  const dragMoved = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const profileOperation = useRef<object | null>(null)
  useLayoutEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  // A pending quick-profile POST is an unacknowledged write: protect navigation like a save.
  useEditorGuard(!completed && (material(rows, mode, playedOn) !== baseline || busy || nestedGuard.blocked || profile.busy), busy || nestedGuard.pending || profile.busy)
  useLayoutEffect(() => {
    if (focusNext.current) {
      document.getElementById(focusNext.current)?.focus()
      focusNext.current = null
    }
  })
  useLayoutEffect(() => { if (writeError) document.getElementById('game-write-error')?.focus() }, [writeError])
  const loaded = useCallback((userId: string, choice: Choice) => setChoices(previous => ({ ...previous, [userId]: choice })), [])
  // The nested deck editor reports its own dirty/pending state; the match guard covers both.
  const nestedBlocked = useRef(false)
  const nestedRegister = useCallback((blocked: boolean, pending = false, _options?: EditorGuardOptions) => {
    void _options
    nestedBlocked.current = blocked
    setNestedGuard(current => current.blocked === blocked && current.pending === pending ? current : { blocked, pending })
    return () => { nestedBlocked.current = false; setNestedGuard({ blocked: false, pending: false }) }
  }, [])
  // Contextual Back/Cancel inside the nested deck form only discards the deck draft,
  // so it asks about that draft alone; the match itself stays in the editor.
  const [nestedLeave, setNestedLeave] = useState<(() => void) | null>(null)
  const askNestedLeave = useCallback((leave: () => void) => {
    if (!nestedBlocked.current) leave()
    else setNestedLeave(() => leave)
  }, [])

  const original = (userId: string) => game?.participants.find(p => sameId(p.userId, userId))
  const member = (userId: string) => members.find(candidate => sameId(candidate.userId, userId))
  const active = (userId: string) => Boolean(member(userId))
  const people = [...members, ...(game?.participants.filter(p => !active(p.userId)) ?? [])]
  function label(userId: string) {
    const person = member(userId) ?? original(userId)
    return person ? publicName(person, people) : 'Spieler auswählen'
  }
  function decks(row: Assignment): DeckSelection[] {
    const previous = original(row.userId)
    const loaded = active(row.userId) ? choices[row.userId]?.decks ?? [] : []
    const created = active(row.userId) ? (createdDecks[row.userId] ?? []).filter(deck => !loaded.some(other => sameId(other.id, deck.id))) : []
    const fresh = [...loaded, ...created]
    return previous ? [previous.deck, ...fresh.filter(deck => !sameId(deck.id, previous.deckId))] : fresh
  }
  const selectedDeck = (row: Assignment) => row.deckId ? decks(row).find(deck => sameId(deck.id, row.deckId)) : undefined
  const valid = (row: Assignment) => Boolean(row.userId && selectedDeck(row) &&
    rows.filter(other => other.userId && sameId(other.userId, row.userId)).length === 1)
  const mayCreateDeck = (userId: string) => sameId(userId, currentUserId) || Boolean(member(userId)?.quickProfile)
  const update = (key: number, change: (row: Assignment) => Assignment) =>
    setRows(current => current.map(row => row.key === key ? change(row) : row))
  const complete = rows.filter(valid)
  const winMode = mode === 'DRAW' ? null : mode

  function move(key: number, target: number, announce = true) {
    const current = rowsRef.current
    const from = current.findIndex(row => row.key === key)
    if (busy || from < 0 || target < 0 || target >= current.length || from === target) return
    const next = [...current]
    next.splice(target, 0, next.splice(from, 1)[0])
    rowsRef.current = next
    setRows(next)
    if (announce) setMovement(`${label(current[from].userId)} an Position ${target + 1} verschoben.`)
  }
  function remove(key: number) {
    const index = rows.findIndex(row => row.key === key)
    const next = rows.filter(row => row.key !== key)
    const neighbour = next[Math.min(index, next.length - 1)]
    focusNext.current = neighbour ? (neighbour.userId ? `game-${neighbour.key}-toggle` : `game-${neighbour.key}-select`) : 'game-add-player'
    setRows(next)
    setMovement(`${label(rows[index].userId)} aus diesem Spiel entfernt.`)
  }
  function openMemberPicker(key: number) {
    update(key, row => ({ ...row, expanded: true }))
    setProfile(current => current.busy ? current : { busy: false, error: '' })
    setPicker({ kind: 'member', key })
  }
  function closeMemberPicker() {
    const row = rows.find(candidate => candidate.key === picker?.key)
    setPicker(null)
    if (!row) return
    if (!row.userId && row.added) remove(row.key)
    else if (!row.userId) {
      update(row.key, current => ({ ...current, expanded: false }))
      focusNext.current = `game-${row.key}-select`
    } else focusNext.current = `game-${row.key}-member`
  }
  function chooseMember(key: number, userId: string) {
    const row = rows.find(candidate => candidate.key === key)!
    if (sameId(row.userId, userId)) { setPicker({ kind: 'deck', key }); return }
    // Historical membership grants only its exact recorded pair; a new member clears deck and every mode's results.
    const former = !active(userId) ? original(userId) : undefined
    update(key, current => ({ ...current, userId, deckId: former?.deckId ?? '', outcome: {}, expanded: !former, added: false }))
    if (former) { setPicker(null); focusNext.current = `game-${key}-toggle` } else setPicker({ kind: 'deck', key })
  }
  function chooseDeck(key: number, deckId: string) {
    update(key, row => ({ ...row, deckId, expanded: false }))
    setPicker(null)
    focusNext.current = `game-${key}-toggle`
  }
  function closeDeckPicker(key: number) {
    setPicker(null)
    focusNext.current = `game-${key}-deck`
  }
  async function addQuickProfile(key: number) {
    const signal = lifetime.current?.signal
    if (profile.busy || !signal) return
    // The member picker cannot be dismissed while pending; the operation token
    // additionally fences any response that no longer belongs to the open slot.
    const operation = {}
    profileOperation.current = operation
    setProfile({ busy: true, error: '' })
    try {
      const created = await createQuickProfile(group.id, signal)
      if (signal.aborted) return
      // A saved profile always joins the roster, even if its slot was superseded.
      setAddedMembers(current => [...current, created])
      if (profileOperation.current !== operation || !rowsRef.current.some(row => row.key === key && !row.userId)) {
        setProfile({ busy: false, error: '' })
        return
      }
      update(key, row => ({ ...row, userId: created.userId, deckId: '', outcome: {}, expanded: true, added: false }))
      setPicker(null)
      setNested({ key, userId: created.userId })
      setProfile({ busy: false, error: '' })
    } catch (error) {
      if (signal.aborted) return
      if (profileOperation.current === operation) profileOperation.current = null
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onAccessError(error); return }
      setProfile({ busy: false, error: 'Das Schnellprofil wurde nicht bestätigt und könnte bereits gespeichert sein. Prüfe die Mitglieder der Playgroup, bevor du es erneut versuchst.' })
    }
  }
  function finishNestedDeck(created?: Deck) {
    const target = nested
    setNested(null)
    if (!target) return
    if (!created) { setPicker({ kind: 'deck', key: target.key }); return }
    const selection: DeckSelection = { id: created.id, name: created.name, commanders: created.commanders, colorIdentity: created.colorIdentity,
      ...(created.companion !== undefined ? { companion: created.companion } : {}) }
    setCreatedDecks(current => ({ ...current, [target.userId]: [...(current[target.userId] ?? []), selection] }))
    update(target.key, row => ({ ...row, deckId: created.id, expanded: false }))
    focusNext.current = `game-${target.key}-toggle`
  }
  function setResult(key: number, value: OutcomeValue) {
    if (!winMode) return
    setRows(current => current.map(row => row.key === key ? { ...row, outcome: withOutcome(row.outcome, winMode, value) }
      // A new winner leaves the former winner at an unknown rank: never two first places.
      : value === 1 && outcomeValue(row.outcome, winMode) === 1 ? { ...row, outcome: withOutcome(row.outcome, winMode, undefined) } : row))
  }

  const errors = new Map<number, string>()
  for (const row of rows) {
    if (!row.userId && !row.deckId) continue
    if (rows.some(other => other.key !== row.key && other.userId && sameId(other.userId, row.userId))) errors.set(row.key, 'Dieser Spieler ist bereits ausgewählt. Bitte ein anderes Mitglied wählen.')
    else if (!active(row.userId) && !original(row.userId)) errors.set(row.key, 'Bitte ein aktives Gruppenmitglied auswählen.')
    else if (!row.deckId) errors.set(row.key, 'Bitte ein Deck auswählen oder den Spieler entfernen.')
    else if (!selectedDeck(row)) errors.set(row.key, 'Dieses Deck ist nicht verfügbar. Bitte ein gültiges eigenes Deck wählen.')
  }
  const countError = complete.length < 2 || complete.length > MAX_PLAYERS ? 'Bitte 2–6 Spieler mit Deck auswählen. Leere Karten werden nicht gespeichert.' : ''
  const outcome = checkOutcome(complete.map(row => row.outcome), mode)

  function send(winnerOnly: boolean) {
    onSubmit({ playedOn, result: mode === 'DRAW' ? 'DRAW' : 'WIN', alternateWinCon: mode === 'ALTERNATE',
      participants: complete.map(({ userId, deckId, outcome: draft }, index) => ({ userId, deckId, startPosition: index + 1, ...outcomeFields(draft, mode, winnerOnly) })) })
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    // A fresh render on every attempt applies the first-error focus, even when already attempted.
    setAttempts(value => value + 1)
    if (errors.size || countError || outcome.error) {
      const first = rows.find(row => errors.has(row.key))
      if (first) {
        update(first.key, row => ({ ...row, expanded: true }))
        const formerPair = !active(first.userId) && original(first.userId)
        focusNext.current = !formerPair && (!first.deckId || !selectedDeck(first)) ? `game-${first.key}-deck` : `game-${first.key}-member`
      } else focusNext.current = 'game-errors'
      return
    }
    if (outcome.partial) { setConfirmPartial(true); return }
    send(false)
  }
  function saveWinnerOnly() {
    if (!winMode) return
    // Discard every extra rank and, for alternate wins, every opponent status.
    setRows(current => current.map(row => outcomeValue(row.outcome, winMode) === 1 ? row : { ...row, outcome: withOutcome(row.outcome, winMode, undefined) }))
    setConfirmPartial(false)
    send(true)
  }

  if (nested) {
    const name = label(nested.userId)
    const quick = Boolean(member(nested.userId)?.quickProfile)
    const context: DeckFormContext = {
      title: `Deck für ${name} erstellen`,
      create: quick ? (input, signal) => createQuickProfileDeck(group.id, nested.userId, input, signal) : createDeck,
      list: quick ? signal => listQuickProfileDecks(group.id, nested.userId, signal) : listDecks,
      onExit: finishNestedDeck,
    }
    return <Stack sx={{ gap: 2, minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary' }}>Deine Spielangaben bleiben erhalten. Nach dem Erstellen wird das Deck für {name} ausgewählt.</Typography>
      <EditorGuard.Provider value={nestedRegister}>
        <EditorLeave.Provider value={askNestedLeave}>
          <DeckForm context={context} onUnauthorized={() => onAccessError(new ApiError('Session expired.', 401))} />
        </EditorLeave.Provider>
      </EditorGuard.Provider>
      <Dialog open={nestedLeave !== null} onClose={() => setNestedLeave(null)} aria-labelledby="nested-discard-title" aria-describedby="nested-discard-description">
        <DialogTitle id="nested-discard-title">Änderungen verwerfen?</DialogTitle>
        <DialogContent><DialogContentText id="nested-discard-description">
          Das neue Deck wird nicht gespeichert. Deine Spielangaben bleiben erhalten.
        </DialogContentText></DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button autoFocus color="secondary" onClick={() => setNestedLeave(null)}>Im Editor bleiben</Button>
          <Button color="error" disabled={nestedLeave === null} onClick={() => {
            const leave = nestedLeave
            setNestedLeave(null)
            leave?.()
          }}>Verwerfen und zurück</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  }

  const pickerRow = picker ? rows.find(row => row.key === picker.key) : undefined
  const pickerSlot = pickerRow ? rows.indexOf(pickerRow) + 1 : 0
  return <Stack component="form" aria-label={game ? 'Spiel bearbeiten' : 'Spiel erfassen'} onSubmit={submit} noValidate
    sx={{ gap: 2, minWidth: 0, color: 'text.primary', '& .MuiCard-root': { overflowWrap: 'anywhere' },
      '& :focus-visible, & [tabindex="-1"]:focus': focusOutline,
      '& .MuiNativeSelect-select:disabled': { bgcolor: 'action.disabledBackground', opacity: 1 },
      '& .MuiNativeSelect-select:focus-visible': { outline: 'none' },
    }}>
    {[...new Set(rows.map(row => row.userId).filter(id => id && active(id)))].map(userId =>
      <DeckLoader key={`${userId}:${retries[userId] ?? 0}`} groupId={group.id} userId={userId} onLoaded={loaded} onAccessError={onAccessError} />)}
    <Box>
      <Typography variant="overline" component="p" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>Playgroup</Typography>
      <Typography component="p" variant="h6">{group.name}</Typography>
    </Box>
    <Card sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Typography component="label" htmlFor="game-played-on" sx={{ fontWeight: 600 }}>Spieldatum</Typography>
      <Box sx={{ textAlign: 'right' }}>
        <TextField id="game-played-on" type="date" size="small" value={playedOn ?? ''} disabled={busy}
          slotProps={{ htmlInput: { 'aria-describedby': playedOn ? undefined : 'game-played-on-unknown' } }}
          onChange={event => setPlayedOn(event.target.value || null)} sx={{ width: 180, '& input': { minHeight: 32 } }} />
        {!playedOn && <Typography id="game-played-on-unknown" variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Spieldatum unbekannt</Typography>}
      </Box>
    </Card>
    <Card component="fieldset" sx={{ p: 2, m: 0, border: 'none', display: 'grid', gap: 1.5 }}>
      <Typography component="legend" sx={{ fontWeight: 600, float: 'left', mb: 1.5, p: 0 }}>Spielausgang</Typography>
      <ToggleButtonGroup exclusive fullWidth value={mode === 'DRAW' ? 'DRAW' : 'WIN'} disabled={busy} aria-label="Spielausgang"
        onChange={(_event, value: 'WIN' | 'DRAW' | null) => { if (value) setMode(value === 'DRAW' ? 'DRAW' : lastWinMode) }}
        sx={{ clear: 'both', '& .MuiToggleButton-root': { minHeight: 48, px: 1, textTransform: 'none', fontWeight: 600, overflowWrap: 'normal' } }}>
        <ToggleButton value="WIN">Sieg</ToggleButton>
        <ToggleButton value="DRAW">Unentschieden</ToggleButton>
      </ToggleButtonGroup>
      {mode !== 'DRAW' && <FormControlLabel labelPlacement="start" label="Alternative Siegbedingung" disabled={busy}
        sx={{ m: 0, justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider', pt: 1 }}
        control={<Switch checked={mode === 'ALTERNATE'} onChange={event => {
          const next = event.target.checked ? 'ALTERNATE' : 'WIN'
          setMode(next)
          setLastWinMode(next)
        }} />} />}
    </Card>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
      <Typography component="h3" variant="h6">Spieler</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>2–6 Teilnehmer</Typography>
      <Typography id="game-reorder-hint" variant="body2" sx={{ color: 'text.secondary', width: '100%' }}>
        Reihenfolge am Griff links ändern (Pfeiltasten hoch/runter)
      </Typography>
    </Box>
    <Typography role="status" aria-live="polite" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{movement}</Typography>
    {rows.map((row, index) => {
      const deck = selectedDeck(row)
      const done = valid(row)
      const expanded = row.expanded || (Boolean(row.userId) && !done)
      const former = Boolean(row.userId && !active(row.userId) && original(row.userId))
      const seat = complete.indexOf(row) + 1
      const name = label(row.userId)
      const error = attempted ? errors.get(row.key) : undefined
      return <Card component="section" key={row.key} data-seat-key={row.key} aria-label={`Spieler ${index + 1}`} sx={{ minWidth: 0 }}>
        {!row.userId ? <CardActionArea id={`game-${row.key}-select`} disabled={busy} onClick={() => openMemberPicker(row.key)}
          aria-label={`Spieler ${index + 1} auswählen`} sx={{ p: 1.5, display: 'flex', gap: 1.5, justifyContent: 'flex-start', minHeight: 88,
            '&.Mui-focusVisible': { ...focusOutline, outlineOffset: -3 } }}>
          <DeckArtwork />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>Spieler auswählen</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Gruppenmitglied und Deck wählen</Typography>
          </Box>
          <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 24, px: 1 }}>+</Box>
        </CardActionArea> : <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, pl: done ? 0.5 : 1.5 }}>
            {done && <Box component="button" type="button" disabled={busy} aria-label={`${name} verschieben`} aria-describedby="game-reorder-hint"
              sx={{ flexShrink: 0, width: 44, minHeight: 64, border: 0, borderRadius: 1, bgcolor: 'transparent', color: 'text.secondary',
                cursor: busy ? 'default' : 'grab', touchAction: 'none', fontSize: 20, '&:hover': { bgcolor: 'interaction.hover' }, '&:focus-visible': focusOutline }}
              onKeyDown={event => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                event.preventDefault()
                move(row.key, index + (event.key === 'ArrowUp' ? -1 : 1))
              }}
              onPointerDown={event => {
                if (busy || event.button !== 0) return
                dragKey.current = row.key
                dragMoved.current = false
                event.currentTarget.setPointerCapture?.(event.pointerId)
              }}
              onPointerMove={event => {
                if (dragKey.current === null) return
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-seat-key]')
                const targetKey = target ? Number(target.getAttribute('data-seat-key')) : null
                if (targetKey === null || targetKey === dragKey.current) return
                dragMoved.current = true
                // Live movement: the dragged card takes the hovered card's seat immediately.
                move(dragKey.current, rowsRef.current.findIndex(candidate => candidate.key === targetKey), false)
              }}
              onPointerUp={() => {
                const key = dragKey.current
                dragKey.current = null
                if (key === null || !dragMoved.current) return
                const position = rowsRef.current.findIndex(candidate => candidate.key === key)
                setMovement(`${name} an Position ${position + 1} verschoben.`)
              }}
              onPointerCancel={() => { dragKey.current = null }}>
              <span aria-hidden="true">⠿</span>
            </Box>}
            <DeckArtwork deck={deck} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component="h4" sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>{name}</Typography>
              {deck ? <>
                <Typography>{commanderNames(deck)}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{deck.name}</Typography>
              </> : <Typography variant="body2" sx={{ color: 'text.secondary' }}>Noch kein Deck ausgewählt</Typography>}
              {former && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Ehemaliges Mitglied · nur erfasste Zuordnung</Typography>}
              {deck && original(row.userId)?.deckId === row.deckId && original(row.userId)?.deck.archived &&
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Archiviertes Deck · nur erfasste Zuordnung</Typography>}
            </Box>
            {done && <IconButton id={`game-${row.key}-toggle`} disabled={busy} aria-expanded={expanded} aria-controls={`game-${row.key}-details`}
              aria-label={`Spieler ${index + 1} ${expanded ? 'einklappen' : 'bearbeiten'}`} sx={{ width: 48, height: 48, flexShrink: 0 }}
              onClick={() => update(row.key, current => ({ ...current, expanded: !expanded }))}>
              <Chevron up={expanded} />
            </IconButton>}
          </Box>
          {expanded && <Stack id={`game-${row.key}-details`} sx={{ px: 1.5, pb: 1.5, gap: 1 }}>
            {error && <Typography color="error" role="alert" variant="body2">{error}</Typography>}
            <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button id={`game-${row.key}-member`} color="secondary" variant="outlined" disabled={busy} onClick={() => openMemberPicker(row.key)}>Mitglied ändern</Button>
              {!former && <Button id={`game-${row.key}-deck`} color="secondary" variant={deck ? 'outlined' : 'contained'} disabled={busy}
                onClick={() => setPicker({ kind: 'deck', key: row.key })}>{deck ? 'Deck ändern' : 'Deck auswählen'}</Button>}
              {done && <>
                <Button color="secondary" disabled={busy || index === 0} aria-label={`Spieler ${index + 1} nach oben`} onClick={() => move(row.key, index - 1)}>Nach oben</Button>
                <Button color="secondary" disabled={busy || index === rows.length - 1} aria-label={`Spieler ${index + 1} nach unten`} onClick={() => move(row.key, index + 1)}>Nach unten</Button>
              </>}
            </Stack>
            <Button color="inherit" size="small" disabled={busy} sx={{ alignSelf: 'flex-end', color: 'text.secondary' }}
              aria-label={`Spieler ${index + 1} entfernen`} onClick={() => remove(row.key)}>Spieler entfernen</Button>
          </Stack>}
          {done && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mx: 1.5, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>Startplatz {seat}</Typography>
            <ResultControl key={mode} mode={mode} draft={row.outcome} name={name} count={complete.length} busy={busy}
              hasWinner={winMode !== null && complete.some(other => outcomeValue(other.outcome, winMode) === 1)}
              onDraw={value => update(row.key, current => ({ ...current, outcome: { ...current.outcome, draw: value } }))}
              onResult={value => setResult(row.key, value)} />
          </Box>}
        </>}
      </Card>
    })}
    <Button id="game-add-player" variant="outlined" color="secondary" disabled={busy || rows.length >= MAX_PLAYERS} sx={{ minHeight: 56 }}
      onClick={() => {
        const key = nextKey.current++
        setRows(current => [...current, { key, userId: '', deckId: '', expanded: true, added: true, outcome: {} }])
        setProfile({ busy: false, error: '' })
        setPicker({ kind: 'member', key })
      }}><Box component="span" aria-hidden="true" sx={{ mr: 1, fontSize: 22 }}>+</Box>Spieler hinzufügen</Button>
    {writeError && <Alert id="game-write-error" tabIndex={-1} severity="error">{writeError}</Alert>}
    {attempted && (errors.size > 0 || countError || outcome.error) && <Alert id="game-errors" tabIndex={-1} severity="error">
      Bitte die markierten Angaben korrigieren. {countError} {outcome.error}
      {rows.filter(row => errors.has(row.key)).map(row => <Typography key={row.key}>Spieler {rows.indexOf(row) + 1}: {errors.get(row.key)}</Typography>)}
    </Alert>}
    <Box sx={{ pt: 2, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      <Button type="submit" variant="contained" fullWidth disabled={busy} sx={{ minHeight: 56, fontSize: '1.0625rem' }}>
        {busy ? 'Spiel wird gespeichert…' : 'Spiel speichern'}
      </Button>
    </Box>
    {picker?.kind === 'member' && pickerRow && <MemberPicker groupName={group.name} slot={pickerSlot} busy={profile.busy} error={profile.error}
      people={people.filter(person => !rows.some(other => other.key !== pickerRow.key && other.userId && sameId(other.userId, person.userId)))
        .map(person => ({ userId: person.userId, name: label(person.userId),
          kind: member(person.userId)?.quickProfile ? 'Schnellprofil' : !active(person.userId) ? 'Ehemaliges Mitglied · nur erfasste Zuordnung'
            : sameId(person.userId, currentUserId) ? 'Mit Benutzerkonto · Du' : 'Mit Benutzerkonto' }))}
      onClose={closeMemberPicker} onChoose={userId => chooseMember(pickerRow.key, userId)} onCreateProfile={() => { void addQuickProfile(pickerRow.key) }} />}
    {picker?.kind === 'deck' && pickerRow && pickerRow.userId && <DeckPicker name={label(pickerRow.userId)}
      kind={member(pickerRow.userId)?.quickProfile ? 'Schnellprofil' : 'Mit Benutzerkonto'} decks={decks(pickerRow)} selectedId={pickerRow.deckId}
      historicalId={original(pickerRow.userId)?.deckId} status={original(pickerRow.userId) && !active(pickerRow.userId) ? 'ready' : choices[pickerRow.userId]?.status ?? 'loading'}
      error={choices[pickerRow.userId]?.error} mayCreate={mayCreateDeck(pickerRow.userId)}
      onRetry={() => setRetries(values => ({ ...values, [pickerRow.userId]: (values[pickerRow.userId] ?? 0) + 1 }))}
      onClose={() => closeDeckPicker(pickerRow.key)} onChoose={deckId => chooseDeck(pickerRow.key, deckId)}
      onOtherMember={() => setPicker({ kind: 'member', key: pickerRow.key })}
      onCreate={() => { setPicker(null); setNested({ key: pickerRow.key, userId: pickerRow.userId }) }} />}
    <Dialog open={confirmPartial} onClose={() => setConfirmPartial(false)} aria-labelledby="partial-title" aria-describedby="partial-description partial-note" maxWidth="xs" fullWidth>
      <DialogTitle id="partial-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', border: '1px solid', borderColor: 'interaction.border', fontWeight: 700 }}>!</Box>
        Fehlende Platzierungen
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="partial-description" sx={{ color: 'text.primary' }}>Es gibt noch Spieler mit fehlenden Platzierungen. Möchtest du sie noch anpassen?</DialogContentText>
        <Typography id="partial-note" variant="body2" sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: 'background.raised', color: 'text.secondary' }}>
          Ohne Platzierungen speichern verwirft alle weiteren Plätze{mode === 'ALTERNATE' ? ' und Überlebensstatus' : ''}. Der Gewinner bleibt.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 3, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
        <Button variant="contained" autoFocus onClick={() => { setConfirmPartial(false); focusNext.current = null }}>Anpassen</Button>
        <Button variant="outlined" color="secondary" disabled={busy} onClick={saveWinnerOnly}>Spiel ohne Platzierungen speichern</Button>
      </DialogActions>
    </Dialog>
  </Stack>
}

function Chevron({ up }: { up: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    style={{ transform: up ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
}

function Trophy() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 15v6m-4 0h8" /></svg>
}

/** Read-only saved artwork: Commander(s) side by side, a genuine Companion smaller behind. */
function DeckArtwork({ deck }: { deck?: DeckSelection }) {
  const frame = { borderRadius: 1, overflow: 'hidden', bgcolor: 'background.raised', border: '1px solid', borderColor: 'divider' }
  if (!deck) return <Box aria-hidden="true" sx={{ ...frame, width: 48, height: 64, flexShrink: 0 }} />
  const pair = deck.commanders.length === 2
  return <Box aria-hidden="true" sx={{ position: 'relative', flexShrink: 0, width: pair ? 76 : 48, height: 64, mb: deck.companion ? 1.5 : 0 }}>
    {deck.companion && <Box sx={{ ...frame, position: 'absolute', left: '30%', bottom: -12, width: 28, height: 36, zIndex: 0 }}>
      <CommanderArtwork commander={deck.companion} compact />
    </Box>}
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${deck.commanders.length}, minmax(0, 1fr))`, gap: 0.5, height: '100%', position: 'relative', zIndex: 1 }}>
      {deck.commanders.map(commander => <Box key={`${commander.oracleId}:${commander.position}`} sx={{ ...frame, minWidth: 0 }}>
        <CommanderArtwork commander={commander} compact />
      </Box>)}
    </Box>
  </Box>
}

function ResultControl({ mode, draft, name, count, busy, hasWinner, onResult, onDraw }: {
  mode: OutcomeMode; draft: OutcomeDraft; name: string; count: number; busy: boolean; hasWinner: boolean
  onResult: (value: OutcomeValue) => void; onDraw: (value: boolean | undefined) => void
}) {
  const field = { minWidth: 0, flex: '0 1 220px', '& select': { minHeight: 24, py: 1.25, pl: { xs: 1.25, sm: 1.75 }, fontSize: { xs: '0.9375rem', sm: '1rem' } } }
  if (mode === 'DRAW') {
    return <TextField select size="small" value={draft.draw === undefined ? '' : draft.draw ? 'IN' : 'OUT'} disabled={busy} sx={field}
      slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `Ergebnis für ${name}` } }}
      onChange={event => onDraw(event.target.value === '' ? undefined : event.target.value === 'IN')}>
      <option value="">Status wählen</option>
      <option value="IN">Noch im Spiel</option>
      <option value="OUT">Ausgeschieden</option>
    </TextField>
  }
  const value = outcomeValue(draft, mode)
  if (value === 1) {
    return <Box role="img" aria-label={`${name}: Sieger des Spiels, Platz 1`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, minHeight: 44,
      border: '2px solid', borderColor: 'secondary.main', borderRadius: 1, color: 'secondary.main', fontWeight: 700, whiteSpace: 'nowrap' }}>
      <Trophy /><span aria-hidden="true">Sieger · Platz 1</span>
    </Box>
  }
  if (!hasWinner && value === undefined) {
    return <Button variant="outlined" color="secondary" disabled={busy} aria-label={`${name}: Sieger des Spiels`} onClick={() => onResult(1)}
      startIcon={<Trophy />}>Sieger des Spiels</Button>
  }
  const first = mode === 'WIN' ? 2 : 3
  const places = Array.from({ length: Math.max(0, count - first + 1) }, (_, i) => i + first)
  if (typeof value === 'number' && !places.includes(value)) places.push(value)
  return <TextField select size="small" value={value === undefined ? '' : String(value)} disabled={busy} sx={field}
    slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `Ergebnis für ${name}` } }}
    onChange={event => {
      const raw = event.target.value
      onResult(raw === '' ? undefined : raw === 'WINNER' ? 1 : raw === 'SURVIVOR' ? 'SURVIVOR' : Number(raw))
    }}>
    <option value="">Keine Platzierung</option>
    <option value="WINNER">Sieger des Spiels</option>
    {mode === 'ALTERNATE' && <option value="SURVIVOR">Noch im Spiel · Platz 2</option>}
    {places.map(place => <option key={place} value={String(place)}>Platz {place}</option>)}
  </TextField>
}

/** Shows the sticky search only when the unfiltered list overflows the dialog. */
function useOverflow(content: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!overflow && element && element.scrollHeight > element.clientHeight + 1) setOverflow(true)
  }, [overflow, content])
  return [ref, overflow] as const
}

function PickerDialog({ id, title, subtitle, hint, search, onClose, children, actions, locked = false }: {
  id: string; title: string; subtitle: string; hint: string; search?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; locked?: boolean
}) {
  return <Dialog open onClose={() => { if (!locked) onClose() }} aria-labelledby={`${id}-title`} aria-describedby={`${id}-subtitle`} fullWidth maxWidth="xs" scroll="paper" disableRestoreFocus>
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h6" id={`${id}-title`}>{title}</Typography>
        <Typography id={`${id}-subtitle`} sx={{ color: 'text.secondary' }}>{subtitle}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{hint}</Typography>
      </Box>
      <IconButton aria-label="Schließen" disabled={locked} onClick={onClose} sx={{ width: 48, height: 48 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </IconButton>
    </Box>
    {search && <Box sx={{ px: 2, pt: 1.5 }}>{search}</Box>}
    {children}
    {actions && <DialogActions sx={{ px: 2, pb: 2, flexWrap: 'wrap', gap: 1 }}>{actions}</DialogActions>}
  </Dialog>
}

const listArrow = <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 24, ml: 'auto', pl: 1 }}>›</Box>

function MemberPicker({ groupName, slot, people, busy, error, onClose, onChoose, onCreateProfile }: {
  groupName: string; slot: number; people: { userId: string; name: string; kind: string }[]; busy: boolean; error: string
  onClose: () => void; onChoose: (userId: string) => void; onCreateProfile: () => void
}) {
  const [query, setQuery] = useState('')
  const [content, overflow] = useOverflow(`${people.length}:${error}`)
  const shown = people.filter(person => person.name.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')))
  return <PickerDialog id="member-picker" title="Gruppenmitglied auswählen" subtitle={`${groupName} · Spieler ${slot}`}
    hint="Mitglied antippen öffnet direkt die Deckauswahl." onClose={onClose} locked={busy}
    search={overflow && <TextField type="search" size="small" fullWidth label="Mitglied suchen" value={query} onChange={event => setQuery(event.target.value)} />}
    actions={<Button variant="outlined" color="secondary" disabled={busy} onClick={onCreateProfile}>
      <Box component="span" aria-hidden="true" sx={{ mr: 1 }}>+</Box>{busy ? 'Schnellprofil wird erstellt…' : 'Schnellprofil erstellen'}
    </Button>}>
    <DialogContent ref={content} dividers sx={{ p: 0 }}>
      {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
      {people.length === 0 ? <Typography sx={{ p: 2 }}>Alle Mitglieder sind bereits ausgewählt. Erstelle ein Schnellprofil oder entferne einen Spieler.</Typography>
        : shown.length === 0 ? <Typography role="status" sx={{ p: 2 }}>Kein Mitglied gefunden.</Typography>
          : <List aria-label="Gruppenmitglieder" disablePadding>
            {shown.map(person => <ListItemButton key={person.userId} disabled={busy} onClick={() => onChoose(person.userId)} aria-label={`${person.name} · ${person.kind}`}
              sx={{ gap: 2, minHeight: 64, borderBottom: '1px solid', borderColor: 'divider', '&.Mui-focusVisible': { ...focusOutline, outlineOffset: -3 } }}>
              <Box aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', width: 44, height: 44, flexShrink: 0, borderRadius: 1, bgcolor: 'background.raised', color: 'text.secondary' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{person.name}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{person.kind}</Typography>
              </Box>
              {listArrow}
            </ListItemButton>)}
          </List>}
    </DialogContent>
  </PickerDialog>
}

function DeckPicker({ name, kind, decks, selectedId, historicalId, status, error, mayCreate, onRetry, onClose, onChoose, onOtherMember, onCreate }: {
  name: string; kind: string; decks: DeckSelection[]; selectedId: string; historicalId?: string; status: Choice['status']; error?: string; mayCreate: boolean
  onRetry: () => void; onClose: () => void; onChoose: (deckId: string) => void; onOtherMember: () => void; onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const [content, overflow] = useOverflow(`${status}:${decks.length}`)
  const needle = query.trim().toLocaleLowerCase('de')
  const shown = decks.filter(deck => `${commanderNames(deck)} ${deck.name}`.toLocaleLowerCase('de').includes(needle))
  return <PickerDialog id="deck-picker" title="Deck auswählen" subtitle={`${name} · ${kind}`}
    hint="Deck antippen → Spielerkarte wird kompakt." onClose={onClose}
    search={overflow && <TextField type="search" size="small" fullWidth label="Deck suchen" value={query} onChange={event => setQuery(event.target.value)} />}
    actions={mayCreate && status === 'ready' && <Button variant="outlined" color="secondary" onClick={onCreate}>
      <Box component="span" aria-hidden="true" sx={{ mr: 1 }}>+</Box>Deck erstellen
    </Button>}>
    <DialogContent ref={content} dividers sx={{ p: 0 }}>
      {status === 'loading' && <Typography role="status" sx={{ p: 2 }}>Decks für {name} werden geladen…</Typography>}
      {status === 'error' && <Alert severity="error" sx={{ m: 2 }}>Deckauswahl fehlgeschlagen: {error}
        <Button color="secondary" onClick={onRetry} sx={{ display: 'block', mt: 1 }}>Decks erneut laden</Button>
      </Alert>}
      {status === 'ready' && decks.length === 0 && (mayCreate
        ? <Typography sx={{ p: 2 }}>Noch keine verfügbaren Decks. Erstelle ein Deck für {name}.</Typography>
        : <Box sx={{ p: 2, display: 'grid', gap: 1 }}>
          <Typography component="h3" sx={{ fontWeight: 700 }}>Keine Decks verfügbar</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Nur {name} kann für das eigene Benutzerkonto ein Deck erstellen.</Typography>
          <Button color="secondary" variant="outlined" sx={{ justifySelf: 'start' }} onClick={onOtherMember}>Anderes Mitglied auswählen</Button>
        </Box>)}
      {status === 'ready' && decks.length > 0 && (shown.length === 0 ? <Typography role="status" sx={{ p: 2 }}>Kein Deck gefunden.</Typography>
        : <List aria-label={`Decks von ${name}`} disablePadding>
          {shown.map(deck => <ListItemButton key={deck.id} selected={sameId(deck.id, selectedId)} onClick={() => onChoose(deck.id)}
            aria-label={`${commanderNames(deck)} · ${deck.name}${historicalId && sameId(deck.id, historicalId) ? ' · Erfasste Zuordnung' : ''}`}
            sx={{ gap: 2, minHeight: 80, borderBottom: '1px solid', borderColor: 'divider', '&.Mui-focusVisible': { ...focusOutline, outlineOffset: -3 } }}>
            <DeckArtwork deck={deck} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{commanderNames(deck)}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{deck.name}</Typography>
              {historicalId && sameId(deck.id, historicalId) && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Erfasste Zuordnung</Typography>}
            </Box>
            {listArrow}
          </ListItemButton>)}
        </List>)}
    </DialogContent>
  </PickerDialog>
}
