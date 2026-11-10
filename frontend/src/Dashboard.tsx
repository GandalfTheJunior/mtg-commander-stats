import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { ApiError, listGroups } from './api'
import type { DashboardIntent } from './dashboardNavigation'
import { groupSuffixes } from './groupSuffixes'

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
  const suffixes = groupSuffixes(groups.items)
  return (
    <Stack component="section" aria-labelledby="dashboard-heading" sx={{ gap: 4, minWidth: 0 }}>
      <Typography component="h2" variant="h4" id="dashboard-heading">Dashboard</Typography>
      <Box component="section" aria-labelledby="dashboard-groups-heading">
        <Stack direction="row" useFlexGap sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography component="h3" variant="h5" id="dashboard-groups-heading" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, minWidth: 0 }}>Meine Playgroups</Typography>
          {groups.status === 'loaded' && groups.items.length > 3 && <Button component={Link} to="/playgroups" size="small" color="secondary"
            sx={{ ml: 'auto', maxWidth: '50%', flexShrink: 0, textAlign: 'center' }}>Alle Playgroups anzeigen</Button>}
        </Stack>
        {groups.status === 'loading' && <Typography role="status">Playgroups werden geladen…</Typography>}
        {groups.status === 'error' && <Box role="alert">
          <Typography>Playgroups konnten nicht geladen werden.</Typography>
          <Button color="secondary" onClick={groups.refresh}>Playgroups erneut laden</Button>
        </Box>}
        {groups.status === 'loaded' && <>
          {groups.items.length === 0 ? <Typography>Du bist noch keiner Playgroup beigetreten. Erstelle eine eigene Playgroup oder öffne einen Einladungslink.</Typography> :
            <Stack component="ul" aria-label="Deine Playgroups" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2 }}>
              {groups.items.slice(0, 3).map(group => <Card component="li" key={group.id} sx={{ minWidth: 0 }}>
                <CardActionArea disableRipple sx={cardAction} onClick={() => onOpen({ kind: 'group', id: group.id })}
                  aria-labelledby={`group-name-${group.id}`} aria-description={`Übersicht, ${group.id}`}>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography component="span" variant="h6" id={`group-name-${group.id}`} sx={{ flex: 1, minWidth: 0 }}>
                      {group.name}{suffixes.has(group.id) && <> <Typography component="span" variant="body2"
                        sx={{ display: 'inline-block', maxWidth: '100%', color: 'text.secondary' }}>ID: {suffixes.get(group.id)}</Typography></>}
                    </Typography>
                    <Box component="span" aria-hidden="true" sx={{ flexShrink: 0, fontSize: 32, lineHeight: 1, color: 'text.secondary' }}>›</Box>
                  </Box>
                </CardActionArea>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 2 }}>
                  <Button component={Link} to={`/playgroups/${encodeURIComponent(group.id)}/games/new`} variant="contained"
                    aria-label={`Spiel erfassen: ${group.name}, ${group.id}`}>Spiel erfassen</Button>
                </Box>
              </Card>)}
            </Stack>}
          <IconButton component={Link} to="/playgroups?create=1" aria-label="Playgroup erstellen" color="secondary"
            sx={{ mt: 2, minWidth: 44, minHeight: 44, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1,
              '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
            <Box component="span" aria-hidden="true" sx={{ fontSize: 28, lineHeight: 1 }}>+</Box>
          </IconButton>
        </>}
      </Box>
    </Stack>
  )
}
