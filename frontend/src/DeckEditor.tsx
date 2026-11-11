import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, archiveDeck, createDeck, deleteDeck, listDecks, magicColors, scryfallUnavailable, searchCommanders, searchCompanions, updateDeck,
  type Artwork, type ArtworkSelection, type CommanderChoice, type CompanionChoice, type Deck, type DeckFormat, type DeckInput, type MagicColor } from './api'
import { DraftArtworkGallery } from './ArtworkGallery'
import { CardSearch } from './CardSearch'
import { DeckArtworkPreview, type PreviewArt, type PreviewCard } from './DeckArtworkPreview'
import { colorNames } from './deckColors'
import { EditorLeave, useEditorGuard, type EditorGuardOptions } from './editorGuard'
import { ManaSymbols } from './ManaSymbols'
import { safeManaBoxUrl } from './manaBoxUrl'
import { randomUuid } from './navigationToken'

export type DeckOverview = '/dashboard' | '/decks'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CommanderSlot = { choice: CommanderChoice; chosenColor: MagicColor | null; art: PreviewArt | null }
type CompanionSlot = { choice: CompanionChoice; art: PreviewArt | null }
type Draft = { name: string; manaBoxUrl: string; format: DeckFormat; commanders: CommanderSlot[]; companion: CompanionSlot | null }
type Target = { kind: 'commander'; index: number } | { kind: 'companion' }

const blank: Draft = { name: '', manaBoxUrl: '', format: 'COMMANDER', commanders: [], companion: null }
const savedArt = (card: { scryfallCardId: string; artworkFaceIndex: number | null; artCropUrl: string | null }): PreviewArt =>
  ({ scryfallCardId: card.scryfallCardId, artworkFaceIndex: card.artworkFaceIndex, artCropUrl: card.artCropUrl })
const draftOf = (deck?: Deck): Draft => deck ? {
  name: deck.name, manaBoxUrl: deck.manaBoxUrl ?? '', format: deck.format ?? 'COMMANDER',
  commanders: deck.commanders.map(card => ({ choice: { ...card, thumbnailUrl: null }, chosenColor: card.chosenColor, art: savedArt(card) })),
  companion: deck.companion ? { choice: { ...deck.companion, thumbnailUrl: null }, art: savedArt(deck.companion) } : null,
} : blank
const artKey = (art: PreviewArt | null) => art ? `${art.scryfallCardId}:${art.artworkFaceIndex}` : 'default'
const refKey = (choice: { selectionRef: unknown }) => JSON.stringify(choice.selectionRef)
const keyOf = (draft: Draft) => JSON.stringify([draft.name, draft.manaBoxUrl, draft.format,
  draft.commanders.map(slot => [refKey(slot.choice), slot.chosenColor, artKey(slot.art)]),
  draft.companion && [refKey(draft.companion.choice), artKey(draft.companion.art)]])
const artworkInput = (art: PreviewArt): ArtworkSelection => ({ scryfallCardId: art.scryfallCardId, ...(art.artworkFaceIndex === null ? {} : { artworkFaceIndex: art.artworkFaceIndex }) })
const identityOf = (commanders: CommanderSlot[]) => magicColors.filter(color => commanders.some(slot => slot.choice.colorIdentity.includes(color) || slot.chosenColor === color))
const identityComplete = (commanders: CommanderSlot[]) => commanders.every(slot => !slot.choice.requiresChosenColor || slot.chosenColor)
const supportsPair = (choice?: CommanderChoice) => Boolean(choice && (choice.pairing.roles.length || choice.pairing.partnerWith.length || choice.pairing.variants.length))
const isDoctorOnly = (choice?: CommanderChoice) => choice?.pairing.roles.length === 1 && choice.pairing.roles[0] === 'DOCTOR'
  && !choice.pairing.partnerWith.length && !choice.pairing.variants.length
const normal = (text: string) => text.toLocaleLowerCase('en').trim()
/** Client hint mirroring the backend pair rules; the server remains authoritative on save. */
function pairCompatible(first: CommanderChoice, second: CommanderChoice) {
  const has = (choice: CommanderChoice, role: string) => choice.pairing.roles.includes(role)
  return (has(first, 'PARTNER') && has(second, 'PARTNER'))
    || first.pairing.partnerWith.map(normal).includes(normal(second.name)) || second.pairing.partnerWith.map(normal).includes(normal(first.name))
    || (has(first, 'CHOOSE_BACKGROUND') && has(second, 'BACKGROUND')) || (has(second, 'CHOOSE_BACKGROUND') && has(first, 'BACKGROUND'))
    || (has(first, 'DOCTOR') && has(second, 'COMPANION')) || (has(second, 'DOCTOR') && has(first, 'COMPANION'))
    || first.pairing.variants.some(variant => second.pairing.variants.includes(variant))
}
const companionFits = (companion: CompanionSlot, commanders: CommanderSlot[]) => {
  const identity = identityOf(commanders)
  return companion.choice.colorIdentity.every(color => identity.includes(color))
}
// Match DisplayText boundary whitespace, including Java controls; do not trim the payload.
const emptyText = (value: string) => [...value].every(char => /\p{White_Space}/u.test(char) || (char.codePointAt(0)! >= 28 && char.codePointAt(0)! <= 31))
const message = (error: unknown) => error instanceof Error ? error.message : 'Der Vorgang konnte nicht bestätigt werden.'
const lockedNotice = 'Feld gesperrt – dieses Deck wurde bereits gespielt.'
const guardOptions: EditorGuardOptions = { copy: {
  description: 'Du hast ungespeicherte Änderungen. Wenn du den Editor verlässt, gehen sie verloren – auch deine Artwork-Auswahl.',
  stay: 'Weiter bearbeiten', discard: 'Änderungen verwerfen',
}, hideLogout: true }

