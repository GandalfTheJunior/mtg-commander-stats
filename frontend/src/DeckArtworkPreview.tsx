import { useEffect, useState } from 'react'
import { Box, ButtonBase } from '@mui/material'
import { listArtworks, type CommanderSelectionRef } from './api'
import { CommanderArtwork } from './CommanderArtwork'
import { PencilBadge } from './SavedDeckCard'

export type PreviewArt = { scryfallCardId: string; artworkFaceIndex: number | null; artCropUrl: string | null }
export type PreviewCard = { key: string; name: string; label: string; selectionRef: CommanderSelectionRef; art: PreviewArt | null }

// The server initially saves the selected printing's artwork. Look it up once per selection for the preview.
const defaults = new Map<string, Promise<PreviewArt | null>>()
function defaultArtwork(reference: CommanderSelectionRef): Promise<PreviewArt | null> {
  const key = JSON.stringify(reference)
  let pending = defaults.get(key)
  if (!pending) {
    pending = listArtworks(reference).then(options => options.find(option => option.scryfallCardId === reference.scryfallCardId &&
      (reference.gameplayFaceIndex === undefined || option.artworkFaceIndex === null || option.artworkFaceIndex === reference.gameplayFaceIndex))
      ?? options.find(option => option.scryfallCardId === reference.scryfallCardId) ?? null)
      .catch(() => { defaults.delete(key); return null })
    defaults.set(key, pending)
  }
  return pending
}

function Artwork({ card }: { card: PreviewCard }) {
  const [fallback, setFallback] = useState<{ key: string; art: PreviewArt | null } | null>(null)
  const key = JSON.stringify(card.selectionRef)
  useEffect(() => {
    if (card.art) return
    let active = true
    void defaultArtwork(card.selectionRef).then(art => { if (active) setFallback({ key, art }) })
    return () => { active = false }
  }, [card.art, card.selectionRef, key])
  const art = card.art ?? (fallback?.key === key ? fallback.art : null)
  return <CommanderArtwork commander={{ name: card.name, artCropUrl: art?.artCropUrl ?? null }} />
}

/**
 * Combined editor preview (#201): one Commander fills the frame, two are equal side by side, and a genuine
 * Companion is smaller and offset below them. Dimensions are reserved so image loads never shift the form.
 */
export function DeckArtworkPreview({ commanders, companion, onEdit }: {
  commanders: PreviewCard[]; companion: PreviewCard | null; onEdit: (card: PreviewCard, trigger: HTMLButtonElement) => void
}) {
  const paired = commanders.length === 2
  const button = (card: PreviewCard, sx: object) => <ButtonBase key={card.key} aria-label={card.label} aria-haspopup="dialog"
    onClick={event => onEdit(card, event.currentTarget)}
    sx={{ position: 'absolute', overflow: 'hidden', borderRadius: 1, border: '1px solid', borderColor: 'interaction.border', boxSizing: 'border-box',
      bgcolor: 'background.raised', '&:hover': { outline: '2px solid', outlineColor: 'secondary.main' },
      '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2, zIndex: 3 }, ...sx }}>
    <Artwork card={card} />
    <PencilBadge />
  </ButtonBase>
  return <Box role="group" aria-label="Artwork-Vorschau" sx={{ position: 'relative', height: 160, p: 1, boxSizing: 'border-box',
    border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflowAnchor: 'none' }}>
    <Box sx={{ position: 'relative', height: '100%' }}>
      {commanders.map((card, index) => button(card, paired
        ? { top: 0, bottom: companion ? 16 : 0, left: index === 0 ? 0 : 'calc(50% + 4px)', width: 'calc(50% - 4px)' }
        : { top: 0, bottom: 0, left: 0, right: companion ? 40 : 0 }))}
      {companion && button(companion, { width: 64, height: 64, bottom: -4, zIndex: 2, boxShadow: 3,
        ...(paired ? { left: 'calc(50% - 32px)' } : { right: 0 }) })}
    </Box>
  </Box>
}
