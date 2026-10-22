import { useId, useState } from 'react'
import { Box, Card, CardActionArea, Link, Stack, Typography } from '@mui/material'
import { commanderNames, magicColors, type Deck, type SavedCommander } from './api'
import { colorNames } from './deckColors'

// Keep the saved URL unchanged. Match the provider boundary for image/source hosts.
function safeArtworkUrl(value: string | null, source = false): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const allowed = source ? url.hostname === 'scryfall.com'
      : url.hostname === 'scryfall.io' || url.hostname.endsWith('.scryfall.io')
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && allowed) return value
  } catch { /* Missing or malformed saved imagery uses the same fallback. */ }
  return undefined
}

function Artwork({ commander }: { commander: SavedCommander }) {
  const [failed, setFailed] = useState(false)
  const src = safeArtworkUrl(commander.artCropUrl)
  return src && !failed
    ? <Box component="img" src={src} alt={`Illustration für ${commander.name}`} loading="lazy" decoding="async"
      onError={() => setFailed(true)} sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
    : <Box role="img" aria-label={`Keine Illustration für ${commander.name} verfügbar`}
      sx={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', p: 1, boxSizing: 'border-box', bgcolor: 'background.raised' }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>Bild nicht verfügbar</Typography>
    </Box>
}

export default function SavedDeckCard({ deck, onOpen, overview = false, showId = false }: {
  deck: Deck; onOpen: () => void; overview?: boolean; showId?: boolean
}) {
  const id = useId()
  const paired = deck.commanders.length === 2
  return <Card component="li" sx={{ containerType: 'inline-size', minWidth: 0 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'min(42%, 320px) minmax(0, 1fr)', gap: 2, p: 2,
      '@container (max-width: 560px)': { gridTemplateColumns: 'minmax(0, 1fr)' } }}>
      <Stack sx={{ gap: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        {/* Noninteractive, independent slots; #105 will supply gallery actions. */}
        <Box className="deck-artwork" sx={{ position: 'relative', isolation: 'isolate', width: '100%',
          maxWidth: paired ? 320 : 224, aspectRatio: paired ? '48 / 25' : '4 / 3',
          '@container (max-width: 560px)': { maxWidth: paired ? 256 : 180 } }}>
          {deck.commanders.map((commander, index) => <Box className="deck-artwork-slot" key={commander.position}
            sx={{ position: 'absolute', width: paired ? '55.5556%' : '100%', height: paired ? '80%' : '100%',
              left: index === 0 ? 0 : '44.4444%', top: index === 0 ? 0 : '20%', zIndex: index === 0 ? 2 : 1,
              borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden', boxSizing: 'border-box', boxShadow: 2 }}>
            <Artwork key={JSON.stringify([commander.artCropUrl, commander.illustrationId, commander.artworkFaceIndex])} commander={commander} />
          </Box>)}
        </Box>
        <Box component="ul" aria-label={`Bildnachweise für ${deck.name}`} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {deck.commanders.map(commander => {
            const source = safeArtworkUrl(commander.scryfallUri, true)
            return <Typography component="li" variant="body2" key={commander.position} sx={{ color: 'text.secondary' }}>
              {paired && `${commander.position} · `}Illustration: {commander.artist?.trim() || 'Künstlerangabe nicht verfügbar'}
              {source && <> · <Link href={source} target="_blank" rel="noopener noreferrer" color="secondary"
                aria-label={`Quelle zu Commander ${commander.position}: ${commander.name} auf Scryfall`}
                sx={{ display: 'inline-block', py: 0.5, '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>Scryfall</Link></>}
            </Typography>
          })}
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Illustrationen © Wizards of the Coast</Typography>
      </Stack>
      <CardActionArea disableRipple onClick={onOpen} aria-label={overview ? `${deck.name} bearbeiten` : undefined}
        aria-labelledby={overview ? undefined : `${id}-name`} aria-describedby={`${id}-description`}
        sx={{ display: 'block', alignSelf: 'start', minWidth: 0, p: 1, textAlign: 'left', color: 'text.primary', overflowWrap: 'anywhere',
          '&:hover': { bgcolor: 'interaction.hover' }, '&:active': { bgcolor: 'interaction.pressed' },
          '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
        <Typography component={overview ? 'h3' : 'h4'} variant="h6" id={`${id}-name`}>{deck.name}</Typography>
        <Box id={`${id}-description`}>
          <Typography>Commander: {commanderNames(deck)}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Farbidentität: {magicColors.filter(color => deck.colorIdentity.includes(color))
            .map(color => `${color} (${colorNames[color]})`).join(' · ') || 'Farblos'}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{deck.archived ? 'Archiviert – für neue Spiele nicht verfügbar'
            : deck.everUsed ? 'Bereits gespielt – Commander und Farben gesperrt' : 'Unbenutzt'}</Typography>
          {showId && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Deck-ID: {deck.id}</Typography>}
        </Box>
        {overview && <Typography component="span" sx={{ display: 'inline-block', mt: 1, color: 'secondary.main', textDecoration: 'underline' }}>Bearbeiten</Typography>}
      </CardActionArea>
    </Box>
  </Card>
}
