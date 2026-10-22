import { commanderNames } from './api'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ApiError, listDecks, type Deck } from './api'
import { colorNames } from './deckColors'

export default function DeckManager({ onUnauthorized, onOpen }: {
  onUnauthorized: () => void; onOpen: (id?: string) => void
}) {
  const [state, setState] = useState<{ status: 'loading' | 'loaded' | 'error'; decks: Deck[] }>({ status: 'loading', decks: [] })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    listDecks(controller.signal).then(decks => {
      if (active) setState({ status: 'loaded', decks })
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else setState({ status: 'error', decks: [] })
    })
    return () => { active = false; controller.abort() }
  }, [onUnauthorized, revision])
  return <Stack component="section" aria-labelledby="decks-heading" sx={{ gap: 2, minWidth: 0 }}>
    <Typography component="h2" variant="h4" id="decks-heading">Meine Decks</Typography>
    <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
      <Button variant="contained" onClick={() => onOpen()}>Deck erstellen</Button>
      <Button color="secondary" disabled={state.status === 'loading'} onClick={() => {
        setState({ status: 'loading', decks: [] }); setRevision(value => value + 1)
      }}>Decks aktualisieren</Button>
    </Stack>
    {state.status === 'loading' && <Typography role="status">Decks werden geladen…</Typography>}
    {state.status === 'error' && <Typography role="alert">Deine Deckliste ist nicht verfügbar. Bitte erneut aktualisieren.</Typography>}
    {state.status === 'loaded' && (state.decks.length === 0 ? <Typography>Noch keine Decks.</Typography> :
      <Stack component="ul" sx={{ p: 0, m: 0, listStyle: 'none', gap: 2 }}>
        {state.decks.map(deck => <Card component="li" key={deck.id} sx={{ p: 2 }}>
          <Typography component="h3" variant="h6">{deck.name}</Typography>
          <Typography>Commander: {commanderNames(deck)}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Farbidentität: {deck.colorIdentity.map(color => `${colorNames[color]} (${color})`).join(' · ') || 'Farblos'}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>{deck.archived ? 'Archiviert – für neue Spiele nicht verfügbar' : deck.everUsed ? 'Verwendet – Commander und Farben gesperrt' : 'Unbenutzt'}</Typography>
          <Box sx={{ mt: 1 }}><Button color="secondary" onClick={() => onOpen(deck.id)} aria-label={`${deck.name} bearbeiten`}>Bearbeiten</Button></Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Deck-ID: {deck.id}</Typography>
        </Card>)}
      </Stack>)}
  </Stack>
}
