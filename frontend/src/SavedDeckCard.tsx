import { useId, useRef } from 'react'
import { Box, ButtonBase, Card, CardActionArea, Stack, Typography } from '@mui/material'
import type { Deck, SavedCommander, SavedCompanion } from './api'
import type { ArtworkSlot } from './ArtworkGallery'
import { CommanderArtwork } from './CommanderArtwork'
import { FullCardView } from './FullCardView'
import { ManaBoxLink } from './ManaBoxLink'
import { ManaSymbols } from './ManaSymbols'

const focusRing = { '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2, zIndex: 3 } }

/** Discreet pencil marking an artwork image as the trigger for its artwork gallery. */
export function PencilBadge({ size = 28 }: { size?: number }) {
  return <Box component="span" aria-hidden="true" sx={{ position: 'absolute', top: 4, right: 4, width: size, height: size, borderRadius: 1,
    display: 'grid', placeItems: 'center', bgcolor: 'background.paper', color: 'text.primary', border: '1px solid', borderColor: 'interaction.border', boxShadow: 1 }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" focusable="false">
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
    </svg>
  </Box>
}

function ArtButton({ card, label, onClick, sx }: {
  card: SavedCommander | SavedCompanion; label: string; onClick: (trigger: HTMLButtonElement) => void; sx: object
}) {
  return <ButtonBase aria-label={label} aria-haspopup="dialog" title={card.artist ? `Illustration: ${card.artist}` : undefined}
    onClick={event => onClick(event.currentTarget)}
    sx={{ position: 'absolute', overflow: 'hidden', borderRadius: 1, border: '1px solid', borderColor: 'divider', boxSizing: 'border-box',
      bgcolor: 'background.raised', boxShadow: 2, '&:hover': { outline: '2px solid', outlineColor: 'secondary.main' }, ...focusRing, ...sx }}>
    <CommanderArtwork key={JSON.stringify([card.artCropUrl, card.illustrationId, card.artworkFaceIndex])} commander={card} compact />
    <PencilBadge size={24} />
  </ButtonBase>
}

/**
 * Compact personal deck card (#201). Commander names are prominent and the deck name quieter. Each artwork,
 * each "Karte anzeigen" control, the ManaBox link and the text region (editor) are independent, non-nested targets.
 */
export default function SavedDeckCard({ deck, onOpen, onOpenArtwork }: {
  deck: Deck; onOpen: () => void
  onOpenArtwork?: (deck: Deck, slot: ArtworkSlot, trigger: HTMLButtonElement) => void
}) {
  const id = useId()
  const cluster = useRef<HTMLDivElement>(null)
  const paired = deck.commanders.length === 2
  const companion = deck.companion ?? null
  // Reserve stable dimensions so image loads cannot shift the card layout.
  const width = paired ? (companion ? 140 : 116) : 112
  const height = paired ? 92 : 84
  const viewers = [...deck.commanders, ...(companion ? [companion] : [])]
  return <Card component="li" sx={{ minWidth: 0 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: `${width}px minmax(0, 1fr)`, gap: 1.5, p: 1.5, alignItems: 'start' }}>
      <Stack sx={{ gap: 1, minWidth: 0 }}>
        <Box ref={cluster} sx={{ position: 'relative', width, height: height + (companion ? 12 : 0) }}>
          {deck.commanders.map((commander, index) => <ArtButton key={commander.position} card={commander}
            label={`Artwork für ${commander.name} ändern`} onClick={trigger => onOpenArtwork?.(deck, { kind: 'commander', card: commander }, trigger)}
            sx={paired ? { top: 0, left: index === 0 ? 0 : width / 2 + 2, width: width / 2 - 2, height } : { top: 0, left: 0, width: companion ? 96 : width, height: companion ? 72 : height }} />)}
          {companion && <ArtButton card={companion} label={`Artwork für Companion ${companion.name} ändern`}
            onClick={trigger => onOpenArtwork?.(deck, { kind: 'companion', card: companion }, trigger)}
            sx={{ bottom: 0, right: 0, width: 48, height: 48, zIndex: 2, boxShadow: 3 }} />}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${viewers.length}, minmax(0, 1fr))`, gap: 0.5 }}>
          {viewers.map((card, index) => <FullCardView key={index} card={card} preloadTarget={cluster} eye={viewers.length === 1 ? 'labelled' : 'icon'} />)}
        </Box>
      </Stack>
      <Box sx={{ position: 'relative', minWidth: 0, pr: 3, overflowWrap: 'anywhere' }}>
        <CardActionArea disableRipple onClick={onOpen} aria-label={`${deck.name} bearbeiten`} aria-describedby={`${id}-description`}
          sx={{ position: 'static', display: 'block', textAlign: 'left', color: 'text.primary', borderRadius: 1,
            '&::after': { content: '""', position: 'absolute', inset: -4, borderRadius: 1 },
            '&:hover::after': { bgcolor: 'interaction.hover' }, '&:active::after': { bgcolor: 'interaction.pressed' },
            '& .MuiCardActionArea-focusHighlight': { display: 'none' },
            '&.Mui-focusVisible::after, &:focus-visible::after': { outline: '3px solid', outlineColor: 'interaction.focus' } }}>
          {deck.commanders.map(commander => <Typography key={commander.position} component="span" variant="h6"
            sx={{ display: 'block', fontSize: '1.0625rem', lineHeight: 1.3 }}>{commander.name}</Typography>)}
        </CardActionArea>
        <Box id={`${id}-description`} sx={{ mt: 0.5, display: 'grid', gap: 0.75, color: 'text.secondary' }}>
          {companion && <Typography variant="body2">Companion: {companion.name}</Typography>}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 32 }}>
            <Typography variant="body2" component="span" sx={{ minWidth: 0 }}>{deck.name}</Typography>
            {/* Positioned above the stretched editor target; the link is its sibling, never nested. */}
            <Box component="span" sx={{ position: 'relative', zIndex: 1, flexShrink: 0, '& a': { width: 48, height: 48 } }}>
              <ManaBoxLink compact url={deck.manaBoxUrl} deckName={deck.name} />
            </Box>
          </Box>
          <ManaSymbols colors={deck.colorIdentity} size={22} />
          <Typography variant="body2" component="span">Deck bearbeiten</Typography>
        </Box>
        <Box aria-hidden="true" sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 28, lineHeight: 1 }}>›</Box>
      </Box>
    </Box>
  </Card>
}