/** Build the explicit write: unchanged parts are omitted, removals are explicit (never implicit server clearing). */
function payloadOf(draft: Draft, saved?: Deck): DeckInput {
  const baseline = saved ? draftOf(saved) : undefined
  const commanderArt = (slot: CommanderSlot, index: number) => {
    const before = baseline?.commanders[index]
    const changed = slot.art && (!before || refKey(before.choice) !== refKey(slot.choice) || artKey(before.art) !== artKey(slot.art))
    return changed && slot.art ? { artwork: artworkInput(slot.art) } : {}
  }
  const commanders = draft.commanders.map((slot, index) => ({ selectionRef: slot.choice.selectionRef,
    ...(slot.choice.requiresChosenColor && slot.chosenColor ? { chosenColor: slot.chosenColor } : {}), ...commanderArt(slot, index) }))
  const companion = draft.companion && { selectionRef: draft.companion.choice.selectionRef,
    ...(draft.companion.art && (!baseline?.companion || refKey(baseline.companion.choice) !== refKey(draft.companion.choice)
      || artKey(baseline.companion.art) !== artKey(draft.companion.art)) ? { artwork: artworkInput(draft.companion.art) } : {}) }
  if (!baseline) return { name: draft.name, format: draft.format, ...(draft.manaBoxUrl !== '' ? { manaBoxUrl: draft.manaBoxUrl } : {}),
    commanders, ...(companion ? { companion } : {}) }
  const commandersChanged = commanders.length !== baseline.commanders.length || commanders.some((input, index) => 'artwork' in input
    || refKey(input) !== refKey(baseline.commanders[index].choice) || (input.chosenColor ?? null) !== (baseline.commanders[index].chosenColor ?? null))
  const companionChanged = Boolean(baseline.companion) !== Boolean(companion)
    || Boolean(companion && ('artwork' in companion || refKey(companion) !== refKey(baseline.companion!.choice)))
  return { name: draft.name,
    ...(draft.manaBoxUrl !== baseline.manaBoxUrl ? { manaBoxUrl: draft.manaBoxUrl === '' ? null : draft.manaBoxUrl } : {}),
    ...(draft.format !== baseline.format ? { format: draft.format } : {}),
    ...(commandersChanged ? { commanders } : {}), ...(companionChanged ? { companion } : {}) }
}
/**
 * Adopt an authoritative deck whose gameplay fields became permanently locked: gameplay comes from the
 * server, while the still-editable name, link and artwork choices of unchanged identities are kept.
 */
function reconcileLocked(fresh: Deck, current: Draft): Draft {
  const base = draftOf(fresh)
  return { ...base, name: current.name, manaBoxUrl: current.manaBoxUrl,
    commanders: base.commanders.map((slot, index) => {
      const mine = current.commanders[index]
      return mine?.art && mine.choice.name === slot.choice.name ? { ...slot, art: mine.art } : slot
    }),
    companion: base.companion && current.companion?.art && current.companion.choice.name === base.companion.choice.name
      ? { ...base.companion, art: current.companion.art } : base.companion }
}
/** Fill default (not yet chosen) artwork of a draft with the saved artwork of the same identities. */
function withSavedArt(saved: Deck, current: Draft): Draft {
  const base = draftOf(saved)
  return { ...current,
    commanders: current.commanders.map((slot, index) => !slot.art && base.commanders[index]?.choice.name === slot.choice.name
      ? { ...slot, art: base.commanders[index].art } : slot),
    companion: current.companion && !current.companion.art && base.companion?.choice.name === current.companion.choice.name
      ? { ...current.companion, art: base.companion.art } : current.companion }
}
/** Whether an authoritative deck reflects an attempted draft (printings may differ after artwork changes). */
function reflects(deck: Deck, attempt: Draft) {
  const fresh = draftOf(deck)
  const sameArt = (wanted: PreviewArt | null, actual: PreviewArt | null) => !wanted || artKey(wanted) === artKey(actual)
  return fresh.name === attempt.name && fresh.manaBoxUrl === attempt.manaBoxUrl && fresh.format === attempt.format
    && fresh.commanders.length === attempt.commanders.length && attempt.commanders.every((slot, index) => fresh.commanders[index].choice.name === slot.choice.name
      && fresh.commanders[index].chosenColor === slot.chosenColor && sameArt(slot.art, fresh.commanders[index].art))
    && (fresh.companion?.choice.name ?? null) === (attempt.companion?.choice.name ?? null)
    && (!attempt.companion || sameArt(attempt.companion.art, fresh.companion?.art ?? null))
}

export default function DeckEditor({ onUnauthorized, getReturnTo, onFinished }: {
  onUnauthorized: () => void; getReturnTo: () => DeckOverview; onFinished: (message: string, destination: DeckOverview) => void
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
  if (!deckId) return <DeckForm getReturnTo={getReturnTo} onUnauthorized={onUnauthorized} onFinished={onFinished} />
  if (state.status === 'loading') return <Typography role="status">Deck wird geladen…</Typography>
  if (state.status === 'error') return <Stack sx={{ gap: 2 }}>
    <Alert severity="error">Dieses Deck ist nicht verfügbar oder konnte nicht sicher geladen werden.</Alert>
    <Button component={Link} color="secondary" to="/decks" replace>Zur Deckübersicht</Button>
    <Button color="secondary" onClick={() => { setState({ status: 'loading' }); setRevision(value => value + 1) }}>Erneut prüfen</Button>
  </Stack>
  return <DeckForm deck={state.deck} getReturnTo={getReturnTo} onUnauthorized={onUnauthorized} onFinished={onFinished} />
}

/** Contextual deck creation for another owner (#196): the caller keeps its own
 * in-progress state mounted and decides where Back, Cancel and success return. */
export type DeckFormContext = {
  title: string
  create: (input: DeckInput, signal: AbortSignal, idempotencyKey?: string) => Promise<Deck>
  list: (signal: AbortSignal) => Promise<Deck[]>
  onExit: (created?: Deck) => void
}

type Phase = { kind: 'idle' | 'saving' | 'checking' } | { kind: 'failed'; title: string; detail: string; retry: boolean }
  | { kind: 'uncertain' } | { kind: 'unavailable' } | { kind: 'reconciled'; detail: string }

function LockIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
}

