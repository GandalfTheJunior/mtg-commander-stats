import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { Link } from 'react-router'
import { ApiError, getGroupStatistics, recentGames, type GamePreview, type GroupStatistics } from './api'
import CompactGameCard from './CompactGameCard'
import { groupUrl } from './groupNavigation'
import { spotlightPlayers } from './statisticsOrder'

export const archiveEmpty = 'Die Archive erscheinen unvollständig… Absolviert mehr Spiele, um eure Statistiken zu sehen.'
export const gamesEmpty = 'Tamiyo hat noch keine Aufzeichnungen angefertigt. Sobald ihr ein paar Runden gespielt habt, seht ihr hier eure Historie.'
type State<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

// GroupPage is keyed by route and session. Both reads retire together on access
// denial, and neither obsolete success nor error may affect the next lifetime.
export default function GroupOverview({ groupId, onAccessError }: { groupId: string; onAccessError: (error: unknown) => void }) {
  const [games, setGames] = useState<State<GamePreview[]>>({ status: 'loading' })
  const [statistics, setStatistics] = useState<State<GroupStatistics>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const accessError = useRef(onAccessError)
  useEffect(() => { accessError.current = onAccessError })
  useEffect(() => {
    const controller = new AbortController()
    async function load<T>(read: (id: string, signal?: AbortSignal) => Promise<T>, update: (state: State<T>) => void) {
      try {
        const data = await read(groupId, controller.signal)
        if (!controller.signal.aborted) update({ status: 'ready', data })
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          controller.abort()
          accessError.current(error)
        } else update({ status: 'error' })
      }
    }
    void load(recentGames, setGames)
    void load(getGroupStatistics, setStatistics)
    return () => controller.abort()
  }, [groupId, revision])
  function retry() {
    setGames({ status: 'loading' })
    setStatistics({ status: 'loading' })
    setRevision(value => value + 1)
  }
  const players = statistics.status === 'ready' ? spotlightPlayers(statistics.data.players) : []
  const reportUrl = `${groupUrl(groupId, 'statistics')}/reports/players`
  return <Stack sx={{ gap: 3, minWidth: 0 }}>
    <Button component={Link} to={`${groupUrl(groupId, 'games')}/new`} variant="contained" sx={{ width: '100%' }}>Spiel erfassen</Button>
    <Box component="section" aria-labelledby="spotlight-heading" sx={{ minWidth: 0 }}>
      <Typography component="h3" variant="h5" id="spotlight-heading" sx={{ mb: 2 }}>Statistik im Fokus</Typography>
      <Card>
        <CardActionArea component={Link} to={reportUrl} sx={{ p: 2, display: 'block', textAlign: 'left', color: 'text.primary', textDecoration: 'none',
          '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
          <Typography component="h4" variant="h6" sx={{ mb: 2, overflowWrap: 'anywhere' }}>Gesamtsiegquote pro Spieler</Typography>
          {statistics.status === 'loading' && <Typography role="status">Statistiken werden geladen…</Typography>}
          {statistics.status === 'error' && <Typography role="alert">Die Spielerstatistik konnte nicht geladen werden.</Typography>}
          {statistics.status === 'ready' && (players.length ? <Stack component="ul" aria-label="Gesamtsiegquoten" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {players.map(player => <Stack component="li" key={player.userId} direction="row" sx={{ gap: 2, py: 1, justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{player.username}</Typography>
              <Typography variant="numeric" sx={{ flexShrink: 0 }}>{percent.format(player.winRatePercent)} %</Typography>
            </Stack>)}
          </Stack> : <Typography>{archiveEmpty}</Typography>)}
          <Typography sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider', color: 'secondary.main' }}>Alle Spielerstatistiken ansehen ›</Typography>
        </CardActionArea>
      </Card>
    </Box>
    <Box component="section" aria-labelledby="recent-games-heading" sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography component="h3" variant="h5" id="recent-games-heading" sx={{ minWidth: 0, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Letzte Spiele</Typography>
        <Button component={Link} to={groupUrl(groupId, 'games')} size="small" color="secondary" sx={{ maxWidth: '50%', flexShrink: 0, textAlign: 'center' }}>Alle Spiele anzeigen</Button>
      </Stack>
      {games.status === 'loading' && <Typography role="status">Letzte Spiele werden geladen…</Typography>}
      {games.status === 'error' && <Alert severity="error">Die letzten Spiele konnten nicht geladen werden.</Alert>}
      {games.status === 'ready' && (games.data.length ? <Stack component="ol" aria-label="Letzte Spiele" sx={{ listStyle: 'none', p: 0, m: 0, gap: 1, minWidth: 0 }}>
        {games.data.map(game => <Box component="li" key={game.id} sx={{ minWidth: 0 }}><CompactGameCard game={game} /></Box>)}
      </Stack> : <Card sx={{ p: 3 }}><Typography>{gamesEmpty}</Typography></Card>)}
    </Box>
    {(games.status === 'error' || statistics.status === 'error') && <Button color="secondary" onClick={retry}>Übersicht erneut laden</Button>}
  </Stack>
}
