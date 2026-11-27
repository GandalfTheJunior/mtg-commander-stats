import { Button, IconButton } from '@mui/material'
import { safeManaBoxUrl } from './manaBoxUrl'

export function ManaBoxLink({ url, deckName, compact = false }: { url?: string | null; deckName: string; compact?: boolean }) {
  const href = safeManaBoxUrl(url)
  if (compact) return href ? <IconButton component="a" href={href} target="_blank" rel="noopener noreferrer" color="secondary"
    aria-label={`${deckName}: Deck in ManaBox ansehen (öffnet einen neuen Tab)`}
    sx={{ width: 44, height: 44, verticalAlign: 'middle', '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 5H4v15h15v-6" /></svg>
  </IconButton> : null
  return href ? <Button component="a" href={href} target="_blank" rel="noopener noreferrer" color="secondary"
    aria-label={`${deckName}: Deck in ManaBox ansehen (öffnet einen neuen Tab)`}
    sx={{ minHeight: 48, alignSelf: 'start', whiteSpace: 'normal', overflowWrap: 'anywhere',
      '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
    Deck in ManaBox ansehen
  </Button> : null
}