/** Selected card as a compact name row; locked rows stay in place and explain the lock when activated. */
function CardRow({ label, name, colors, locked, disabled, onChange, onRemove, onLocked, children }: {
  label: string; name: string; colors: MagicColor[]; locked: boolean; disabled: boolean
  onChange: () => void; onRemove?: () => void; onLocked: () => void; children?: ReactNode
}) {
  return <Box component="section" aria-label={label} sx={{ display: 'grid', gap: 1 }}>
    <Typography component="h3" variant="subtitle1">{label}</Typography>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 2, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1,
      bgcolor: locked ? 'action.disabledBackground' : 'background.paper' }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 1, overflowWrap: 'anywhere' }}>
        <Typography>{name}</Typography>
        <ManaSymbols colors={colors} size={22} />
      </Box>
      <Stack sx={{ gap: 0.5, flexShrink: 0 }}>
        <Button variant="outlined" color="secondary" disabled={disabled && !locked} aria-disabled={locked || undefined}
          aria-label={`${label} ändern${locked ? ' (gesperrt)' : ''}`} startIcon={locked ? <LockIcon /> : undefined}
          onClick={() => locked ? onLocked() : onChange()} sx={{ minHeight: 44, ...(locked ? { color: 'text.secondary', borderColor: 'divider', '&:hover': { borderColor: 'divider' } } : {}) }}>Ändern</Button>
        {onRemove && !locked && <Button color="secondary" disabled={disabled} aria-label={`${label} entfernen`} onClick={onRemove} sx={{ minHeight: 44 }}>× Entfernen</Button>}
      </Stack>
    </Box>
    {children}
  </Box>
}

function ChosenColor({ slot, index, locked, disabled, error, onChange, onLocked }: {
  slot: CommanderSlot; index: number; locked: boolean; disabled: boolean; error?: string; onChange: (color: MagicColor) => void; onLocked: () => void
}) {
  const errorId = `chosen-color-error-${index}`
  return <Box component="fieldset" sx={{ m: 0, p: 2, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1 }}>
    <Typography component="legend" sx={{ px: 0.5 }}>Farbe vor Spielbeginn wählen – {slot.choice.name}</Typography>
    <RadioGroup row aria-label={`Farbe vor Spielbeginn – ${slot.choice.name}`} aria-required="true" aria-readonly={locked || undefined}
      aria-invalid={Boolean(error)} value={slot.chosenColor ?? ''} onChange={event => locked ? onLocked() : onChange(event.target.value as MagicColor)}>
      {magicColors.map(color => <FormControlLabel key={color} value={color} label={colorNames[color]} disabled={disabled && !locked}
        onClick={() => { if (locked) onLocked() }}
        control={<Radio id={`chosen-color-${index + 1}-${color}`} slotProps={{ input: { 'aria-describedby': error ? errorId : undefined } }} />} />)}
    </RadioGroup>
    {error && <Typography id={errorId} color="error" role="alert">{error}</Typography>}
  </Box>
}

