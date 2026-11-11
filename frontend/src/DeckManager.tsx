import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, listDecks, type Deck } from './api'
import { collectionOverflows } from './collectionLayout'
import SavedDeckCard from './SavedDeckCard'
import { useArtworkGallery } from './useArtworkGallery'

/** Collection context retained in App memory while the owner visits the editor (#201). */
export type CollectionMemory = { query: string; archiveOpen: boolean; searchVisible: boolean; scrollY: number }

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const byName = (left: Deck, right: Deck) => {
  const name = left.name.localeCompare(right.name, 'de', { sensitivity: 'base' })
  return name || (left.id.toLowerCase() < right.id.toLowerCase() ? -1 : left.id.toLowerCase() > right.id.toLowerCase() ? 1 : 0)
}
const matches = (deck: Deck, needle: string) => !needle || [deck.name, ...deck.commanders.map(card => card.name)]
  .some(text => text.toLocaleLowerCase('de').includes(needle))

export default function DeckManager({ onUnauthorized, onOpen, takeMemory }: {
  onUnauthorized: () => void
  onOpen: (id: string | undefined, memory: CollectionMemory) => void
  /** Returns and forgets the context saved when the editor was opened from this collection. */
  takeMemory?: () => CollectionMemory | null
}) {
  // Restore once per mount; the snapshot belongs to one return from the editor.
  const [restored] = useState(() => takeMemory?.() ?? null)
  const [state, setState] = useState<{ status: 'loading' | 'loaded' | 'error'; decks: Deck[] }>({ status: 'loading', decks: [] })
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState(restored?.query ?? '')
  const [archiveOpen, setArchiveOpen] = useState(restored?.archiveOpen ?? false)
  // A manual toggle while searching applies only to that search.
  const [searchArchive, setSearchArchive] = useState<boolean | null>(null)
  const [searchVisible, setSearchVisible] = useState(restored?.searchVisible ?? false)
  const list = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const archiveId = useId()

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    listDecks(controller.signal).then(decks => {
      if (active) setState({ status: 'loaded', decks })
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      // Keep valid content from an earlier load instead of presenting an empty collection.
      else setState(previous => ({ status: previous.decks.length ? 'loaded' : 'error', decks: previous.decks }))
    })
    return () => { active = false; controller.abort() }
  }, [onUnauthorized, revision])
  const { openArtwork, gallery } = useArtworkGallery({
    onUnauthorized,
    onUpdated: updated => setState(previous => ({ ...previous, decks: previous.decks.map(item => item.id === updated.id ? updated : item) })),
    onReconciled: decks => setState({ status: 'loaded', decks }),
    fallbackId: 'decks-heading',
  })

  const sorted = useMemo(() => [...state.decks].sort(byName), [state.decks])
  const active = sorted.filter(deck => !deck.archived)
  const archived = sorted.filter(deck => deck.archived)
  const archivedCount = archived.length
  const needle = query.trim().toLocaleLowerCase('de')
  const shownActive = active.filter(deck => matches(deck, needle))
  const shownArchived = archived.filter(deck => matches(deck, needle))
  const searching = needle !== ''
  const archiveExpanded = searching ? searchArchive ?? shownArchived.length > 0 : archiveOpen
  const loaded = state.status === 'loaded'

  // Search becomes available only when the complete unfiltered collection would overflow the viewport.
  useLayoutEffect(() => {
    if (searchVisible || !loaded || searching) return
    const measure = () => {
      if (list.current && collectionOverflows(list.current, archiveOpen ? 0 : archivedCount)) setSearchVisible(true)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [searchVisible, loaded, searching, archiveOpen, archivedCount, state.decks])
  useLayoutEffect(() => {
    if (!loaded || scrolled.current) return
    scrolled.current = true
    if (restored?.scrollY) window.scrollTo(0, restored.scrollY)
  }, [loaded, restored])

  function open(id?: string) {
    onOpen(id, { query, archiveOpen, searchVisible, scrollY: window.scrollY })
  }
  function changeQuery(value: string) {
    if (!value.trim()) setSearchArchive(null)
    setQuery(value)
  }
  const card = (deck: Deck) => <SavedDeckCard key={deck.id} deck={deck} onOpenArtwork={openArtwork} onOpen={() => open(deck.id)} />

  return <Stack component="section" aria-labelledby="decks-heading" sx={{ gap: 2, minWidth: 0, maxWidth: 720, mx: 'auto' }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
      <Typography component="h2" variant="h4" id="decks-heading" tabIndex={-1}>Meine Decks</Typography>
      <IconButton aria-label="Deck erstellen" color="secondary" onClick={() => open()}
        sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1, flexShrink: 0,
          '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
        <Box component="span" aria-hidden="true" sx={{ fontSize: 28, lineHeight: 1 }}>+</Box>
      </IconButton>
    </Stack>
    {searchVisible && loaded && <TextField type="search" value={query} onChange={event => changeQuery(event.target.value)}
      placeholder="Deckname oder Commander suchen" fullWidth
      slotProps={{ htmlInput: { 'aria-label': 'Deckname oder Commander suchen' }, input: { startAdornment: <InputAdornment position="start">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></svg>
      </InputAdornment> } }} />}

    {state.status === 'loading' && <Stack component="ul" aria-busy="true" aria-label="Decks werden geladen" sx={{ p: 0, m: 0, listStyle: 'none', gap: 2 }}>
      <Typography role="status" sx={visuallyHidden}>Decks werden geladen…</Typography>
      {[0, 1, 2].map(index => <Card component="li" key={index} aria-hidden="true" sx={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 1.5, p: 1.5 }}>
        <Skeleton variant="rounded" width={112} height={84} />
        <Stack sx={{ gap: 1 }}><Skeleton width="80%" height={28} /><Skeleton width="50%" /><Skeleton width="40%" /></Stack>
      </Card>)}
    </Stack>}

    {state.status === 'error' && <Alert severity="error" role="alert" action={<Button color="inherit" onClick={() => {
      setState({ status: 'loading', decks: [] }); setRevision(value => value + 1)
    }}>Erneut versuchen</Button>}>Deine Decks konnten nicht geladen werden.</Alert>}

    {loaded && state.decks.length === 0 && <Stack sx={{ gap: 2, alignItems: 'start', py: 2 }}>
      <Typography>Noch keine Decks vorhanden. Lege dein erstes Deck an, um es in Spielen auszuwählen.</Typography>
      <Button variant="contained" onClick={() => open()}>Erstes Deck erstellen</Button>
    </Stack>}

    {loaded && state.decks.length > 0 && <Box ref={list} sx={{ display: 'grid', gap: 2 }}>
      {searching && shownActive.length + shownArchived.length === 0 ? <Box role="status" sx={{ py: 2 }}>
        <Typography>Keine passenden Decks gefunden</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Suche nach einem Decknamen oder Commander.</Typography>
      </Box> : <>
        <Box component="section" aria-labelledby="active-decks-heading">
          <Typography component="h3" variant="h6" id="active-decks-heading" sx={{ mb: 1 }}>Aktive Decks</Typography>
          {active.length === 0 ? <Typography sx={{ color: 'text.secondary' }}>Keine aktiven Decks vorhanden.</Typography>
            : shownActive.length === 0 ? <Typography sx={{ color: 'text.secondary' }}>Keine passenden aktiven Decks.</Typography>
              : <Stack component="ul" aria-label="Aktive Decks" sx={{ p: 0, m: 0, listStyle: 'none', gap: 2 }}>{shownActive.map(card)}</Stack>}
        </Box>
        {archived.length > 0 && (!searching || shownArchived.length > 0) && <Box component="section" aria-label="Archivierte Decks">
          <Card>
            <ButtonBase aria-expanded={archiveExpanded} aria-controls={archiveId} onClick={() => {
              if (searching) setSearchArchive(!archiveExpanded); else setArchiveOpen(value => !value)
            }} sx={{ width: '100%', minHeight: 56, px: 2, gap: 2, justifyContent: 'flex-start', textAlign: 'left',
              '&:hover': { bgcolor: 'interaction.hover' },
              '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4" /></svg>
              <Typography component="h3" variant="h6" sx={{ flex: 1 }}>Archivierte Decks</Typography>
              <Box component="span" aria-hidden="true" sx={{ fontSize: 28, lineHeight: 1, transform: archiveExpanded ? 'rotate(90deg)' : 'none' }}>›</Box>
            </ButtonBase>
          </Card>
          <Box id={archiveId} hidden={!archiveExpanded} sx={{ mt: 2 }}>
            {archiveExpanded && <Stack component="ul" aria-label="Archivierte Decks" sx={{ p: 0, m: 0, listStyle: 'none', gap: 2 }}>{shownArchived.map(card)}</Stack>}
          </Box>
        </Box>}
      </>}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Illustrationen © Wizards of the Coast · Scryfall</Typography>
    </Box>}
    {gallery}
  </Stack>
}
