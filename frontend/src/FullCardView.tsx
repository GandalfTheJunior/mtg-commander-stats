import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Box, Button, ButtonBase, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, Typography } from '@mui/material'
import type { CardFace, CommanderSelectionRef } from './api'
import { safeArtworkUrl } from './artworkUrl'
import { CommanderArtwork } from './CommanderArtwork'
import { CloseIcon } from './MembersDirectory'

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

/** Scryfall `normal` images are 488×680; the card is sized by this ratio so it always fits uncropped. */
const CARD_RATIO = 488 / 680
/** Half of the approved ~350 ms card turn; the face changes at the half-turn (#239 §4). */
const HALF_TURN_MS = 175
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function FlipIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 12a8 8 0 0 0-14.2-5" /><path d="M5 3v4h4" /><path d="M4 12a8 8 0 0 0 14.2 5" /><path d="M19 21v-4h-4" />
  </svg>
}

/**
 * Approved #239 layout: header (title + top-right X, no footer close), optional right-aligned flip row, the complete
 * card image sized to the visible body height, then real name/type/rules text. Wide screens put the text to the right.
 * A future #235 token section belongs below the rules text in the same text column.
 */
function CardDialog({ card, onClose }: { card: SavedCard; onClose: () => void }) {
  const id = useId()
  const close = useRef<HTMLButtonElement>(null)
  const turner = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const faces = card.cardFaces?.length ? card.cardFaces : [{ faceIndex: null, name: card.name, typeLine: null, oracleText: null, imageUrl: null }]
  const preferred = card.selectionRef.gameplayFaceIndex ?? card.artworkFaceIndex
  const [selected, setSelected] = useState(() => Math.max(0, faces.findIndex(face => face.faceIndex === preferred)))
  const face = faces[selected]
  // Front/back only for two separately displayable physical sides. Adventure/split faces share one image and keep
  // name-based selection of their rules faces instead of a misleading physical card turn.
  const images = faces.map(option => safeArtworkUrl(option.imageUrl))
  const flippable = faces.length === 2 && !!images[0] && !!images[1] && images[0] !== images[1]
  const selectable = faces.length > 1 && !flippable
  useEffect(() => () => { animation.current?.cancel(); animation.current = null }, [])

  const flip = () => {
    if (animation.current) return // A turn is already running; ignore repeated activation.
    const next = 1 - selected
    const element = turner.current
    if (!element || typeof element.animate !== 'function' || prefersReducedMotion()) { setSelected(next); return }
    const timing = { duration: HALF_TURN_MS }
    const out = element.animate([{ transform: 'perspective(1600px) rotateY(0deg)' }, { transform: 'perspective(1600px) rotateY(90deg)' }],
      { ...timing, easing: 'ease-in', fill: 'forwards' })
    animation.current = out
    out.onfinish = () => {
      // Swap image and text together while the card is edge-on, then turn the new face in (never mirrored).
      flushSync(() => setSelected(next))
      out.cancel()
      const back = element.animate([{ transform: 'perspective(1600px) rotateY(-90deg)' }, { transform: 'perspective(1600px) rotateY(0deg)' }],
        { ...timing, easing: 'ease-out' })
      animation.current = back
      back.onfinish = () => { animation.current = null }
    }
  }

  // The scroll body is a size container, so 100cqh is its visible height below the (possibly wrapped) header.
  // Reserve the flip row so the whole card fits without initial scrolling; 9rem keeps tiny landscape views legible.
  const reserved = flippable || selectable ? 72 : 16
  const cardWidth = `max(9rem, calc((100cqh - ${reserved}px) * ${CARD_RATIO}))`
  return <Dialog open onClose={onClose} fullWidth maxWidth="md" scroll="paper" aria-labelledby={`${id}-title`}
    slotProps={{
      transition: { onEntered: () => close.current?.focus() },
      paper: { sx: { m: { xs: 1, sm: 2 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' },
        height: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' }, maxHeight: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' } } },
    }}>
    <DialogTitle id={`${id}-title`} sx={{ pr: 8, pl: { xs: 2, sm: 3 }, overflowWrap: 'anywhere', borderBottom: '1px solid', borderColor: 'divider' }}>
      {card.name}
    </DialogTitle>
    <IconButton ref={close} aria-label="Schließen" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}>
      <CloseIcon />
    </IconButton>
    <DialogContent sx={{ containerType: 'size', px: { xs: 2, sm: 3 }, pt: '16px !important' }}>
      <Box sx={{ display: 'grid', gap: { xs: 2, sm: 3 }, alignItems: 'start',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: `min(55%, ${cardWidth}) minmax(0, 1fr)` } }}>
        <Box sx={{ width: { xs: `min(100%, ${cardWidth})`, sm: '100%' }, mx: { xs: 'auto', sm: 0 }, minWidth: 0 }}>
          {flippable && <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{selected === 0 ? 'Vorderseite' : 'Rückseite'}</Typography>
            <IconButton aria-label={selected === 0 ? 'Rückseite anzeigen' : 'Vorderseite anzeigen'} onClick={flip}
              sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'interaction.border' }}>
              <FlipIcon />
            </IconButton>
          </Stack>}
          {selectable && <Stack direction="row" role="group" aria-label="Kartenseite" sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', mb: 1 }}>
            {faces.map((option, index) => <Button key={index} aria-pressed={selected === index} onClick={() => setSelected(index)}>
              {index + 1}: {option.name}
            </Button>)}
          </Stack>}
          <Box ref={turner} sx={{ backfaceVisibility: 'hidden' }}>
            <CardImage key={face.imageUrl} face={face} />
          </Box>
        </Box>
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-live="polite">
          <Typography component="h3" variant="h6">{face.name}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>{face.typeLine || 'Typzeile nicht gespeichert.'}</Typography>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>{face.oracleText === '' ? 'Diese Kartenseite hat keinen Regeltext.'
            : face.oracleText ?? 'Regeltext nicht gespeichert.'}</Typography>
        </Box>
      </Box>
    </DialogContent>
  </Dialog>
}

function CardImage({ face }: { face: CardFace }) {
  const [failed, setFailed] = useState(false)
  const src = safeArtworkUrl(face.imageUrl)
  return src && !failed
    ? <Box component="img" src={src} alt={`Vollständige Karte: ${face.name}`} onError={() => setFailed(true)}
      sx={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '488 / 680', objectFit: 'contain' }} />
    : <Alert severity="info">{failed ? 'Kartenbild konnte nicht geladen werden.' : 'Kein Kartenbild gespeichert.'}</Alert>
}
