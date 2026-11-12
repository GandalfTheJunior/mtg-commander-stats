import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import type { CardFace, CommanderSelectionRef } from './api'
import { safeArtworkUrl } from './artworkUrl'
import { CommanderArtwork } from './CommanderArtwork'

export type SavedCard = {
  name: string
  selectionRef: CommanderSelectionRef
  artworkFaceIndex: number | null
  artCropUrl: string | null
  cardFaces?: CardFace[] | null
}

/** Preload only visible artwork. Retiring the view releases unfinished image requests. */
function useVisibleCardImages(card: SavedCard, target: RefObject<Element | null>, preload: 'visible' | 'immediate') {
  const urls = JSON.stringify([...new Set((card.cardFaces ?? []).map(face => safeArtworkUrl(face.imageUrl)).filter(Boolean))])
  useEffect(() => {
    const element = target.current
    const images: HTMLImageElement[] = []
    let started = false
    let active = true
    const start = () => {
      if (started || !active) return
      started = true
      for (const url of JSON.parse(urls) as string[]) {
        const image = new Image()
        image.decoding = 'async'
        image.src = url
        images.push(image)
      }
    }
    let observer: IntersectionObserver | undefined
    if (preload === 'immediate') start()
    else if (element && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return
        observer?.disconnect()
        start()
      }, { rootMargin: '0px', threshold: 0 })
      observer.observe(element)
    }
    return () => {
      active = false
      observer?.disconnect()
      for (const image of images) if (!image.complete) image.removeAttribute('src')
    }
  }, [urls, target, preload])
}

export function FullCardView({ card, artwork = false, compact = false, preloadTarget, preload = 'visible', eye, label }: {
  card: SavedCard
  /** Accessible trigger name; defaults to "Karte anzeigen: <name>". */
  label?: string
  artwork?: boolean
  compact?: boolean
  preloadTarget?: RefObject<Element | null>
  preload?: 'visible' | 'immediate'
  /** Compact eye trigger for deck cards; `labelled` additionally shows the visible "Karte anzeigen" text. */
  eye?: 'icon' | 'labelled'
}) {
  const [open, setOpen] = useState(false)
  const target = useRef<HTMLDivElement>(null)
  const name = label ?? `Karte anzeigen: ${card.name}`
  useVisibleCardImages(card, preloadTarget ?? target, preload)
  return <Box ref={target} sx={{ minWidth: 0, ...(artwork ? { width: '100%', height: '100%' } : {}) }}>
    {eye ? <Button variant="outlined" color="inherit" aria-label={name} aria-haspopup="dialog" onClick={() => setOpen(true)}
      sx={{ width: '100%', minWidth: 0, minHeight: 44, px: 0.5, gap: 0.5, borderColor: 'interaction.border', fontSize: '0.75rem', lineHeight: 1.1,
        '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
      </svg>{eye === 'labelled' && 'Karte anzeigen'}
    </Button> : artwork ? <ButtonBase aria-label={name} aria-haspopup="dialog" onClick={() => setOpen(true)}
      sx={{ width: '100%', height: '100%', '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
      <CommanderArtwork commander={card} compact={compact} />
    </ButtonBase> : <Button aria-label={name} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      Karte anzeigen: {card.name}
    </Button>}
    {open && <CardDialog key={JSON.stringify(card)} card={card} onClose={() => setOpen(false)} />}
  </Box>
}

function CardDialog({ card, onClose }: { card: SavedCard; onClose: () => void }) {
  const id = useId()
  const close = useRef<HTMLButtonElement>(null)
  const faces = card.cardFaces?.length ? card.cardFaces : [{ faceIndex: null, name: card.name, typeLine: null, oracleText: null, imageUrl: null }]
  const preferred = card.selectionRef.gameplayFaceIndex ?? card.artworkFaceIndex
  const [selected, setSelected] = useState(() => Math.max(0, faces.findIndex(face => face.faceIndex === preferred)))
  const face = faces[selected]
  return <Dialog open onClose={onClose} fullWidth maxWidth="md" scroll="paper" aria-labelledby={`${id}-title`}
    slotProps={{ transition: { onEntered: () => close.current?.focus() } }}>
    <DialogTitle id={`${id}-title`}>{card.name}</DialogTitle>
    <DialogContent>
      {faces.length > 1 && <Stack direction="row" role="group" aria-label="Kartenseite" sx={{ gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {faces.map((option, index) => <Button key={index} aria-pressed={selected === index} onClick={() => setSelected(index)}>
          {index + 1}: {option.name}
        </Button>)}
      </Stack>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
        <CardImage key={face.imageUrl} face={face} />
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-live="polite">
          <Typography component="h3" variant="h6">{face.name}</Typography>
          <Typography sx={{ mt: 1 }}>{face.typeLine || 'Typzeile nicht gespeichert.'}</Typography>
          <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>{face.oracleText === '' ? 'Diese Kartenseite hat keinen Regeltext.'
            : face.oracleText ?? 'Regeltext nicht gespeichert.'}</Typography>
        </Box>
      </Box>
    </DialogContent>
    <DialogActions><Button ref={close} autoFocus onClick={onClose}>Schließen</Button></DialogActions>
  </Dialog>
}

function CardImage({ face }: { face: CardFace }) {
  const [failed, setFailed] = useState(false)
  const src = safeArtworkUrl(face.imageUrl)
  return src && !failed
    ? <Box component="img" src={src} alt={`Vollständige Karte: ${face.name}`} onError={() => setFailed(true)}
      sx={{ display: 'block', width: '100%', height: 'auto', alignSelf: 'start' }} />
    : <Alert severity="info" sx={{ alignSelf: 'start' }}>{failed ? 'Kartenbild konnte nicht geladen werden.' : 'Kein Kartenbild gespeichert.'}</Alert>
}
