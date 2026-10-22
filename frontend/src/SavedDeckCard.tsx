import { useId, useRef, useState } from 'react'
import { Box, ButtonBase, Card, CardActionArea, Link, Stack, Typography } from '@mui/material'
import { commanderNames, magicColors, type Deck, type SavedCommander } from './api'
import { colorNames } from './deckColors'
import { safeArtworkUrl } from './artworkUrl'
import { CommanderArtwork } from './CommanderArtwork'
import ArtworkGallery from './ArtworkGallery'

const ignoreUnauthorized = () => {}

export default function SavedDeckCard({ deck, onOpen, overview = false, showId = false, onUpdated, onUnauthorized = ignoreUnauthorized }: {
  deck: Deck; onOpen: () => void; overview?: boolean; showId?: boolean
  onUpdated?: (deck: Deck) => void; onUnauthorized?: () => void
}) {
  const id = useId()
  const [slot, setSlot] = useState<SavedCommander | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const close = () => { setSlot(null); requestAnimationFrame(() => trigger.current?.focus()) }
  const paired = deck.commanders.length === 2
  return <Card component="li" sx={{ containerType: 'inline-size', minWidth: 0 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'min(42%, 320px) minmax(0, 1fr)', gap: 2, p: 2,
      '@container (max-width: 560px)': { gridTemplateColumns: 'minmax(0, 1fr)' } }}>
      <Stack sx={{ gap: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        <Box className="deck-artwork" sx={{ position: 'relative', isolation: 'isolate', width: '100%',
          maxWidth: paired ? 320 : 224, aspectRatio: paired ? '48 / 25' : '4 / 3',
          '@container (max-width: 560px)': { maxWidth: paired ? 256 : 180 } }}>
          {deck.commanders.map((commander, index) => <ButtonBase className="deck-artwork-slot" key={commander.position}
            aria-label={`Artwork für ${commander.name} ändern`} aria-haspopup="dialog"
            onClick={event => { trigger.current = event.currentTarget; setSlot(commander) }}
            sx={{ position: 'absolute', width: paired ? '55.5556%' : '100%', height: paired ? '80%' : '100%',
              left: index === 0 ? 0 : '44.4444%', top: index === 0 ? 0 : '20%', zIndex: index === 0 ? 2 : 1,
              '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2, zIndex: 3 },
              '&:hover': { outline: '2px solid', outlineColor: 'secondary.main' }, minHeight: 48, minWidth: 48,
              borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden', boxSizing: 'border-box', boxShadow: 2 }}>
            <CommanderArtwork key={JSON.stringify([commander.artCropUrl, commander.illustrationId, commander.artworkFaceIndex])} commander={commander} />
            <Box component="span" aria-hidden="true" sx={{ position: 'absolute', right: 4, bottom: 4, borderRadius: '50%',
              width: 28, height: 28, display: 'grid', placeItems: 'center', bgcolor: 'background.paper', color: 'text.primary', boxShadow: 1 }}>✎</Box>
          </ButtonBase>)}
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
    {slot && <ArtworkGallery deck={deck} commander={slot} onClose={close}
      onUpdated={updated => onUpdated?.(updated)} onUnauthorized={onUnauthorized} />}
  </Card>
}
