import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ApiError, listDecks, type Deck } from './api'
import SavedDeckCard from './SavedDeckCard'
import { useArtworkGallery } from './useArtworkGallery'

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
  const { openArtwork, gallery } = useArtworkGallery({
    onUnauthorized,
    onUpdated: updated => setState(previous => ({ ...previous, decks: previous.decks.map(item => item.id === updated.id ? updated : item) })),
    onReconciled: decks => setState({ status: 'loaded', decks }),
    fallbackId: 'decks-heading',
  })
  return <Stack component="section" aria-labelledby="decks-heading" sx={{ gap: 2, minWidth: 0 }}>
    <Typography component="h2" variant="h4" id="decks-heading" tabIndex={-1}>Meine Decks</Typography>
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
        {state.decks.map(deck => <SavedDeckCard key={deck.id} deck={deck} overview showId onOpenArtwork={openArtwork} onOpen={() => onOpen(deck.id)} />)}
      </Stack>)}
    {gallery}
  </Stack>
}
