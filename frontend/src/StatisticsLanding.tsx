import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Box, Button, Card, CardActionArea, Chip, Divider, Stack, Typography } from '@mui/material'
import type { GroupStatistics } from './api'
import { publicName } from './gamePresentation'
import { countsText, formatRate, useGroupStatistics } from './statisticsData'
import { deckIdentity, distinctSuffix, ownerLabel, playerLabel, sectionGames, spotlightPlayers, teaserDecks, teaserSection } from './statisticsOrder'
import { originState, statisticsUrl, useStatisticsMemory, type StatisticsReport } from './statisticsState'
import { CommanderTitle, LoadFeedback, RateBar, SeatLine, SkeletonLines } from './StatisticsParts'

type Teaser = { report: StatisticsReport; category: string; title: string; empty: string; content: (data: GroupStatistics) => ReactNode }
const teasers: Teaser[] = [
  { report: 'players', category: 'Spieler', title: 'Gesamtsiegquote pro Spieler', empty: 'Noch keine Spielerstatistiken.',
    content: data => data.players.length > 0 && <PlayerRows data={data} /> },
  { report: 'decks', category: 'Decks', title: 'Gesamtsiegquote pro Deck', empty: 'Noch keine Deckstatistiken.',
    content: data => data.decks.length > 0 && <DeckRows data={data} /> },
  { report: 'starting-seats', category: 'Gruppe', title: 'Siegrate nach Startplatz', empty: 'Noch keine Startplätze aufgezeichnet.',
    content: data => teaserSection(data.startPositions) && <SeatRows data={data} /> },
]

/** #197 landing: three fixed, always unfiltered teasers, each opening its own report. */
export default function StatisticsLanding({ groupId, onAccessError }: { groupId: string; onAccessError: (error: unknown) => void }) {
  const memory = useStatisticsMemory(groupId)
  const { load, retry } = useGroupStatistics(groupId, undefined, onAccessError)
  return <Stack component="section" aria-labelledby="statistics-landing-heading" sx={{ gap: 2, minWidth: 0 }}>
    <Box>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h3" variant="h5" id="statistics-landing-heading" sx={{ minWidth: 0 }}>Statistiken</Typography>
        <Button component={Link} to={statisticsUrl(groupId, 'chooser')} variant="outlined" color="secondary" size="small"
          sx={{ flexShrink: 0, maxWidth: '60%', textAlign: 'center' }}>
          Alle Statistiken anzeigen<Box component="span" aria-hidden="true" sx={{ ml: 1 }}>›</Box>
        </Button>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Drei feste Einblicke in eure Playgroup</Typography>
    </Box>
    <LoadFeedback load={load} onRetry={retry} />
    <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 2, alignItems: 'stretch',
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' } }}>
      {teasers.map(teaser => <TeaserCard key={teaser.report} teaser={teaser} to={statisticsUrl(groupId, teaser.report)} onOpen={memory.resetFilter}>
        {load.status === 'loading' ? <SkeletonLines /> : load.status === 'error'
          ? <Typography sx={{ color: 'text.secondary' }}>Derzeit nicht verfügbar.</Typography>
          : teaser.content(load.data) || <Typography sx={{ color: 'text.secondary' }}>{teaser.empty}</Typography>}
      </TeaserCard>)}
    </Box>
  </Stack>
}

function TeaserCard({ teaser, to, onOpen, children }: { teaser: Teaser; to: string; onOpen: () => void; children: ReactNode }) {
  const titleId = useId()
  return <Card component="li" sx={{ minWidth: 0, display: 'flex' }}>
    <CardActionArea component={Link} to={to} state={originState({ kind: 'landing' })} onClick={onOpen} aria-labelledby={titleId}
      sx={{ p: 2, display: 'block', textAlign: 'left', color: 'text.primary', textDecoration: 'none', alignSelf: 'stretch',
        '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>{teaser.category}</Typography>
      <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography component="h4" variant="h6" id={titleId} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{teaser.title}</Typography>
        <Box component="span" aria-hidden="true" sx={{ fontSize: '1.25rem' }}>›</Box>
      </Stack>
      <Divider sx={{ my: 1.5 }} />
      {children}
    </CardActionArea>
  </Card>
}

const rowList = { listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 } as const
function PlayerRows({ data }: { data: GroupStatistics }) {
  const players = spotlightPlayers(data.players)
  if (!players.length) return null
  // Namesakes keep a short stable suffix: the whole card is one link, so no disclosure button nests here.
  const people = players.map(player => ({ userId: player.userId, username: playerLabel(player) }))
  return <Stack component="ul" aria-label="Spieler mit den meisten Partien" sx={rowList}>
    {players.map((player, index) => <Box component="li" key={player.userId} sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{publicName(people[index], people)}</Typography>
        <Typography variant="numeric" sx={{ fontWeight: 600, flexShrink: 0 }}>{formatRate(player.winRatePercent)}</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>{countsText(player.games, player.wins)}</Typography>
      <RateBar value={player.winRatePercent} />
    </Box>)}
  </Stack>
}

function DeckRows({ data }: { data: GroupStatistics }) {
  const decks = teaserDecks(data.decks)
  if (!decks.length) return null
  const identities = decks.map(deckIdentity)
  return <Stack component="ul" aria-label="Decks mit der höchsten Siegrate" sx={rowList}>
    {decks.map((deck, index) => {
      const peers = decks.filter((_, other) => identities[other] === identities[index]).map(peer => peer.deckId)
      return <Box component="li" key={deck.deckId} sx={{ minWidth: 0 }}>
        <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <CommanderTitle deck={deck} />
          {deck.archived && <Chip size="small" label="Archiviert" variant="outlined" sx={{ flexShrink: 0, color: 'text.secondary' }} />}
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
          Deck: {deck.name} · {ownerLabel(deck)}{peers.length > 1 && ` (…${distinctSuffix(deck.deckId, peers)})`}
        </Typography>
        <Stack direction="row" sx={{ gap: 1, justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{countsText(deck.games, deck.wins)}</Typography>
          <Typography variant="numeric" sx={{ fontWeight: 600, flexShrink: 0 }}>{formatRate(deck.winRatePercent)}</Typography>
        </Stack>
        <RateBar value={deck.winRatePercent} />
      </Box>
    })}
  </Stack>
}

function SeatRows({ data }: { data: GroupStatistics }) {
  const section = teaserSection(data.startPositions)
  if (!section) return null
  return <Box>
    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{section.playerCount} Spieler · {sectionGames(section)} Partien</Typography>
    <Stack component="ul" aria-label={`Startplätze bei ${section.playerCount} Spielern`} sx={{ ...rowList, gap: 1.5 }}>
      {section.seats.map(seat => <SeatLine key={seat.startPosition} seat={seat} />)}
    </Stack>
  </Box>
}
