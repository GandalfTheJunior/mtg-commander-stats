import { Box, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { Link } from 'react-router'
import type { GamePreview } from './api'
import { CommanderArtwork } from './CommanderArtwork'
import { gameUrl, publicName, sameId } from './gamePresentation'

export default function CompactGameCard({ game }: { game: GamePreview }) {
  const winner = game.result === 'WIN' ? game.participants.find(person => sameId(person.userId, game.winnerUserId!)) : undefined
  const name = winner ? publicName(winner, game.participants) : 'Unentschieden'
  const date = game.playedOn ? `Gespielt am: ${game.playedOn.split('-').reverse().join('.')}` : 'Spieldatum unbekannt'
  return <Card component="article" sx={{ minWidth: 0 }}>
    <CardActionArea component={Link} to={gameUrl(game.groupId, game.id)}
      aria-label={`Spieldetails: ${name}${winner ? ` · Deck: ${winner.deck.name}` : ''} · ${date}`}
      sx={{ p: 2, display: 'flex', gap: 2, justifyContent: 'flex-start', color: 'text.primary', textDecoration: 'none',
        '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
      <Box aria-hidden="true" sx={{ width: 64, height: 80, flexShrink: 0, borderRadius: 1, overflow: 'hidden', bgcolor: 'background.raised', display: 'flex' }}>
        {winner ? winner.deck.commanders.map((commander, index) => <Box key={index} sx={{ flex: 1, minWidth: 0 }}>
          <CommanderArtwork commander={commander} compact />
        </Box>) : <Box sx={{ m: 'auto', color: 'text.secondary' }}>—</Box>}
      </Box>
      <Stack sx={{ gap: 0.5, flex: 1, minWidth: 0, overflowWrap: 'anywhere', textAlign: 'left' }}>
        <Typography component="h4" variant="h6" sx={{ fontSize: '1.125rem' }}>{name}</Typography>
        {winner && <Typography>Deck: {winner.deck.name}</Typography>}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {game.playedOn ? <>Gespielt am: <time dateTime={game.playedOn}>{game.playedOn.split('-').reverse().join('.')}</time></> : date}
        </Typography>
      </Stack>
      <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 24 }}>›</Box>
    </CardActionArea>
  </Card>
}
