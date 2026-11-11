import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { ApiError, listArtworks, listDecks, updateCommanderArtwork, updateCompanionArtwork, type Artwork, type CommanderSelectionRef,
  type Deck, type SavedCommander, type SavedCompanion } from './api'
import { CommanderArtwork } from './CommanderArtwork'
import { safeArtworkUrl } from './artworkUrl'

type Presentation = Pick<Artwork, 'scryfallCardId' | 'artworkFaceIndex'>
const sameArt = (left: Presentation, right: Presentation) => left.scryfallCardId === right.scryfallCardId && left.artworkFaceIndex === right.artworkFaceIndex

/** A saved card whose artwork a gallery changes: one Commander slot or the genuine Companion. */
export type ArtworkSlot = { kind: 'commander'; card: SavedCommander } | { kind: 'companion'; card: SavedCompanion }
const slotOf = (deck: Deck | undefined, slot: ArtworkSlot) => slot.kind === 'companion' ? deck?.companion ?? undefined
  : deck?.commanders.find(item => item.position === slot.card.position)

/** Loads the alternative illustrations of one gameplay identity and renders them as independent choices. */
function ArtworkOptions({ name, reference, current, disabled, busy, onPick, onUnauthorized }: {
  name: string; reference: CommanderSelectionRef; current: Presentation; disabled: boolean; busy: boolean
  onPick: (artwork: Artwork) => void; onUnauthorized: () => void
}) {
  const [options, setOptions] = useState<Artwork[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    listArtworks(reference, controller.signal).then(artworks => {
      if (active) setOptions(artworks.filter(art => safeArtworkUrl(art.artCropUrl)))
    }).catch((cause: unknown) => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized()
      else setLoadError(true)
    })
    return () => { active = false; controller.abort() }
  }, [reference, revision, onUnauthorized])
  if (loadError) return <Alert severity="error">Artworks konnten nicht geladen werden.
    <Button onClick={() => { setLoadError(false); setOptions(null); setRevision(value => value + 1) }}>Erneut laden</Button>
  </Alert>
  if (options === null) return <Typography role="status">Artworks werden geladen…</Typography>
  if (options.length === 0) return <Typography>Keine verfügbaren Illustrationen gefunden.</Typography>
  return <Box component="ul" aria-label="Verfügbare Artworks" aria-busy={busy} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, listStyle: 'none', p: 0, m: 0, gap: 2 }}>
    {options.map((artwork, index) => <Box component="li" key={`${artwork.scryfallCardId}-${artwork.artworkFaceIndex}`}>
      <ButtonBase disabled={disabled} onClick={() => onPick(artwork)}
        aria-label={`Illustration ${index + 1}${artwork.artworkFaceIndex === null ? '' : `, Seite ${artwork.artworkFaceIndex + 1}`}${artwork.artist ? ` von ${artwork.artist}` : ''} auswählen`}
        aria-pressed={sameArt(current, artwork)}
        sx={{ display: 'block', width: '100%', textAlign: 'left', border: '2px solid', borderColor: sameArt(current, artwork) ? 'secondary.main' : 'divider', borderRadius: 1, overflow: 'hidden',
          '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
        <Box sx={{ aspectRatio: '4 / 3' }}><CommanderArtwork commander={{ name, artCropUrl: artwork.artCropUrl }} /></Box>
        <Stack sx={{ p: 1 }}>
          <Typography variant="body2">{artwork.artworkFaceIndex === null ? `Illustration ${index + 1}` : `Seite ${artwork.artworkFaceIndex + 1}`}{sameArt(current, artwork) ? ' · Aktuell' : ''}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{artwork.artist || 'Künstlerangabe nicht verfügbar'}</Typography>
        </Stack>
      </ButtonBase>
    </Box>)}
  </Box>
}

/** Collection shortcut: each choice immediately writes one artwork-only update for that saved card. */
export default function ArtworkGallery({ deck, slot, onClose, onUpdated, onReconciled, onUnauthorized }: {
  deck: Deck; slot: ArtworkSlot; onClose: () => void; onUpdated: (deck: Deck) => void; onReconciled: (decks: Deck[]) => void; onUnauthorized: () => void
}) {
  const id = useId()
  const [phase, setPhase] = useState<'ready' | 'saving' | 'reconciling' | 'uncertain' | 'conflict'>('ready')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Presentation>(slot.card)
  const pending = useRef(false)
  const attempted = useRef<Artwork | null>(null)
  const checking = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => { controller.abort(); lifetime.current = null }
  }, [])

  async function reconcile() {
    if (checking.current) return
    checking.current = true
    setPhase('reconciling')
    try {
      const decks = await listDecks(lifetime.current?.signal)
      if (!lifetime.current) return
      const updated = decks.find(item => item.id === deck.id)
      const current = slotOf(updated, slot)
      onReconciled(decks)
      if (!updated || !current || current.oracleId !== slot.card.oracleId) {
        setPhase('conflict')
        setError(`Das Deck wurde gelöscht oder der ${slot.kind === 'companion' ? 'Companion' : 'Commander'} wurde geändert. Die Deckliste ist aktualisiert. Schließe die Galerie und öffne bei Bedarf das aktuelle Artwork.`)
        return
      }
      setSaved(current)
      if (attempted.current && sameArt(current, attempted.current)) { onClose(); return }
      setError('Der gespeicherte Stand wurde geprüft. Bitte wähle das gewünschte Artwork erneut.')
      setPhase('ready'); pending.current = false
    } catch (cause) {
      if (!lifetime.current) return
      if (cause instanceof ApiError && cause.status === 401) { onUnauthorized(); return }
      setPhase('uncertain')
      setError('Das Speicherergebnis ist unklar. Prüfe zuerst den gespeicherten Stand, bevor du erneut wählst.')
    } finally { checking.current = false }
  }
  async function choose(artwork: Artwork) {
    if (pending.current) return
    if (sameArt(saved, artwork)) { onClose(); return }
    pending.current = true; attempted.current = artwork
    setPhase('saving'); setError('')
    try {
      const updated = slot.kind === 'companion'
        ? await updateCompanionArtwork(deck.id, slot.card, artwork, lifetime.current?.signal)
        : await updateCommanderArtwork(deck.id, { ...slot.card, ...saved }, artwork, lifetime.current?.signal)
      if (!lifetime.current) return
      onUpdated(updated); onClose()
    } catch (cause) {
      if (!lifetime.current) return
      if (cause instanceof ApiError && cause.status === 401) { onUnauthorized(); return }
      if (cause instanceof ApiError && [400, 403, 404, 409, 503].includes(cause.status)) {
        setError(cause.message); setPhase('ready'); pending.current = false
      } else await reconcile()
    }
  }
  const busy = phase === 'saving' || phase === 'reconciling' || phase === 'uncertain'
  return <Dialog open onClose={() => { if (!busy) onClose() }} aria-labelledby={`${id}-title`} fullWidth maxWidth="md">
    <DialogTitle id={`${id}-title`}>Artwork für {slot.card.name} ändern</DialogTitle>
    <DialogContent>
      <Typography sx={{ mb: 2 }}>Wähle eine Illustration. Deine Auswahl wird sofort gespeichert. {slot.kind === 'companion' ? 'Der Companion bleibt' : 'Commander und Farben bleiben'} erhalten.</Typography>
      {phase === 'saving' && <Typography role="status">Artwork wird gespeichert…</Typography>}
      {phase === 'reconciling' && <Typography role="status">Gespeichertes Artwork wird geprüft…</Typography>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {phase === 'uncertain' && <Button onClick={() => void reconcile()}>Gespeicherten Stand prüfen</Button>}
      <ArtworkOptions name={slot.card.name} reference={slot.card.selectionRef} current={saved} disabled={phase !== 'ready'}
        busy={phase === 'saving' || phase === 'reconciling'} onPick={artwork => void choose(artwork)} onUnauthorized={onUnauthorized} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>Illustrationen © Wizards of the Coast · Scryfall</Typography>
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Schließen</Button></DialogActions>
  </Dialog>
}

/** Editor gallery: selecting closes the dialog and changes only the local draft; nothing is written. */
export function DraftArtworkGallery({ name, reference, current, onSelect, onClose, onUnauthorized }: {
  name: string; reference: CommanderSelectionRef; current: Presentation
  onSelect: (artwork: Artwork) => void; onClose: () => void; onUnauthorized: () => void
}) {
  const id = useId()
  return <Dialog open onClose={onClose} aria-labelledby={`${id}-title`} fullWidth maxWidth="md">
    <DialogTitle id={`${id}-title`}>Artwork für {name} wählen</DialogTitle>
    <DialogContent>
      <Typography sx={{ mb: 2 }}>Die Auswahl gilt für deinen Entwurf und wird erst mit dem Speichern des Decks übernommen.</Typography>
      <ArtworkOptions name={name} reference={reference} current={current} disabled={false} busy={false}
        onPick={artwork => { if (!sameArt(current, artwork)) onSelect(artwork); onClose() }} onUnauthorized={onUnauthorized} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>Illustrationen © Wizards of the Coast · Scryfall</Typography>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Schließen</Button></DialogActions>
  </Dialog>
}
