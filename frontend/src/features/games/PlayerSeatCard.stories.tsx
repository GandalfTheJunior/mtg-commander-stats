import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Stack } from '@mui/material'
import { fn } from 'storybook/test'
import type { MagicColor } from '../decks/api'
import type { DeckSelection } from './api'
import { PlayerSeatCard, type PlayerSeatCardProps } from './PlayerSeatCard'
import { savedCommander } from '../../test/commanderFixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

// Saved artwork stays null: stories make no external requests, so the card shows its no-artwork fallback.
const deck = (n: number, name: string, commanders: string[], colors: MagicColor[]): DeckSelection =>
  ({ id: uid(100 + n), name, commanders: commanders.map(commander => savedCommander(commander, colors)), colorIdentity: colors, companion: null })

// A Companion keeps only the saved-card fields the artwork needs, like a real saved deck.
function withCompanion(selection: DeckSelection): DeckSelection {
  const { oracleId, name, selectionRef, scryfallCardId, colorIdentity, artworkFaceIndex, artCropUrl, illustrationId, artist, scryfallUri, cardFaces } =
    savedCommander('Lutri, the Spellchaser', ['U', 'R'])
  return { ...selection, companion: { oracleId, name, selectionRef, scryfallCardId, colorIdentity, artworkFaceIndex, artCropUrl, illustrationId, artist, scryfallUri, cardFaces } }
}

const atraxa = deck(1, 'Praetors’ Council', ['Atraxa, Praetors’ Voice'], ['W', 'U', 'B', 'G'])
const krenko = deck(2, 'Goblin Hour', ['Krenko, Mob Boss'], ['R'])

const meta = {
  title: 'Components/PlayerSeatCard',
  component: PlayerSeatCard,
  args: {
    seatKey: 1, position: 1, count: 4, name: 'Ada', deck: atraxa, done: true, expanded: false, startSeat: 1, busy: false,
    result: { mode: 'WIN', draft: {}, count: 4, hasWinner: false },
    onSelect: fn(), onToggle: fn(), onChangeMember: fn(), onChangeDeck: fn(), onMoveUp: fn(), onMoveDown: fn(),
    onRemove: fn(), onResult: fn(), onDraw: fn(),
  },
  // The editor's reorder hint is referenced by every grip; a column frame matches the editor's width.
  decorators: [Story => <Stack sx={{ gap: 2, maxWidth: 560 }}>
    <span id="game-reorder-hint" hidden>Reihenfolge: Griff links ziehen oder antippen (Pfeiltasten hoch/runter)</span>
    <Story />
  </Stack>],
} satisfies Meta<typeof PlayerSeatCard>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { name: 'Empty slot', args: { name: undefined, deck: undefined, done: false } }

export const WithoutDeck: Story = { name: 'Member without deck', args: { deck: undefined, done: false, expanded: true } }

export const Collapsed: Story = {}

export const Expanded: Story = { args: { expanded: true } }

export const Winner: Story = { args: { result: { mode: 'WIN', draft: { win: 1 }, count: 4, hasWinner: true } } }

export const Placement: Story = { args: { position: 2, startSeat: 2, deck: krenko, name: 'Linus', result: { mode: 'WIN', draft: { win: 3 }, count: 4, hasWinner: true } } }

export const Draw: Story = { args: { result: { mode: 'DRAW', draft: { draw: true }, count: 4, hasWinner: false } } }

export const ValidationError: Story = {
  name: 'Validation error',
  args: { deck: undefined, done: false, expanded: true, error: 'Bitte ein Deck auswählen oder den Spieler entfernen.' },
}

export const FormerMember: Story = { name: 'Former member', args: { name: 'Grace', former: true, archived: true, expanded: true } }

export const ArchivedDeck: Story = { name: 'Archived deck', args: { archived: true } }

export const LongNames: Story = {
  name: 'Long names',
  args: {
    name: 'Maximiliane-Alexandra von Hohenzollern-Sigmaringen', expanded: true,
    deck: deck(3, 'The Extraordinarily Long Commander Deck Name for Testing Wrapping', ['Asmoranomardicadaistinaculdacar'], ['B', 'R']),
  },
}

export const TwoCommanders: Story = {
  name: 'Two commanders',
  args: { name: 'Margaret', deck: deck(4, 'Blue Farm', ['Tymna the Weaver', 'Thrasios, Triton Hero'], ['W', 'U', 'B', 'G']) },
}

export const TwoCommandersCompanion: Story = {
  name: 'Two commanders + companion',
  args: { name: 'Margaret', expanded: true, deck: withCompanion(deck(5, 'Blue Farm Lutri', ['Tymna the Weaver', 'Thrasios, Triton Hero'], ['W', 'U', 'B', 'G'])) },
}

export const Busy: Story = { args: { busy: true, expanded: true } }

/** Several seats as the editor stacks them; each toggle works, so collapse and expand animate here. */
export const SeatList: Story = {
  name: 'Seat list (interactive toggle)',
  render: args => <SeatListDemo {...args} />,
}

function SeatListDemo(args: PlayerSeatCardProps) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 2: true })
  const seats: Partial<PlayerSeatCardProps>[] = [
    { seatKey: 1, name: 'Ada', deck: atraxa, result: { mode: 'WIN', draft: { win: 1 }, count: 3, hasWinner: true } },
    { seatKey: 2, name: 'Linus', deck: krenko, result: { mode: 'WIN', draft: {}, count: 3, hasWinner: true } },
    { seatKey: 3, name: 'Margaret', deck: deck(4, 'Blue Farm', ['Tymna the Weaver', 'Thrasios, Triton Hero'], ['W', 'U', 'B', 'G']),
      result: { mode: 'WIN', draft: {}, count: 3, hasWinner: true } },
  ]
  return <>
    {seats.map((seat, index) => <PlayerSeatCard key={seat.seatKey} {...args} {...seat} seatKey={seat.seatKey!} position={index + 1} count={4} startSeat={index + 1}
      expanded={Boolean(open[seat.seatKey!])} onToggle={() => setOpen(current => ({ ...current, [seat.seatKey!]: !current[seat.seatKey!] }))} />)}
    <PlayerSeatCard {...args} seatKey={4} position={4} count={4} name={undefined} deck={undefined} done={false} startSeat={0} />
  </>
}
