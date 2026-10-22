import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { ApiError, listArtworks, listDecks, updateCommanderArtwork, type Artwork, type Deck, type SavedCommander } from './api'
import { CommanderArtwork } from './CommanderArtwork'
import { safeArtworkUrl } from './artworkUrl'

const sameArt = (left: Artwork, right: Artwork) => left.scryfallCardId === right.scryfallCardId && left.artworkFaceIndex === right.artworkFaceIndex

export default function ArtworkGallery({ deck, commander, onClose, onUpdated, onUnauthorized }: {
  deck: Deck; commander: SavedCommander; onClose: () => void; onUpdated: (deck: Deck) => void; onUnauthorized: () => void
}) {
  const id = useId()
  const [options, setOptions] = useState<Artwork[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'saving' | 'reconciling' | 'uncertain'>('ready')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(commander)
  const pending = useRef(false)
  const attempted = useRef<Artwork | null>(null)
  const checking = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => { controller.abort(); lifetime.current = null }
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    listArtworks(commander.selectionRef, controller.signal).then(artworks => {
      if (active) setOptions(artworks.filter(art => safeArtworkUrl(art.artCropUrl)))
    }).catch((cause: unknown) => {
      if (!active) return
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized()
      else setLoadError(true)
    })
    return () => { active = false; controller.abort() }
  }, [commander.selectionRef, revision, onUnauthorized])

  async function reconcile() {
    if (checking.current) return
    checking.current = true
    setPhase('reconciling')
    try {
      const decks = await listDecks(lifetime.current?.signal)
      if (!lifetime.current) return
      const updated = decks.find(item => item.id === deck.id)
      const slot = updated?.commanders.find(item => item.position === commander.position)
      if (!updated || !slot || slot.oracleId !== commander.oracleId) throw new Error('Deck changed.')
      onUpdated(updated)
      setSaved(slot)
      if (attempted.current && sameArt(slot, attempted.current)) { onClose(); return }
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
      const updated = await updateCommanderArtwork(deck.id, saved, artwork, lifetime.current?.signal)
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
  const busy = phase !== 'ready'
  return <Dialog open onClose={() => { if (!busy) onClose() }} aria-labelledby={`${id}-title`} fullWidth maxWidth="md">
    <DialogTitle id={`${id}-title`}>Artwork für {commander.name} ändern</DialogTitle>
    <DialogContent>
      <Typography sx={{ mb: 2 }}>Wähle eine Illustration. Deine Auswahl wird sofort gespeichert. Commander und Farben bleiben erhalten.</Typography>
      {phase === 'saving' && <Typography role="status">Artwork wird gespeichert…</Typography>}
      {phase === 'reconciling' && <Typography role="status">Gespeichertes Artwork wird geprüft…</Typography>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {phase === 'uncertain' && <Button onClick={() => void reconcile()}>Gespeicherten Stand prüfen</Button>}
      {loadError ? <Alert severity="error">Artworks konnten nicht geladen werden.
        <Button onClick={() => { setLoadError(false); setOptions(null); setRevision(value => value + 1) }}>Erneut laden</Button>
      </Alert> : options === null ? <Typography role="status">Artworks werden geladen…</Typography>
        : options.length === 0 ? <Typography>Keine verfügbaren Illustrationen gefunden.</Typography>
          : <Box component="ul" aria-label="Verfügbare Artworks" aria-busy={busy} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, listStyle: 'none', p: 0, m: 0, gap: 2 }}>
            {options.map((artwork, index) => <Box component="li" key={`${artwork.scryfallCardId}-${artwork.artworkFaceIndex}`}>
              <ButtonBase disabled={busy} onClick={() => void choose(artwork)}
                aria-label={`Illustration ${index + 1}${artwork.artworkFaceIndex === null ? '' : `, Seite ${artwork.artworkFaceIndex + 1}`}${artwork.artist ? ` von ${artwork.artist}` : ''} auswählen`}
                aria-pressed={sameArt(saved, artwork)}
                sx={{ display: 'block', width: '100%', textAlign: 'left', border: '2px solid', borderColor: sameArt(saved, artwork) ? 'secondary.main' : 'divider', borderRadius: 1, overflow: 'hidden',
                  '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
                <Box sx={{ aspectRatio: '4 / 3' }}><CommanderArtwork commander={{ name: commander.name, artCropUrl: artwork.artCropUrl }} /></Box>
                <Stack sx={{ p: 1 }}>
                  <Typography variant="body2">{artwork.artworkFaceIndex === null ? `Illustration ${index + 1}` : `Seite ${artwork.artworkFaceIndex + 1}`}{sameArt(saved, artwork) ? ' · Aktuell' : ''}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{artwork.artist || 'Künstlerangabe nicht verfügbar'}</Typography>
                </Stack>
              </ButtonBase>
            </Box>)}
          </Box>}
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>Illustrationen © Wizards of the Coast · Scryfall</Typography>
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Schließen</Button></DialogActions>
  </Dialog>
}
