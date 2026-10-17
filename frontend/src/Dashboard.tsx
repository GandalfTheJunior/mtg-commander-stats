import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { ApiError, listDecks, listGroups, magicColors } from './api'
import type { DashboardIntent } from './dashboardNavigation'

// Fix the locale and tie-break by ID, including case/accent-equivalent names.
const deckNames = new Intl.Collator('de', { sensitivity: 'base' })
const colorNames = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün' }
const cardAction = {
  display: 'block', textAlign: 'left', p: 2, minHeight: 72, color: 'text.primary',
  overflowWrap: 'anywhere',
  '&:hover': { bgcolor: 'interaction.hover' },
  '&:active': { bgcolor: 'interaction.pressed' },
  '&.Mui-focusVisible, &:focus-visible': {
    outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -4,
  },
} as const

function useDashboardList<T>(load: (signal?: AbortSignal) => Promise<T[]>, onUnauthorized: () => void) {
  const [state, setState] = useState<{ status: 'loading' | 'loaded' | 'error'; items: T[] }>({ status: 'loading', items: [] })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    load(controller.signal).then(items => {
      if (current) setState({ status: 'loaded', items })
    }).catch((error: unknown) => {
      if (!current) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else setState({ status: 'error', items: [] })
    })
    return () => { current = false; controller.abort() }
  }, [load, onUnauthorized, revision])
  return { ...state, refresh: () => { setState({ status: 'loading', items: [] }); setRevision(value => value + 1) } }
}

export default function Dashboard({ onUnauthorized, onOpen }: {
  onUnauthorized: () => void
  onOpen: (intent: DashboardIntent) => void
}) {
  const groups = useDashboardList(listGroups, onUnauthorized)
  const decks = useDashboardList(listDecks, onUnauthorized)
  const [expanded, setExpanded] = useState(false)
  const sortedDecks = [...decks.items].sort((a, b) => deckNames.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return (
    <Stack component="section" aria-labelledby="dashboard-heading" sx={{ gap: 4, minWidth: 0 }}>
      <Typography component="h2" variant="h4" id="dashboard-heading">Dashboard</Typography>
      <Box component="section" aria-labelledby="dashboard-groups-heading">
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography component="h3" variant="h5" id="dashboard-groups-heading">Playgroups</Typography>
          <Button color="secondary" disabled={groups.status === 'loading'} onClick={groups.refresh}>Playgroups aktualisieren</Button>
        </Stack>
        {groups.status === 'loading' && <Typography role="status">Playgroups werden geladen…</Typography>}
        {groups.status === 'error' && <Box role="alert">
          <Typography>Playgroups konnten nicht geladen werden.</Typography>
          <Button color="secondary" onClick={groups.refresh}>Playgroups erneut laden</Button>
        </Box>}
        {groups.status === 'loaded' && (groups.items.length === 0 ? <>
          <Typography sx={{ mb: 2 }}>Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.</Typography>
          <Button component={Link} to="/playgroups" variant="outlined" color="secondary">Playgroup erstellen oder beitreten</Button>
        </> : <>
          <Stack component="ul" id="dashboard-groups" aria-label="Deine Playgroups" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2 }}>
            {(expanded ? groups.items : groups.items.slice(0, 3)).map(group => <Card component="li" key={group.id}>
              <CardActionArea disableRipple sx={cardAction} onClick={() => onOpen({ kind: 'group', id: group.id })}
                aria-labelledby={`group-name-${group.id}`} aria-describedby={`group-role-${group.id}`}>
                <Typography component="h4" variant="h6" id={`group-name-${group.id}`}>{group.name}</Typography>
                <Typography id={`group-role-${group.id}`} sx={{ color: 'text.secondary' }}>
                  {group.role === 'OWNER' ? 'Gruppenersteller' : 'Mitglied'}
                </Typography>
              </CardActionArea>
            </Card>)}
          </Stack>
          {groups.items.length > 3 && <Button color="secondary" sx={{ mt: 2 }} aria-expanded={expanded}
            aria-controls="dashboard-groups" onClick={() => setExpanded(value => !value)}>
            {expanded ? 'Weniger Playgroups anzeigen' : 'Alle Playgroups anzeigen'}
          </Button>}
        </>)}
      </Box>
      <Box component="section" aria-labelledby="dashboard-decks-heading">
        <Typography component="h3" variant="h5" id="dashboard-decks-heading">Decks</Typography>
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', my: 2 }}>
          <Button variant="contained" onClick={() => onOpen({ kind: 'create-deck' })}>Deck erstellen</Button>
          <Button color="secondary" disabled={decks.status === 'loading'} onClick={decks.refresh}>Decks aktualisieren</Button>
        </Stack>
        {decks.status === 'loading' && <Typography role="status">Decks werden geladen…</Typography>}
        {decks.status === 'error' && <Box role="alert">
          <Typography>Decks konnten nicht geladen werden.</Typography>
          <Button color="secondary" onClick={decks.refresh}>Decks erneut laden</Button>
        </Box>}
        {decks.status === 'loaded' && (sortedDecks.length === 0
          ? <Typography>Noch keine Decks. Erstelle dein erstes Commander-Deck.</Typography>
          : <Stack component="ul" aria-label="Deine Decks" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2 }}>
            {sortedDecks.map(deck => <Card component="li" key={deck.id}>
              <CardActionArea disableRipple sx={cardAction} onClick={() => onOpen({ kind: 'deck', id: deck.id })}
                aria-labelledby={`deck-name-${deck.id}`} aria-describedby={`deck-description-${deck.id}`}>
                <Typography component="h4" variant="h6" id={`deck-name-${deck.id}`}>{deck.name}</Typography>
                <Box id={`deck-description-${deck.id}`}>
                  <Typography>Commander: {deck.commander}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>Farbidentität: {magicColors.filter(color => deck.colorIdentity.includes(color))
                    .map(color => `${color} (${colorNames[color]})`).join(' · ') || 'Farblos'}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{deck.archived ? 'Archiviert' : deck.everUsed ? 'Bereits gespielt' : 'Unbenutzt'}</Typography>
                  {sortedDecks.some(other => other.id !== deck.id && deckNames.compare(other.name, deck.name) === 0) &&
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Deck-ID: {deck.id}</Typography>}
                </Box>
              </CardActionArea>
            </Card>)}
          </Stack>)}
      </Box>
    </Stack>
  )
}
