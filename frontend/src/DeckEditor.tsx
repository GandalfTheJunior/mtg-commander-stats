import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, archiveDeck, createDeck, deleteDeck, listDecks, updateDeck, commanderNames, type CommanderChoice, type Deck, type MagicColor, magicColors, scryfallUnavailable } from './api'
import { CommanderSearch } from './CommanderSearch'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import { colorNames } from './deckColors'
import { ManaColorPicker } from './ManaColorPicker'
import { useEditorGuard } from './editorGuard'

export type DeckOverview = '/dashboard' | '/decks'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Draft = { name: string; commander: string; selection: CommanderChoice | null; chosenColor?: MagicColor }
const blank: Draft = { name: '', commander: '', selection: null }
const inputOf = (deck?: Deck): Draft => deck ? { name: deck.name, commander: commanderNames(deck),
  selection: { ...deck.commanders[0], thumbnailUrl: null }, ...(deck.commanders[0].chosenColor ? { chosenColor: deck.commanders[0].chosenColor } : {}) } : blank
const equal = (a: Draft, b: Draft) => a.name === b.name && a.commander === b.commander
  && JSON.stringify(a.selection?.selectionRef) === JSON.stringify(b.selection?.selectionRef) && a.chosenColor === b.chosenColor
const identityOf = (draft: Draft) => magicColors.filter(color => draft.selection?.colorIdentity.includes(color) || draft.chosenColor === color)
// Match DisplayText boundary whitespace, including Java controls; do not trim the payload.
const emptyText = (value: string) => [...value].every(char => /\p{White_Space}/u.test(char) || (char.codePointAt(0)! >= 28 && char.codePointAt(0)! <= 31))
const message = (error: unknown) => error instanceof Error ? error.message : 'Der Vorgang konnte nicht bestätigt werden.'

export default function DeckEditor({ onUnauthorized, getReturnTo, onFinished, onLogout }: {
  onUnauthorized: () => void; getReturnTo: () => DeckOverview; onLogout: () => void; onFinished: (message: string, destination: DeckOverview) => void
}) {
  const { deckId } = useParams()
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; deck?: Deck }>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!deckId) return
    let current = true
    const controller = new AbortController()
    listDecks(controller.signal).then(decks => {
      if (!current) return
      const deck = deckId && uuid.test(deckId) ? decks.find(deck => deck.id === deckId) : undefined
      setState(!deck ? { status: 'error' } : { status: 'ready', deck })
    }).catch((error: unknown) => {
      if (!current) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else setState({ status: 'error' })
    })
    return () => { current = false; controller.abort() }
  }, [deckId, onUnauthorized, revision])
  if (!deckId) return <DeckForm getReturnTo={getReturnTo} onUnauthorized={onUnauthorized} onFinished={onFinished} onLogout={onLogout} />
  if (state.status === 'loading') return <Typography role="status">Deck wird geladen…</Typography>
  if (state.status === 'error') return <Stack sx={{ gap: 2 }}>
    <Alert severity="error">Dieses Deck ist nicht verfügbar oder konnte nicht sicher geladen werden.</Alert>
    <Button component={Link} color="secondary" to="/decks" replace>Zur Deckübersicht</Button>
    <Button color="secondary" onClick={() => { setState({ status: 'loading' }); setRevision(value => value + 1) }}>Erneut prüfen</Button>
  </Stack>
  return <DeckForm deck={state.deck} getReturnTo={getReturnTo} onUnauthorized={onUnauthorized} onFinished={onFinished} onLogout={onLogout} />
}