export function DeckForm({ deck, getReturnTo, onUnauthorized, onFinished, context }: {
  deck?: Deck; getReturnTo?: () => DeckOverview; onUnauthorized: () => void
  onFinished?: (message: string, destination: DeckOverview) => void; context?: DeckFormContext
}) {
  const navigate = useNavigate()
  // Capture once per form mount without coupling create entry to a list request.
  const returnTo = useRef<DeckOverview | null>(null)
  useLayoutEffect(() => { returnTo.current ??= getReturnTo?.() ?? '/decks' }, [getReturnTo])
  const leave = useContext(EditorLeave)
  // Contextual exits change no URL, so they ask through the local leave guard.
  const exit = () => { if (context) leave(() => context.onExit()); else void navigate(returnTo.current ?? '/decks', { replace: true }) }
  const [confirmed, setConfirmed] = useState(deck)
  const [baseline, setBaseline] = useState(() => draftOf(deck))
  const [draft, setDraft] = useState(() => draftOf(deck))
  const [touched, setTouched] = useState<{ name?: boolean; manaBoxUrl?: boolean }>({})
  const [serverErrors, setServerErrors] = useState<{ name?: string; manaBoxUrl?: string; companion?: string }>({})
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [completed, setCompleted] = useState(false)
  const [searching, setSearching] = useState<{ first?: boolean; second?: boolean; companion?: boolean }>({})
  const [undo, setUndo] = useState<{ message: string; draft: Draft } | null>(null)
  const [locked, setLocked] = useState(false)
  const [gallery, setGallery] = useState<{ target: Target; trigger: HTMLButtonElement } | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [destructive, setDestructive] = useState<'archive' | 'delete' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const overflow = useRef<HTMLButtonElement>(null)
  const banner = useRef<HTMLDivElement>(null)
  const commanderSection = useRef<HTMLDivElement>(null)
  const anchor = useRef<number | null>(null)
  const operation = useRef<AbortController | null>(null)
  const pending = useRef(false)
  const idempotencyKey = useRef<string | null>(null)
  const attempt = useRef<{ draft: Draft; input: DeckInput } | null>(null)
  // What "Gespeicherten Stand prüfen" resolves: the last unconfirmed write, or a failed conflict refresh.
  const recheck = useRef<'write' | 'refresh'>('write')
  const busy = phase.kind === 'saving' || phase.kind === 'checking'
  // A pending request has captured its payload: no draft change may happen until it settles. A contextual
  // create cannot update a deck afterwards, so it also freezes the draft until an unknown outcome is resolved.
  const frozen = busy || (Boolean(context) && phase.kind === 'uncertain')
  const dirty = keyOf(draft) !== keyOf(baseline)
  const releaseGuard = useEditorGuard(!completed && (dirty || busy), busy, guardOptions)
  const gameplayLocked = Boolean(confirmed?.everUsed)
  const showLocked = useCallback(() => setLocked(true), [])

  // Install the request lifetime before focus exposes the form to interaction.
  useLayoutEffect(() => {
    const controller = new AbortController()
    operation.current = controller
    return () => { controller.abort() }
  }, [])
  useLayoutEffect(() => { heading.current?.focus() }, [])
  useLayoutEffect(() => { if (phase.kind === 'failed' || phase.kind === 'uncertain' || phase.kind === 'reconciled') banner.current?.focus() }, [phase])
  // Keep the active Commander field at its viewport position when the preview is inserted above it.
  const hasPreview = draft.commanders.length > 0
  useLayoutEffect(() => {
    if (anchor.current === null || !commanderSection.current) return
    const delta = commanderSection.current.getBoundingClientRect().top - anchor.current
    anchor.current = null
    if (delta) window.scrollBy(0, delta)
  }, [hasPreview])

  // Field validity is live for the Save button; messages appear only after leaving a field.
  const nameError = emptyText(draft.name) ? 'Deckname darf nicht leer sein.' : undefined
  const manaBoxError = draft.manaBoxUrl !== '' && !safeManaBoxUrl(draft.manaBoxUrl)
    ? 'Bitte einen gültigen ManaBox-Link im Format https://manabox.app/decks/… eingeben oder das Feld leeren.' : undefined
  const first = draft.commanders[0]
  const second = draft.commanders[1]
  const pairRequired = Boolean(first && !first.choice.canBeSoleCommander)
  const valid = !nameError && !manaBoxError && Boolean(first) && (!pairRequired || Boolean(second)) && identityComplete(draft.commanders)
  const canSave = valid && !busy && phase.kind !== 'uncertain' && phase.kind !== 'unavailable' && (!confirmed || dirty)

  /** Apply a draft change; dependent selections that become invalid are removed with one coherent Undo. */
  function change(update: (current: Draft) => Draft, removalNotice?: string) {
    if (frozen) return
    const next = update(draft)
    const removed: string[] = []
    let commanders = next.commanders
    if (commanders[1] && !pairCompatible(commanders[0].choice, commanders[1].choice)) { commanders = [commanders[0]]; removed.push('Zweiter Commander') }
    let companion = next.companion
    if (companion && (next.format === 'PAUPER_COMMANDER'
      || (commanders.length && identityComplete(commanders) && !companionFits(companion, commanders)))) { companion = null; removed.push('Companion') }
    setDraft({ ...next, commanders, companion })
    if (removed.length) setUndo({ draft, message: `${removed.join(' und ')} entfernt, da ${removed.length > 1 ? 'sie nicht mehr kompatibel sind' : 'er nicht mehr kompatibel ist'}.` })
    else if (removalNotice) setUndo({ draft, message: removalNotice })
    setServerErrors({})
    if (phase.kind === 'failed' || phase.kind === 'reconciled') setPhase({ kind: 'idle' })
  }
  function selectFirst(choice: CommanderChoice) {
    if (frozen) return
    if (!draft.commanders.length && commanderSection.current) anchor.current = commanderSection.current.getBoundingClientRect().top
    change(current => ({ ...current, commanders: [{ choice, chosenColor: null, art: null }, ...current.commanders.slice(1)] }))
    setSearching(value => ({ ...value, first: false, second: !choice.canBeSoleCommander }))
  }

  async function finish(acknowledgment: string, saved?: Deck) {
    setCompleted(true)
    releaseGuard()
    if (context) context.onExit(saved)
    else onFinished?.(acknowledgment, returnTo.current ?? '/decks')
  }
  function failed(error: unknown, retry: boolean) {
    if (error instanceof ApiError && error.status === 503) setPhase({ kind: 'failed', title: 'Speichern fehlgeschlagen', detail: scryfallUnavailable, retry })
    else setPhase({ kind: 'failed', title: 'Speichern fehlgeschlagen', detail: message(error), retry })
  }
  async function refreshAfterConflict(signal: AbortSignal, detail: string) {
    try {
      const decks = await (context?.list ?? listDecks)(signal)
      if (signal.aborted) return
      const fresh = decks.find(item => item.id === confirmed?.id)
      if (!fresh) { setPhase({ kind: 'unavailable' }); return }
      if (fresh.everUsed && !confirmed?.everUsed) setDraft(current => reconcileLocked(fresh, current))
      setConfirmed(fresh); setBaseline(draftOf(fresh))
      setPhase({ kind: 'failed', title: 'Deck wurde zwischenzeitlich geändert', detail: `${detail} Der aktuelle Serverstand ist geladen; prüfe deinen Entwurf und speichere erneut.`.trim(), retry: false })
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else { recheck.current = 'refresh'; setPhase({ kind: 'uncertain' }) }
    }
  }

  async function save() {
    if (pending.current || !valid) return
    const signal = operation.current!.signal
    const input = payloadOf(draft, confirmed)
    attempt.current = { draft, input }
    if (!confirmed) idempotencyKey.current ??= randomUuid()
    pending.current = true
    setPhase({ kind: 'saving' })
    try {
      const saved = confirmed ? await updateDeck(confirmed.id, input, signal)
        : await (context?.create ?? createDeck)(input, signal, idempotencyKey.current!)
      if (signal.aborted) return
      await finish(`${saved.name} wurde ${confirmed ? 'gespeichert' : 'erstellt'}.`, saved)
    } catch (error) {
      if (signal.aborted) return
      pending.current = false
      if (error instanceof ApiError && error.status === 401) { onUnauthorized(); return }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) { setPhase({ kind: 'unavailable' }); return }
      if (error instanceof ApiError && error.status === 409 && confirmed) { setPhase({ kind: 'checking' }); await refreshAfterConflict(signal, message(error)); return }
      if (error instanceof ApiError && error.status < 500 || error instanceof ApiError && error.status === 503) {
        // A confirmed rejection created nothing; a corrected draft is a new creation attempt.
        idempotencyKey.current = null
        if (error.status === 400) {
          const detail = message(error)
          if (/name/i.test(detail) && !/manabox/i.test(detail)) setServerErrors({ name: detail })
          else if (/manabox/i.test(detail) || 'manaBoxUrl' in input && /link|url/i.test(detail)) setServerErrors({ manaBoxUrl: detail })
          else if (/companion/i.test(detail)) setServerErrors({ companion: detail })
        }
        failed(error, error.status === 503)
        return
      }
      // Network failures, other 5xx and malformed successes may have committed: reconcile before any retry.
      recheck.current = 'write'
      setPhase({ kind: 'uncertain' })
    }
  }
  /** Authoritative status check after an unknown outcome; never a blind repeat of an unkeyed write. */
  async function check() {
    if (pending.current) return
    const signal = operation.current!.signal
    if (recheck.current === 'refresh') {
      // A destructive conflict whose refresh failed: retry only the authoritative read.
      pending.current = true
      setPhase({ kind: 'checking' })
      await refreshAfterConflict(signal, '')
      if (!signal.aborted) pending.current = false
      return
    }
    if (!attempt.current) return
    const { draft: attempted, input } = attempt.current
    // Edits made after the uncertain write are newer than that write and must survive its confirmation.
    const newer = keyOf(draft) !== keyOf(attempted)
    pending.current = true
    setPhase({ kind: 'checking' })
    try {
      if (!confirmed) {
        // The keyed repeat returns the deck if the first request committed; it never creates a duplicate.
        const saved = await (context?.create ?? createDeck)(input, signal, idempotencyKey.current!)
        if (signal.aborted) return
        if (!newer) { await finish(`${saved.name} wurde erstellt.`, saved); return }
        pending.current = false
        idempotencyKey.current = null
        setConfirmed(saved); setBaseline(draftOf(saved)); setDraft(current => withSavedArt(saved, current))
        setPhase({ kind: 'reconciled', detail: `${saved.name} wurde erstellt. Deine späteren Änderungen sind noch nicht gespeichert.` })
        return
      }
      const decks = await listDecks(signal)
      if (signal.aborted) return
      const fresh = decks.find(item => item.id === confirmed.id)
      if (!fresh) { pending.current = false; setPhase({ kind: 'unavailable' }); return }
      if (reflects(fresh, attempted)) {
        if (!newer) { await finish(`${fresh.name} wurde gespeichert.`, fresh); return }
        pending.current = false
        if (fresh.everUsed && !confirmed.everUsed) setDraft(current => reconcileLocked(fresh, current))
        setConfirmed(fresh); setBaseline(draftOf(fresh))
        setPhase({ kind: 'reconciled', detail: 'Der vorherige Stand wurde gespeichert. Deine späteren Änderungen sind noch nicht gespeichert.' })
        return
      }
      pending.current = false
      if (fresh.everUsed && !confirmed.everUsed) setDraft(current => reconcileLocked(fresh, current))
      setConfirmed(fresh); setBaseline(draftOf(fresh))
      setPhase({ kind: 'failed', title: 'Nicht gespeichert', detail: 'Der gespeicherte Stand wurde geprüft: Deine Änderungen wurden nicht übernommen. Dein Entwurf bleibt erhalten; du kannst erneut speichern.', retry: false })
    } catch (error) {
      if (signal.aborted) return
      pending.current = false
      if (error instanceof ApiError && error.status === 401) { onUnauthorized(); return }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) { setPhase({ kind: 'unavailable' }); return }
      if (!confirmed && error instanceof ApiError && (error.status < 500 || error.status === 503)) { idempotencyKey.current = null; failed(error, error.status === 503); return }
      setPhase({ kind: 'uncertain' })
    }
  }
  async function destroy(kind: 'archive' | 'delete') {
    if (pending.current || !confirmed) return
    const signal = operation.current!.signal
    pending.current = true
    setPhase({ kind: 'saving' })
    try {
      if (kind === 'archive') await archiveDeck(confirmed.id, signal)
      else await deleteDeck(confirmed.id, signal)
      if (signal.aborted) return
      await finish(`${confirmed.name} wurde ${kind === 'archive' ? 'archiviert' : 'gelöscht'}.`)
    } catch (error) {
      if (signal.aborted) return
      pending.current = false
      setDestructive(null)
      if (error instanceof ApiError && error.status === 401) { onUnauthorized(); return }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) { setPhase({ kind: 'unavailable' }); return }
      if (error instanceof ApiError && error.status === 409) {
        pending.current = true
        setPhase({ kind: 'checking' })
        await refreshAfterConflict(signal, message(error))
        if (!signal.aborted) pending.current = false
        return
      }
      setPhase({ kind: 'failed', title: kind === 'archive' ? 'Archivieren fehlgeschlagen' : 'Löschen fehlgeschlagen',
        detail: `${message(error)} Prüfe bei Bedarf die Deckübersicht, bevor du es erneut versuchst.`, retry: false })
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    setTouched({ name: true, manaBoxUrl: true })
    if (canSave) void save()
  }

  const archived = Boolean(confirmed?.archived)
  const actions = confirmed ? [...(!archived ? ['archive' as const] : []), ...(!confirmed.everUsed ? ['delete' as const] : [])] : []
  const hidden = phase.kind === 'unavailable'
  const restricted = frozen
  const previewCards: PreviewCard[] = draft.commanders.map((slot, index) => ({ key: `commander-${index}`, name: slot.choice.name,
    label: `Artwork für ${slot.choice.name} wählen`, selectionRef: slot.choice.selectionRef, art: slot.art }))
  const companionPreview: PreviewCard | null = draft.companion ? { key: 'companion', name: draft.companion.choice.name,
    label: `Artwork für Companion ${draft.companion.choice.name} wählen`, selectionRef: draft.companion.choice.selectionRef, art: draft.companion.art } : null
  const galleryCard = gallery && (gallery.target.kind === 'companion' ? draft.companion : draft.commanders[gallery.target.index])
  const closeGallery = () => {
    const trigger = gallery?.trigger
    setGallery(null)
    requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus() })
  }
  const chooseArt = (artwork: Artwork) => {
    if (!gallery || frozen) return
    const art = savedArt(artwork)
    const target = gallery.target
    change(current => target.kind === 'companion' ? { ...current, companion: current.companion && { ...current.companion, art } }
      : { ...current, commanders: current.commanders.map((slot, index) => index === target.index ? { ...slot, art } : slot) })
  }
  const commanderSearch = (partner?: CommanderChoice) => (query: string, signal: AbortSignal) =>
    searchCommanders(query, signal, partner?.selectionRef, draft.format)
  const identity = identityOf(draft.commanders)

  return <Stack component="section" aria-labelledby="deck-editor-heading" sx={{ gap: 3, minWidth: 0, maxWidth: 720, mx: 'auto' }}>
    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
      <IconButton aria-label="Zurück" disabled={busy} onClick={exit} sx={{ width: 48, height: 48, ml: -1.5,
        '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus' } }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><path d="M20 12H5m6-7l-7 7 7 7" /></svg>
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography ref={heading} tabIndex={-1} component="h2" variant="h4" id="deck-editor-heading"
          sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' }, '&:focus': { outline: 'none' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'interaction.focus', outlineOffset: 4 } }}>
          {context?.title ?? (confirmed ? 'Deck bearbeiten' : 'Deck erstellen')}</Typography>
        {archived && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Archiviertes Deck</Typography>}
      </Box>
      {actions.length > 0 && !hidden && <IconButton ref={overflow} disabled={restricted} aria-label="Deckaktionen" aria-haspopup="menu"
        aria-controls={menu ? 'deck-menu' : undefined} aria-expanded={Boolean(menu)} onClick={event => setMenu(event.currentTarget)} sx={{ width: 48, height: 48 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
      </IconButton>}
    </Stack>

    {phase.kind === 'reconciled' && <Alert ref={banner} tabIndex={-1} severity="info" role="status">{phase.detail}</Alert>}
    {(phase.kind === 'failed' || phase.kind === 'uncertain' || phase.kind === 'checking') && <Box>
      <Alert ref={banner} tabIndex={-1} severity={phase.kind === 'failed' ? 'error' : 'warning'} role="alert"
        sx={{ '&:focus': { outline: '2px solid', outlineColor: 'interaction.focus' }, '& .MuiAlert-message': { width: '100%' } }}>
        {phase.kind === 'checking' ? <Typography>Gespeicherter Stand wird geprüft…</Typography> : phase.kind === 'uncertain' ? <>
          <Typography sx={{ fontWeight: 700 }}>Speicherstatus unklar</Typography>
          <Typography>Die Serverantwort fehlt. Vielleicht wurde das Deck gespeichert. Bitte zuerst den gespeicherten Stand prüfen.</Typography>
          <Button variant="outlined" color="inherit" fullWidth sx={{ mt: 1.5 }} onClick={() => void check()}>Gespeicherten Stand prüfen</Button>
        </> : phase.kind === 'failed' && <>
          <Typography sx={{ fontWeight: 700 }}>{phase.title}</Typography>
          <Typography>{phase.detail}</Typography>
          {phase.retry && <Button variant="outlined" color="inherit" fullWidth sx={{ mt: 1.5 }} onClick={() => void save()}>Erneut versuchen</Button>}
        </>}
      </Alert>
      {phase.kind !== 'checking' && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
        {phase.kind === 'uncertain' ? 'Der vollständige Entwurf bleibt vorerst erhalten.' : 'Dein Entwurf und die Artworks bleiben erhalten.'}</Typography>}
    </Box>}
    {hidden && <Stack sx={{ gap: 2 }}>
      <Alert severity="error">Dieses Deck ist nicht mehr verfügbar oder du hast keinen Zugriff mehr. Deckdaten sind ausgeblendet.</Alert>
      {!context && <Button component={Link} to="/decks" color="secondary" replace>Zur Deckübersicht</Button>}
    </Stack>}

    {!hidden && <Box component="form" aria-label={deck ? `Deck ${deck.name} bearbeiten` : 'Deck erstellen'} noValidate onSubmit={submit}
      sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
      <TextField label="Deckname" name="name" fullWidth value={draft.name} disabled={restricted}
        error={Boolean((touched.name && nameError) || serverErrors.name)} helperText={(touched.name && nameError) || serverErrors.name}
        onBlur={() => setTouched(value => ({ ...value, name: true }))}
        onChange={event => { const name = event.target.value; change(current => ({ ...current, name })) }}
        slotProps={{ inputLabel: { required: false } }} />

      <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <Typography component="legend" sx={{ mb: 1, display: 'flex', gap: 1, alignItems: 'center' }}>Deckformat{gameplayLocked && <LockIcon />}</Typography>
        <Box role="radiogroup" aria-label="Deckformat" aria-readonly={gameplayLocked || undefined}
          sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, p: 0.5, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1 }}>
          {(['COMMANDER', 'PAUPER_COMMANDER'] as const).map(format => <Button key={format} role="radio" aria-checked={draft.format === format}
            aria-disabled={gameplayLocked || undefined} disabled={restricted && !gameplayLocked}
            variant={draft.format === format ? 'contained' : 'text'} color={draft.format === format ? 'primary' : 'inherit'}
            onClick={() => { if (gameplayLocked) showLocked(); else if (draft.format !== format) change(current => ({ ...current, format })) }}
            sx={{ minHeight: 44, minWidth: 0, px: 1, whiteSpace: 'normal', lineHeight: 1.2, ...(gameplayLocked ? { opacity: 0.7 } : {}),
              '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 1 } }}>
            {format === 'COMMANDER' ? 'Commander' : 'Pauper Commander'}</Button>)}
        </Box>
      </Box>

      {hasPreview && <DeckArtworkPreview commanders={previewCards} companion={companionPreview} disabled={restricted}
        onEdit={(card, trigger) => setGallery({ trigger, target: card.key === 'companion' ? { kind: 'companion' } : { kind: 'commander', index: Number(card.key.split('-')[1]) } })} />}

      <Box ref={commanderSection} sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
        {(!first || searching.first) ? <Box component="section" aria-label={second || pairRequired ? 'Commander 1' : 'Commander'} sx={{ display: 'grid', gap: 1 }}>
          <CardSearch disabled={restricted} key={`first-${draft.format}`} label={second ? 'Commander 1' : 'Commander'} name="commander-1" search={commanderSearch()} context={draft.format}
            autoFocus={Boolean(searching.first)} onUnauthorized={onUnauthorized} onSelect={selectFirst}
            onCancel={first ? () => setSearching(value => ({ ...value, first: false })) : undefined} />
          {!first && <Box sx={{ p: 2, border: '1px dashed', borderColor: 'interaction.border', borderRadius: 1, color: 'text.secondary', textAlign: 'center' }}>Kein Commander ausgewählt</Box>}
        </Box> : <CardRow label={second || pairRequired ? 'Commander 1' : 'Commander'} name={first.choice.name}
          colors={first.chosenColor ? identityOf([first]) : first.choice.colorIdentity} locked={gameplayLocked} disabled={restricted}
          onLocked={showLocked} onChange={() => setSearching(value => ({ ...value, first: true }))}>
          {first.choice.requiresChosenColor && <ChosenColor slot={first} index={0} locked={gameplayLocked} disabled={restricted} onLocked={showLocked}
            onChange={chosenColor => change(current => ({ ...current, commanders: current.commanders.map((slot, index) => index === 0 ? { ...slot, chosenColor } : slot) }))} />}
        </CardRow>}

        {first && (second && !searching.second ? <CardRow label="Commander 2" name={second.choice.name}
          colors={second.chosenColor ? identityOf([second]) : second.choice.colorIdentity} locked={gameplayLocked} disabled={restricted}
          onLocked={showLocked} onChange={() => setSearching(value => ({ ...value, second: true }))}
          onRemove={pairRequired ? undefined : () => change(current => ({ ...current, commanders: current.commanders.slice(0, 1) }), 'Zweiter Commander entfernt.')}>
          {second.choice.requiresChosenColor && <ChosenColor slot={second} index={1} locked={gameplayLocked} disabled={restricted} onLocked={showLocked}
            onChange={chosenColor => change(current => ({ ...current, commanders: current.commanders.map((slot, index) => index === 1 ? { ...slot, chosenColor } : slot) }))} />}
        </CardRow> : ((searching.second && supportsPair(first.choice)) || pairRequired) && !gameplayLocked ? <Box component="section" aria-label="Commander 2" sx={{ display: 'grid', gap: 1 }}>
          {pairRequired && !second && <Typography sx={{ color: 'text.secondary' }}>{first.choice.name} benötigt einen kompatiblen zweiten Commander.</Typography>}
          <CardSearch disabled={restricted} key={`second-${refKey(first.choice)}-${draft.format}`} label={isDoctorOnly(first.choice) ? "Doctor's companion" : 'Zweiter Commander'} name="commander-2"
            search={commanderSearch(first.choice)} context={`${refKey(first.choice)}|${draft.format}`} autoFocus={Boolean(searching.second)}
            immediate={first.choice.pairing.partnerWith.length > 0 && !second} onUnauthorized={onUnauthorized}
            onSelect={choice => {
              change(current => ({ ...current, commanders: [current.commanders[0], { choice, chosenColor: null, art: null }] }))
              setSearching(value => ({ ...value, second: false }))
            }}
            onCancel={!pairRequired || second ? () => setSearching(value => ({ ...value, second: false })) : undefined} />
        </Box> : supportsPair(first.choice) && !gameplayLocked && <Button variant="outlined" color="inherit" disabled={restricted}
          onClick={() => setSearching(value => ({ ...value, second: true }))}
          sx={{ justifyContent: 'flex-start', minHeight: 56, borderColor: 'interaction.border' }}>+ {isDoctorOnly(first.choice) ? "Doctor's companion hinzufügen" : 'Zweiten Commander hinzufügen'}</Button>)}

        {undo && <Alert severity="info" role="status" action={<Button color="inherit" variant="outlined" disabled={restricted} onClick={() => {
          if (frozen) return
          setDraft(undo.draft); setUndo(null); setSearching({})
        }}>Rückgängig</Button>} onClose={() => setUndo(null)} slotProps={{ closeButton: { 'aria-label': 'Hinweis schließen' } }}>{undo.message}</Alert>}
      </Box>

      {first && draft.format === 'COMMANDER' && (draft.companion && !searching.companion ? <CardRow label="Companion" name={draft.companion.choice.name}
        colors={draft.companion.choice.colorIdentity} locked={gameplayLocked} disabled={restricted} onLocked={showLocked}
        onChange={() => setSearching(value => ({ ...value, companion: true }))}
        onRemove={() => change(current => ({ ...current, companion: null }), 'Companion entfernt.')}>
        {serverErrors.companion && <Typography color="error" role="alert">{serverErrors.companion}</Typography>}
      </CardRow> : searching.companion && !gameplayLocked ? <Box component="section" aria-label="Companion" sx={{ display: 'grid', gap: 1 }}>
        <CardSearch disabled={restricted} label="Companion" name="companion" search={searchCompanions}
          autoFocus onUnauthorized={onUnauthorized}
          filter={identityComplete(draft.commanders) ? choice => choice.colorIdentity.every(color => identity.includes(color)) : undefined}
          hint="Nur Companions, deren Farben zur Farbidentität deiner Commander passen."
          onSelect={choice => { change(current => ({ ...current, companion: { choice, art: null } })); setSearching(value => ({ ...value, companion: false })) }}
          onCancel={() => setSearching(value => ({ ...value, companion: false }))} />
      </Box> : !gameplayLocked && <Button variant="outlined" color="inherit" disabled={restricted} onClick={() => setSearching(value => ({ ...value, companion: true }))}
        sx={{ justifyContent: 'flex-start', minHeight: 56, borderColor: 'interaction.border' }}>+ Companion hinzufügen</Button>)}

      <TextField label={<>ManaBox-Link <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>Optional</Typography></>}
        name="manaBoxUrl" fullWidth value={draft.manaBoxUrl} disabled={restricted} placeholder="https://…"
        error={Boolean((touched.manaBoxUrl && manaBoxError) || serverErrors.manaBoxUrl)}
        helperText={(touched.manaBoxUrl && manaBoxError) || serverErrors.manaBoxUrl || 'Änderungen am Deck in ManaBox können erfordern, dort die geteilte Version zu aktualisieren.'}
        onBlur={() => setTouched(value => ({ ...value, manaBoxUrl: true }))}
        slotProps={{ htmlInput: { inputMode: 'url', autoCapitalize: 'none', spellCheck: false, 'aria-label': 'ManaBox-Link' } }}
        onChange={event => { const manaBoxUrl = event.target.value; change(current => ({ ...current, manaBoxUrl })) }} />

      <Stack sx={{ gap: 1.5 }}>
        <Button variant="contained" type="submit" size="large" disabled={!canSave} sx={{ minHeight: 52 }}>
          {busy ? 'Wird gespeichert…' : phase.kind === 'uncertain' ? 'Speichern erst nach Statusprüfung' : confirmed ? 'Änderungen speichern' : 'Deck erstellen'}</Button>
        <Button variant="outlined" color="inherit" type="button" size="large" disabled={busy} onClick={exit} sx={{ minHeight: 52, borderColor: 'interaction.border' }}>Abbrechen</Button>
      </Stack>
    </Box>}

    <Snackbar open={locked} autoHideDuration={3000} onClose={() => setLocked(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert severity="info" role="status" onClose={() => setLocked(false)}>{lockedNotice}</Alert>
    </Snackbar>
    {gallery && galleryCard && <DraftArtworkGallery name={galleryCard.choice.name} reference={galleryCard.choice.selectionRef}
      current={galleryCard.art ?? { scryfallCardId: galleryCard.choice.selectionRef.scryfallCardId, artworkFaceIndex: null }}
      onSelect={chooseArt} onClose={closeGallery} onUnauthorized={onUnauthorized} />}
    <Menu id="deck-menu" anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
      {actions.map(action => <MenuItem key={action} onClick={() => { setMenu(null); setDestructive(action) }}>{action === 'archive' ? 'Archivieren' : 'Löschen'}</MenuItem>)}
    </Menu>
    {!hidden && <Dialog open={destructive !== null} onClose={() => { if (!busy) setDestructive(null) }} aria-labelledby="deck-destroy-title"
      aria-describedby={dirty ? 'deck-destroy-description deck-destroy-discard' : 'deck-destroy-description'}
      slotProps={{ transition: { onExited: () => { if (phase.kind === 'failed') banner.current?.focus(); else if (!restricted) overflow.current?.focus() } } }}>
      <DialogTitle id="deck-destroy-title">{destructive === 'delete' ? 'Deck löschen?' : 'Deck archivieren?'}</DialogTitle>
      <DialogContent>
        <DialogContentText id="deck-destroy-description">{destructive === 'delete'
          ? 'Dieses noch nie gespielte Deck wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.'
          : 'Das Deck wird dauerhaft archiviert und kann nicht wieder aktiviert werden. Es bleibt im Archiv erhalten.'}</DialogContentText>
        {dirty && <DialogContentText id="deck-destroy-discard" sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          Ungespeicherte Änderungen werden verworfen.</DialogContentText>}
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 3, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
        <Button variant="contained" autoFocus disabled={busy} onClick={() => setDestructive(null)}>Abbrechen</Button>
        <Button variant="outlined" color="inherit" disabled={busy} onClick={() => { if (destructive) void destroy(destructive) }}>
          {busy ? 'Bitte warten…' : destructive === 'delete' ? 'Deck löschen' : 'Deck archivieren'}</Button>
      </DialogActions>
    </Dialog>}
  </Stack>
}
