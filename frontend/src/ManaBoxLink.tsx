import { Button } from '@mui/material'
import { safeManaBoxUrl } from './manaBoxUrl'

export function ManaBoxLink({ url, deckName }: { url?: string | null; deckName: string }) {
  const href = safeManaBoxUrl(url)
  return href ? <Button component="a" href={href} target="_blank" rel="noopener noreferrer" color="secondary"
    aria-label={`${deckName}: Deck in ManaBox ansehen (öffnet einen neuen Tab)`}
    sx={{ minHeight: 48, alignSelf: 'start', whiteSpace: 'normal', overflowWrap: 'anywhere',
      '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
    Deck in ManaBox ansehen
  </Button> : null
}