function DeckForm({ deck, getReturnTo, onUnauthorized, onFinished, onLogout }: {
  deck?: Deck; getReturnTo: () => DeckOverview; onUnauthorized: () => void; onLogout: () => void; onFinished: (message: string, destination: DeckOverview) => void
}) {
  const navigate = useNavigate()
  // Capture once per form mount without coupling create entry to a list request.
  const returnTo = useRef<DeckOverview | null>(null)
  useLayoutEffect(() => { returnTo.current ??= getReturnTo() }, [getReturnTo])
  const [confirmed, setConfirmed] = useState(deck)
  const [baseline, setBaseline] = useState(() => inputOf(deck))
  const [draft, setDraft] = useState(() => inputOf(deck))
  const [errors, setErrors] = useState<{ name?: string; commander?: string; chosenColor?: string }>({})
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<'none' | 'required' | 'checking' | 'review' | 'unavailable'>('none')
  const [checkedDecks, setCheckedDecks] = useState<Deck[]>([])
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [destructive, setDestructive] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const cancelDestructive = useRef<HTMLButtonElement>(null)
  const overflow = useRef<HTMLButtonElement>(null)
  const nameField = useRef<HTMLInputElement>(null)
  const commanderField = useRef<HTMLInputElement>(null)
  const noticeElement = useRef<HTMLDivElement>(null)
  const operation = useRef<AbortController | null>(null)
  const pending = useRef(false)
  const recheckVersion = useRef(0)
  const dirty = !equal(draft, baseline)
  const releaseGuard = useEditorGuard(!completed && (dirty || busy), busy)
  // Install the request lifetime before focus exposes the form to interaction.
  useLayoutEffect(() => {
    const controller = new AbortController()
    operation.current = controller
    return () => { controller.abort() }
  }, [])
  useLayoutEffect(() => { heading.current?.focus() }, [])
  useLayoutEffect(() => { if (notice) noticeElement.current?.focus() }, [notice, recovery])

  async function recheck(signal: AbortSignal) {
    const version = ++recheckVersion.current
    setRecovery('checking')
    try {
      const decks = await listDecks(signal)
      if (signal.aborted || version !== recheckVersion.current) return
      const fresh = decks.find(candidate => candidate.id === deck?.id)
      if (deck && !fresh) { setConfirmed(undefined); setRecovery('unavailable'); return }
      setConfirmed(fresh)
      setCheckedDecks(decks)
      setRecovery('review')
    } catch (error) {
      if (signal.aborted || version !== recheckVersion.current) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else { setRecovery('unavailable'); setNotice(`${message(error)} Bitte den Serverstand erneut prüfen.`) }
    }
  }

  async function write(kind: 'save' | 'destroy') {
    if (pending.current || recovery !== 'none') return
    const signal = operation.current!.signal
    pending.current = true
    setBusy(true)
    setNotice(null)
    let succeeded = false
    try {
      let acknowledgment: string
      if (kind === 'destroy' && confirmed) {
        if (confirmed.everUsed) {
          await archiveDeck(confirmed.id, signal)
          acknowledgment = `${confirmed.name} wurde archiviert.`
        } else {
          await deleteDeck(confirmed.id, signal)
          acknowledgment = `${confirmed.name} wurde gelöscht.`
        }
      } else {
        const sameSelection = confirmed && JSON.stringify(draft.selection?.selectionRef) === JSON.stringify(confirmed.commanders[0].selectionRef)
          && (draft.chosenColor ?? null) === confirmed.commanders[0].chosenColor
        const payload = { name: draft.name, ...(!confirmed?.everUsed && !sameSelection ? { commanders: [{ selectionRef: draft.selection!.selectionRef,
          ...(draft.selection!.requiresChosenColor ? { chosenColor: draft.chosenColor } : {}) }] } : {}) }
        const saved = confirmed ? await updateDeck(confirmed.id, payload, signal) : await createDeck(payload, signal)
        acknowledgment = `${saved.name} wurde ${confirmed ? 'gespeichert' : 'erstellt'}.`
      }
      if (signal.aborted) return
      succeeded = true
      setCompleted(true)
      releaseGuard()
      onFinished(acknowledgment, returnTo.current ?? '/decks')
    } catch (error) {
      if (signal.aborted) return
      setDestructive(false)
      if (error instanceof ApiError && error.status === 401) { onUnauthorized(); return }
      setNotice(error instanceof ApiError && error.status === 503 ? scryfallUnavailable : message(error))
      if (error instanceof ApiError && error.status === 409) {
        setNotice(`${message(error)} Konflikt: Der Serverstand wird neu geladen. Dein Entwurf bleibt zur Prüfung erhalten.`)
        await recheck(signal)
      } else if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        // Do not display protected edit fields until access is confirmed afresh.
        setRecovery('unavailable')
      } else if (!(error instanceof ApiError) || error.status >= 500) {
        setRecovery('required')
      }
    } finally {
      if (!succeeded) {
        pending.current = false
        if (!signal.aborted) setBusy(false)
      }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = {
      ...(emptyText(draft.name) ? { name: 'Bitte einen Decknamen eingeben.' } : {}),
      ...(!confirmed?.everUsed && !draft.selection ? { commander: 'Bitte einen Commander aus den Suchergebnissen wählen.' } : {}),
      ...(!confirmed?.everUsed && draft.selection?.requiresChosenColor && !draft.chosenColor ? { chosenColor: 'Bitte eine Farbe wählen.' } : {}),
    }
    setErrors(invalid)
    if (invalid.name) nameField.current?.focus()
    else if (invalid.commander) commanderField.current?.focus()
    else if (invalid.chosenColor) document.getElementById('chosen-color-W')?.focus()
    else void write('save')
  }
  const displayed = confirmed?.everUsed ? inputOf(confirmed) : draft
  const hidden = recovery === 'checking' || recovery === 'unavailable'
  const restricted = busy || recovery !== 'none'
  const destructiveAction = confirmed && !(confirmed.everUsed && confirmed.archived)
  const action = confirmed?.everUsed ? 'Archivieren' : 'Löschen'
  const discardingRename = confirmed?.everUsed && dirty
  return <Stack component="section" aria-labelledby="deck-editor-heading" sx={{ gap: 2, minWidth: 0, maxWidth: 800, mx: 'auto' }}>
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
      <Button color="secondary" disabled={busy} onClick={() => { void navigate(returnTo.current ?? '/decks', { replace: true }) }}>Zurück</Button>
      {destructiveAction && !hidden && <Button ref={overflow} color="secondary" disabled={restricted} aria-label="Deckaktionen" aria-haspopup="menu"
        aria-controls={menu ? 'deck-menu' : undefined} aria-expanded={Boolean(menu)} onClick={event => setMenu(event.currentTarget)}>•••</Button>}
    </Stack>
    <Typography ref={heading} tabIndex={-1} component="h2" variant="h4" id="deck-editor-heading" sx={{ '&:focus': { outline: '2px solid', outlineColor: 'interaction.focus', outlineOffset: 4 } }}>{deck ? 'Deck bearbeiten' : 'Deck erstellen'}</Typography>
    {notice && <Alert ref={noticeElement} tabIndex={-1} severity="error" sx={{ '&:focus': { outlineColor: 'interaction.focus' } }}>{notice}</Alert>}
    {recovery !== 'none' && <Box>
      <Typography role="status">{recovery === 'checking' ? 'Serverstand wird geprüft…' : recovery === 'unavailable'
        ? 'Deckdaten sind bis zur erneuten Bestätigung ausgeblendet.' : 'Kein Erfolg bestätigt. Prüfe den aktuellen Serverstand vor einem manuellen neuen Versuch.'}</Typography>
      {recovery !== 'checking' && <Button color="secondary" disabled={busy} onClick={() => { void recheck(operation.current!.signal) }}>Serverstand erneut prüfen</Button>}
      {recovery === 'review' && <>
        <Typography>Dein Entwurf: {draft.name} · {draft.commander} · {identityOf(draft).join('') || 'Farblos'}</Typography>
        {confirmed ? <Typography>Serverstand: {confirmed.name} · {commanderNames(confirmed)} · {confirmed.colorIdentity.join('') || 'Farblos'} · {confirmed.everUsed ? 'dauerhaft verwendet' : 'unbenutzt'} · {confirmed.archived ? 'archiviert' : 'aktiv'}</Typography>
          : <><Typography>Aktuelle Decks – prüfe, ob dein Erstellversuch bereits gespeichert wurde:</Typography>
            <ul>{checkedDecks.map(item => <li key={item.id}>{item.name} · {commanderNames(item)} · {item.id}</li>)}</ul></>}
        <Button color="secondary" onClick={() => {
          // Only explicit review reconciles a draft with newly permanent fields.
          if (confirmed) {
            setBaseline(inputOf(confirmed))
            if (confirmed.everUsed) setDraft(current => ({ ...inputOf(confirmed), name: current.name }))
          }
          setRecovery('none')
          setNotice(null)
        }}>Serverstand geprüft – Entwurf weiter bearbeiten</Button>
      </>}
      <Button component={Link} to="/decks" color="secondary" replace>Zur Deckübersicht</Button>
    </Box>}
    {!hidden && <Box component="form" aria-label={deck ? `Deck ${deck.name} bearbeiten` : 'Deck erstellen'} noValidate onSubmit={submit} sx={{ display: 'grid', gap: 3, mt: 0, minWidth: 0 }}>
      <TextField inputRef={nameField} label="Deckname" name="name" required fullWidth value={draft.name} disabled={restricted}
        error={Boolean(errors.name)} helperText={errors.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
      <CommanderSearch inputRef={commanderField} query={displayed.commander} selection={displayed.selection} disabled={restricted}
        locked={confirmed?.everUsed ?? false} error={errors.commander} onUnauthorized={onUnauthorized}
        onInput={commander => { setDraft(current => ({ name: current.name, commander, selection: null })); setErrors(current => ({ ...current, commander: undefined, chosenColor: undefined })) }}
        onSelect={selection => { setDraft(current => ({ name: current.name, commander: selection.name, selection })); setErrors(current => ({ ...current, commander: undefined, chosenColor: undefined })) }} />
      {confirmed?.everUsed && <Typography id="deck-locked">Bereits in einem Spiel verwendet: Commander und Farbidentität sind dauerhaft gesperrt, auch nach dem Löschen aller Spiele. Du kannst den Decknamen ändern.</Typography>}
      {confirmed?.archived && <Typography>Archiviert – für neue Spiele nicht verfügbar. Umbenennen bleibt möglich.</Typography>}
      {displayed.selection?.requiresChosenColor && <Box component="fieldset" sx={{ m: 0, p: 2, borderColor: 'interaction.border' }}>
        <Typography component="legend">Farbe vor Spielbeginn wählen (erforderlich)</Typography>
        <RadioGroup aria-label="Farbe vor Spielbeginn" aria-required="true" aria-invalid={Boolean(errors.chosenColor)} value={displayed.chosenColor ?? ''} row
          onChange={event => { setDraft(current => ({ ...current, chosenColor: event.target.value as MagicColor })); setErrors(current => ({ ...current, chosenColor: undefined })) }}>
          {magicColors.map(color => <FormControlLabel key={color} value={color} label={colorNames[color]} disabled={restricted || confirmed?.everUsed}
            control={<Radio id={`chosen-color-${color}`} slotProps={{ input: { 'aria-describedby': errors.chosenColor ? 'chosen-color-error' : undefined } }} />} />)}
        </RadioGroup>
        {errors.chosenColor && <Typography id="chosen-color-error" color="error" role="alert">{errors.chosenColor}</Typography>}
      </Box>}
      <ManaColorPicker value={confirmed?.everUsed ? confirmed.colorIdentity : identityOf(draft)} disabled
        selected={Boolean(draft.selection && (!draft.selection.requiresChosenColor || draft.chosenColor))}
        descriptionId={confirmed?.everUsed ? 'deck-locked' : undefined} onChange={() => {}} />
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" type="submit" disabled={restricted}>{busy ? 'Wird gespeichert…' : deck ? 'Änderungen speichern' : 'Deck erstellen'}</Button>
        <Button color="secondary" type="button" disabled={busy} onClick={() => { void navigate(returnTo.current ?? '/decks', { replace: true }) }}>Abbrechen</Button>
      </Stack>
    </Box>}
    <Menu id="deck-menu" anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
      <MenuItem onClick={() => { setMenu(null); setDestructive(true) }}>{action}</MenuItem>
    </Menu>
    {!hidden && <Dialog open={destructive} disableRestoreFocus onClose={() => { if (!busy) setDestructive(false) }} aria-labelledby="deck-destroy-title" aria-describedby={discardingRename ? 'deck-destroy-description deck-destroy-discard' : 'deck-destroy-description'}
      slotProps={{ transition: { onEntered: () => cancelDestructive.current?.focus(), onExited: () => { if (notice) noticeElement.current?.focus(); else if (!restricted) overflow.current?.focus() } } }}>
      <DialogTitle id="deck-destroy-title">{confirmed?.name}: {action}?</DialogTitle>
      <DialogContent><DialogContentText id="deck-destroy-description">{confirmed?.everUsed
        ? 'Das Deck bleibt im Verlauf erhalten und kann für neue Spiele nicht mehr ausgewählt werden. Archivieren kann nicht rückgängig gemacht werden.'
        : 'Das Deck wird endgültig gelöscht. Dies kann nicht rückgängig gemacht werden.'}</DialogContentText>
        {discardingRename && <DialogContentText id="deck-destroy-discard" sx={{ mt: 2 }}>
          Deine ungespeicherte Änderung am Decknamen wird verworfen und nicht gespeichert.
        </DialogContentText>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button ref={cancelDestructive} autoFocus color="secondary" disabled={busy} onClick={() => setDestructive(false)}>Abbrechen</Button>
        <Button color="inherit" onClick={onLogout}>Log out</Button>
        <Button color="error" disabled={busy} onClick={() => { void write('destroy') }}>{busy ? 'Bitte warten…' : discardingRename ? 'Änderung verwerfen und archivieren' : `${action} bestätigen`}</Button>
      </DialogActions>
    </Dialog>}
  </Stack>
}
