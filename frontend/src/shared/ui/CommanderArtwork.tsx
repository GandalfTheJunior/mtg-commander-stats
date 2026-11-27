import { useState } from 'react'
import { Box, Typography } from '@mui/material'
import { safeArtworkUrl } from './artworkUrl'


export function CommanderArtwork({ commander, compact = false }: { commander: { name: string; artCropUrl: string | null }; compact?: boolean }) {
  return <ArtworkImage key={JSON.stringify([commander.name, commander.artCropUrl])} commander={commander} compact={compact} />
}

function ArtworkImage({ commander, compact }: { commander: { name: string; artCropUrl: string | null }; compact: boolean }) {
  const [failed, setFailed] = useState(false)
  const src = safeArtworkUrl(commander.artCropUrl)
  return src && !failed
    ? <Box component="img" src={src} alt={`Illustration für ${commander.name}`} loading="lazy" decoding="async"
      onError={() => setFailed(true)} sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
    : <Box role="img" aria-label={`Keine Illustration für ${commander.name} verfügbar`}
      sx={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', p: 1, boxSizing: 'border-box', bgcolor: 'background.raised' }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>{compact ? '—' : 'Bild nicht verfügbar'}</Typography>
    </Box>
}
