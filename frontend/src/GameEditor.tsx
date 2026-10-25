import { alternateOutcome, effectivePlace, gameMode, outcomeError, outcomeFields, savedOutcome, type OutcomeDraft, type OutcomeMode } from './gameOutcome'
import { commanderNames } from './api'
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Box, Button, Card, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { ApiError, memberDecks, type DeckSelection, type Game, type GameInput, type GroupDetails } from './api'
import { EditorLeave, useEditorGuard } from './editorGuard'
import { publicName, sameId } from './gamePresentation'
import { groupUrl } from './groupNavigation'

type Assignment = { key: number; userId: string; deckId: string; expanded: boolean; outcome: OutcomeDraft }
type Choice = { status: 'loading' | 'ready' | 'error'; decks: DeckSelection[]; error?: string }
type Props = {
  group: GroupDetails
  game: Game | null
  busy: boolean
  writeError?: string
  onSubmit: (input: GameInput) => void
  onCancel: () => void
  onAccessError: (error: unknown) => void
}

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

const material = (rows: Assignment[], mode: OutcomeMode) => JSON.stringify({
  participants: rows.filter(row => row.userId || row.deckId).map(({ userId, deckId, outcome }) => ({ userId, deckId, outcome })), mode,
})

export default function GameEditor({ group, game, busy, writeError, onSubmit, onCancel, onAccessError }: Props) {
  const [rows, setRows] = useState<Assignment[]>(() => game
    ? game.participants.toSorted((a, b) => a.startPosition - b.startPosition).map((p, key) => ({ key, userId: p.userId, deckId: p.deckId, expanded: false, outcome: savedOutcome(game, p) }))
    : Array.from({ length: 4 }, (_, key) => ({ key, userId: '', deckId: '', expanded: true, outcome: {} })))
  const nextKey = useRef(rows.length)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef<string | null>(null)
  const [mode, setMode] = useState<OutcomeMode>(gameMode(game))
  const dragKey = useRef<number | null>(null)
  const [dropKey, setDropKey] = useState<number | null>(null)
  const [movement, setMovement] = useState('')
  const [baseline] = useState(() => material(rows, mode))
  const [attempted, setAttempted] = useState(false)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [retries, setRetries] = useState<Record<string, number>>({})
  const leave = useContext(EditorLeave)
  useEditorGuard(material(rows, mode) !== baseline || busy, busy, {
    onDiscard: onCancel,
    allows: destination => destination.origin === window.location.origin && destination.pathname === groupUrl(group.id),
  })
  useLayoutEffect(() => { heading.current?.focus() }, [])
  useLayoutEffect(() => {
    if (focusNext.current) {
      document.getElementById(focusNext.current)?.focus()
      focusNext.current = null
    }
  })
  useLayoutEffect(() => { if (writeError) document.getElementById('game-write-error')?.focus() }, [writeError])
  const loaded = useCallback((userId: string, choice: Choice) => setChoices(previous => ({ ...previous, [userId]: choice })), [])
  const original = (userId: string) => game?.participants.find(p => sameId(p.userId, userId))
  const active = (userId: string) => group.members.some(member => sameId(member.userId, userId))
  const people = [...group.members, ...(game?.participants.filter(p => !active(p.userId)) ?? [])]
  function label(userId: string) {
    const person = original(userId) ?? people.find(p => sameId(p.userId, userId))
    return person ? publicName(person, people) : 'Spieler auswählen'
  }
  function decks(row: Assignment) {
    const previous = original(row.userId)
    const fresh = active(row.userId) ? choices[row.userId]?.decks ?? [] : []
    return previous ? [previous.deck, ...fresh.filter(deck => !sameId(deck.id, previous.deckId))] : fresh
  }
  function selectedDeck(row: Assignment) { return decks(row).find(deck => sameId(deck.id, row.deckId)) }
  function valid(row: Assignment) {
    return Boolean(row.userId && row.deckId && selectedDeck(row) &&
      rows.filter(other => other.userId && sameId(other.userId, row.userId)).length === 1)
  }
  function changeRows(next: Assignment[]) { setRows(next) }
  function updateOutcome(key: number, update: (draft: OutcomeDraft) => OutcomeDraft) {
    setRows(current => current.map(row => row.key === key ? { ...row, outcome: update(row.outcome) } : row))
  }
  function move(key: number, target: number) {
    const from = rows.findIndex(row => row.key === key)
    if (busy || from < 0 || target < 0 || target >= rows.length || from === target) return
    const next = [...rows]
    next.splice(target, 0, next.splice(from, 1)[0])
    setRows(next)
    setMovement(`${label(rows[from].userId)} an Position ${target + 1} verschoben.`)
  }
  const complete = rows.filter(valid)
  const loading = rows.some(row => row.userId && !valid(row) && active(row.userId) && (!choices[row.userId] || choices[row.userId].status === 'loading'))
  const errors = new Map<number, { player?: string; deck?: string }>()
  for (const row of rows) {
    if (!row.userId && !row.deckId) continue
    const fields: { player?: string; deck?: string } = {}
    if (!row.userId) fields.player = 'Bitte einen Spieler auswählen oder diese Karte leeren.'
    else if (rows.some(other => other.key !== row.key && other.userId && sameId(other.userId, row.userId))) fields.player = 'Dieser Spieler ist bereits ausgewählt. Bitte einen anderen wählen.'
    else if (!active(row.userId) && !original(row.userId)) fields.player = 'Bitte ein aktives Gruppenmitglied auswählen.'
    if (!row.deckId) fields.deck = 'Bitte ein Deck auswählen oder diese Karte leeren.'
    else if (!selectedDeck(row)) fields.deck = 'Dieses Deck ist nicht verfügbar. Bitte die Decks erneut laden und ein gültiges eigenes Deck wählen.'
    if (Object.keys(fields).length) errors.set(row.key, fields)
  }
  const countError = complete.length < 2 || complete.length > 6 ? 'Bitte 2–6 vollständige, unterschiedliche Spieler mit Deck auswählen. Leere Karten werden nicht gespeichert.' : ''
  const resultError = outcomeError(complete.map(row => row.outcome), mode)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    if (errors.size || countError || resultError || loading) {
      const first = rows.find(row => errors.has(row.key))
      if (first) {
        setRows(rows.map(row => row.key === first.key ? { ...row, expanded: true } : row))
        focusNext.current = `game-${first.key}-${errors.get(first.key)?.player ? 'player' : 'deck'}`
      } else if (countError) document.getElementById(`game-${rows.find(row => !valid(row))?.key ?? rows[0].key}-player`)?.focus()
      else document.getElementById('game-outcome-error')?.focus()
      return
    }
    onSubmit({ participants: complete.map(({ userId, deckId, outcome }, index) => ({
      userId, deckId, startPosition: index + 1, ...outcomeFields(outcome, mode),
    })), result: mode === 'DRAW' ? 'DRAW' : 'WIN', alternateWinCon: mode === 'ALTERNATE' })
  }

  return <Stack component="form" aria-label={game ? 'Spiel bearbeiten' : 'Spiel erfassen'} onSubmit={submit} noValidate
    sx={{ gap: 2, minWidth: 0, color: 'text.primary', '& .MuiCard-root': { overflowWrap: 'anywhere' },
      '& :focus-visible, & [tabindex="-1"]:focus': { outline: theme => `3px solid ${theme.palette.interaction.focus}`, outlineOffset: 2 },
      // Native selects otherwise inherit the pale legacy select:disabled fill.
      '& .MuiNativeSelect-select:disabled': { bgcolor: 'action.disabledBackground', opacity: 1 },
      '& .MuiNativeSelect-select:focus-visible': { outline: 'none' },
    }}>
    {[...new Set(rows.map(row => row.userId).filter(id => id && active(id)))].map(userId =>
      <DeckLoader key={`${userId}:${retries[userId] ?? 0}`} groupId={group.id} userId={userId} onLoaded={loaded} onAccessError={onAccessError} />)}
    <Typography component="h4" variant="h5" ref={heading} tabIndex={-1}>{game ? 'Spiel bearbeiten' : 'Commander-Spiel erfassen'}</Typography>
    <Typography sx={{ color: 'text.secondary' }}>Wähle 2–6 Spieler und ihre Decks. Du musst selbst nicht mitspielen. Vollständig leere Karten werden ausgelassen. Erfasse den Endstand des abgeschlossenen Spiels. Die Kartenreihenfolge bestimmt die Startplätze.</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'flex-end' }}>
      <TextField id="game-result" select label="Spielergebnis" value={mode === 'DRAW' ? 'DRAW' : 'WIN'} disabled={busy}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        onChange={event => setMode(event.target.value as 'WIN' | 'DRAW')}>
        <option value="WIN">Sieg</option><option value="DRAW">Unentschieden</option>
      </TextField>
      {mode !== 'DRAW' && <FormControlLabel label="Alternate WinCon" control={<Checkbox checked={mode === 'ALTERNATE'} disabled={busy}
        onChange={event => setMode(event.target.checked ? 'ALTERNATE' : 'WIN')} />} />}
    </Stack>
    <Typography role="status" aria-live="polite">{movement}</Typography>
    {writeError && <Alert id="game-write-error" tabIndex={-1} severity="error">{writeError}</Alert>}
    {attempted && (errors.size > 0 || countError || resultError) && <Alert severity="error">
      Bitte die markierten Angaben korrigieren. {countError} {resultError}
      {rows.filter(row => errors.has(row.key)).map(row => <Typography key={row.key}>Spieler {rows.indexOf(row) + 1}: {errors.get(row.key)?.player} {errors.get(row.key)?.deck}</Typography>)}
    </Alert>}
    {resultError && <Box id="game-outcome-error" tabIndex={-1} sx={{ color: 'error.main', border: 1, borderRadius: 1, p: 2 }}>{resultError}</Box>}
    {rows.map((row, index) => {
      const deck = selectedDeck(row)
      const previous = original(row.userId)
      const former = Boolean(previous && !active(row.userId))
      const choice = choices[row.userId]
      const expanded = row.expanded || !valid(row)
      const fields = attempted ? errors.get(row.key) : undefined
      return <Card component="section" data-seat-key={row.key} key={row.key} aria-labelledby={`game-slot-${row.key}`} sx={{ p: { xs: 1, sm: 2 }, minWidth: 0, display: 'flex', gap: 1, outline: dropKey === row.key ? '2px solid' : undefined, outlineColor: 'primary.main' }}>
        <Stack sx={{ flexShrink: 0, width: 44, gap: 1 }}>
          <Button aria-label={`Spieler ${index + 1} verschieben`} disabled={busy}
            sx={{ minWidth: 44, minHeight: 44, touchAction: 'none', cursor: 'grab' }}
            onKeyDown={event => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault(); move(row.key, index + (event.key === 'ArrowUp' ? -1 : 1))
              }
            }}
            onPointerDown={event => { if (event.button !== 0) return; dragKey.current = row.key; event.currentTarget.setPointerCapture(event.pointerId) }}
            onPointerMove={event => {
              if (dragKey.current === null) return
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-seat-key]')
              setDropKey(target ? Number(target.getAttribute('data-seat-key')) : null)
            }}
            onPointerUp={event => {
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-seat-key]')
              if (dragKey.current !== null && target) move(dragKey.current, rows.findIndex(r => r.key === Number(target.getAttribute('data-seat-key'))))
              dragKey.current = null; setDropKey(null)
            }} onPointerCancel={() => { dragKey.current = null; setDropKey(null) }}>⠿</Button>
          <Button aria-label={`Spieler ${index + 1} nach oben`} disabled={busy || index === 0} sx={{ minWidth: 44, minHeight: 44 }} onClick={() => move(row.key, index - 1)}>↑</Button>
          <Button aria-label={`Spieler ${index + 1} nach unten`} disabled={busy || index === rows.length - 1} sx={{ minWidth: 44, minHeight: 44 }} onClick={() => move(row.key, index + 1)}>↓</Button>
        </Stack>
        <Stack sx={{ gap: 1.5, minWidth: 0, flex: 1 }}>
          <Typography component="h5" variant="h6" id={`game-slot-${row.key}`}>Spieler {index + 1}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{row.userId && row.deckId ? `Startplatz ${rows.slice(0, index + 1).filter(r => r.userId && r.deckId).length}` : 'Kein Startplatz · unvollständige Karte'}</Typography>
          {!expanded && deck ? <>
            <Typography sx={{ fontWeight: 700 }}>{label(row.userId)}</Typography>
            <Typography>{deck.name}</Typography>
            <Typography sx={{ color: 'text.secondary' }}>Commander: {commanderNames(deck)}</Typography>
            <Typography sx={{ color: 'text.secondary' }}>Farbidentität: {deck.colorIdentity.join(' · ') || 'Farblos'}</Typography>
            <Button id={`game-${row.key}-edit`} color="secondary" variant="outlined" disabled={busy} aria-label={`Spieler ${index + 1} bearbeiten`}
              onClick={() => {
                focusNext.current = `game-${row.key}-player`
                setRows(rows.map(candidate => candidate.key === row.key ? { ...candidate, expanded: true } : candidate))
              }}>Bearbeiten</Button>
          </> : <>
            <TextField id={`game-${row.key}-player`} select label={`Spieler ${index + 1}`} value={row.userId} disabled={busy}
              error={Boolean(fields?.player)} helperText={fields?.player ?? 'Bereits ausgewählte Spieler sind gesperrt (bereits gewählt).'} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              onChange={event => {
                const userId = event.target.value
                if (!active(userId) && original(userId)) focusNext.current = `game-${row.key}-edit`
                // Historical membership grants only its exact recorded pair.
                changeRows(rows.map(candidate => candidate.key === row.key ? { ...candidate, outcome: {}, userId, deckId: !active(userId) ? original(userId)?.deckId ?? '' : '', expanded: active(userId) || !original(userId) } : candidate))
              }}>
              <option value="">Spieler auswählen</option>
              {people.map(person => {
                const taken = rows.some(other => other.key !== row.key && sameId(other.userId, person.userId))
                return <option key={person.userId} value={person.userId} disabled={taken}>
                  {label(person.userId)}{!active(person.userId) ? ' · Ehemaliges Mitglied · nur erfasste Zuordnung' : ''}{taken ? ' · bereits gewählt' : ''}
                </option>
              })}
            </TextField>
            <TextField id={`game-${row.key}-deck`} select label={`Deck für Spieler ${index + 1}`} value={row.deckId} disabled={busy || !row.userId || (!previous && choice?.status !== 'ready')}
              error={Boolean(fields?.deck)} helperText={fields?.deck ?? 'Nur eigene, nicht archivierte Decks; erfasste Zuordnungen dürfen erhalten bleiben.'} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              onChange={event => {
                const deckId = event.target.value
                focusNext.current = deckId ? `game-${row.key}-edit` : null
                changeRows(rows.map(candidate => candidate.key === row.key ? { ...candidate, deckId, expanded: !deckId } : candidate))
              }}>
              <option value="">Deck auswählen</option>
              {decks(row).map(deck => <option key={deck.id} value={deck.id}>
                {deck.name} — {commanderNames(deck)} — {deck.colorIdentity.join('') || 'Farblos'}
                {previous?.deckId === deck.id ? ` · nur erfasste Zuordnung${previous.deck.archived ? ' · Archiviertes Deck' : ''}` : ''}
              </option>)}
            </TextField>
          </>}
          {row.userId && <Stack role="group" aria-label={`Ergebnis für Spieler ${index + 1}`} sx={{ gap: 1 }}>
            {mode === 'ALTERNATE' && <FormControlLabel label="Winner" control={<Checkbox disabled={busy}
              checked={alternateOutcome(row.outcome).winner} onChange={event => updateOutcome(row.key, draft => ({
                ...draft, alternate: { ...alternateOutcome(draft), winner: event.target.checked, stillInGame: false },
              }))} />} />}
            {mode !== 'WIN' && !(mode === 'ALTERNATE' && alternateOutcome(row.outcome).winner) &&
              <FormControlLabel label="Noch im Spiel" control={<Checkbox disabled={busy}
                checked={mode === 'DRAW' ? row.outcome.draw ?? true : alternateOutcome(row.outcome).stillInGame}
                onChange={event => updateOutcome(row.key, draft => mode === 'DRAW' ? { ...draft, draw: event.target.checked } : {
                  ...draft, alternate: { ...alternateOutcome(draft), winner: false, stillInGame: event.target.checked },
                })} />} />}
            {mode !== 'DRAW' && <Typography>Platz: {effectivePlace(row.outcome, mode) ?? 'Bitte auswählen'}</Typography>}
            {(mode === 'WIN' || mode === 'ALTERNATE' && !alternateOutcome(row.outcome).winner && !alternateOutcome(row.outcome).stillInGame) &&
              <Box role="group" aria-label="Platzierung" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Array.from({ length: complete.length }, (_, i) => i + 1).map(place =>
                  <Button key={place} aria-label={`Platz ${place}`} aria-pressed={effectivePlace(row.outcome, mode) === place}
                    variant={effectivePlace(row.outcome, mode) === place ? 'contained' : 'outlined'}
                    disabled={busy} sx={{ minWidth: 44, minHeight: 44 }}
                    onClick={() => updateOutcome(row.key, draft => mode === 'WIN' ? { ...draft, placement: place } : {
                      ...draft, alternate: { ...alternateOutcome(draft), placement: place },
                    })}>{place}</Button>)}
              </Box>}
            {attempted && resultError && <Typography color="error" variant="body2">{resultError}</Typography>}
          </Stack>}
          {former && <Typography sx={{ color: 'text.secondary' }}>Ehemaliges Mitglied: Nur die ursprüngliche Spieler-/Deckzuordnung darf erhalten bleiben.</Typography>}
          {previous?.deckId === row.deckId && previous.deck.archived && <Typography sx={{ color: 'text.secondary' }}>Archiviertes Deck · nur erfasste Zuordnung</Typography>}
          {row.userId && !former && (!choice || choice.status === 'loading') && <Typography role="status">Decks für {label(row.userId)} werden geladen…</Typography>}
          {row.userId && choice?.status === 'error' && <Alert severity="error">Deckauswahl fehlgeschlagen: {choice.error}
            <Button color="secondary" disabled={busy} onClick={() => setRetries(values => ({ ...values, [row.userId]: (values[row.userId] ?? 0) + 1 }))}>Decks für Spieler {index + 1} erneut laden</Button>
          </Alert>}
          {row.userId && !former && choice?.status === 'ready' && choice.decks.length === 0 && <Typography>Keine aktuellen Decks für {label(row.userId)}. Bitte ein nicht archiviertes Deck erstellen lassen oder einen anderen Spieler wählen.</Typography>}
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <Button color="secondary" disabled={busy || (!row.userId && !row.deckId)} aria-label={`Spieler ${index + 1} leeren`} onClick={() => {
              focusNext.current = `game-${row.key}-player`
              changeRows(rows.map(candidate => candidate.key === row.key ? { ...candidate, userId: '', deckId: '', expanded: true, outcome: {} } : candidate))
            }}>Leeren</Button>
            <Button color="inherit" disabled={busy || rows.length <= 2} aria-label={`Spieler ${index + 1} entfernen`} onClick={() => {
              const next = rows.filter(candidate => candidate.key !== row.key)
              const target = next[Math.min(index, next.length - 1)]
              focusNext.current = `game-${target.key}-${target.expanded || !valid(target) ? 'player' : 'edit'}`
              changeRows(next)
            }}>Entfernen</Button>
          </Stack>
        </Stack>
      </Card>
    })}
    <Button color="secondary" variant="outlined" disabled={busy || rows.length >= 6} onClick={() => {
      const key = nextKey.current++
      focusNext.current = `game-${key}-player`
      changeRows([...rows, { key, userId: '', deckId: '', expanded: true, outcome: {} }])
    }}>Spieler hinzufügen</Button>
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
      <Button type="submit" variant="contained" disabled={busy || loading}>{busy ? 'Spiel wird gespeichert…' : 'Spiel speichern'}</Button>
      <Button type="button" color="secondary" onClick={() => leave(onCancel)}>Abbrechen</Button>
    </Box>
  </Stack>
}
