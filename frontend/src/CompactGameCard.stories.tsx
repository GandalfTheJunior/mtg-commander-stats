import type { Meta, StoryObj } from '@storybook/react-vite'
import type { GamePreview, MagicColor } from './api'
import CompactGameCard from './CompactGameCard'
import { savedCommander } from './test/commanderFixtures'

const uid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

// Saved artwork stays null: stories make no external requests, so the card shows its no-artwork fallback.
const participant = (n: number, username: string, deckName: string, commanders: string[], colors: MagicColor[]) => ({
  userId: uid(n), username,
  deck: { id: uid(100 + n), name: deckName, commanders: commanders.map(name => savedCommander(name, colors)), colorIdentity: colors, companion: null },
})

const players = [
  participant(1, 'Ada', 'Praetors’ Council', ['Atraxa, Praetors’ Voice'], ['W', 'U', 'B', 'G']),
  participant(2, 'Linus', 'Goblin Hour', ['Krenko, Mob Boss'], ['R']),
  participant(3, 'Grace', 'Elf Ball', ['Lathril, Blade of the Elves'], ['B', 'G']),
]

const game = (overrides: Partial<GamePreview> = {}): GamePreview => ({
  id: uid(500), groupId: uid(10), result: 'WIN', winnerUserId: uid(1), playedOn: '2026-11-14', participants: players, ...overrides,
})

const meta = {
  title: 'Components/CompactGameCard',
  component: CompactGameCard,
  parameters: { router: { initialEntries: ['/playgroups'] } },
} satisfies Meta<typeof CompactGameCard>

export default meta
type Story = StoryObj<typeof meta>

export const Win: Story = { args: { game: game() } }

export const Draw: Story = { args: { game: game({ result: 'DRAW', winnerUserId: null }) } }

export const UnknownPlayDate: Story = { name: 'Unknown play date', args: { game: game({ playedOn: null }) } }

export const LongNames: Story = {
  name: 'Long names',
  args: {
    game: game({
      winnerUserId: uid(4),
      participants: [participant(4, 'Maximiliane-Alexandra von Hohenzollern-Sigmaringen', 'The Extraordinarily Long Commander Deck Name for Testing Wrapping',
        ['Asmoranomardicadaistinaculdacar'], ['B', 'R']), ...players],
    }),
  },
}

export const TwoCommanders: Story = {
  name: 'Two commanders',
  args: {
    game: game({
      winnerUserId: uid(5),
      participants: [participant(5, 'Margaret', 'Blue Farm', ['Tymna the Weaver', 'Thrasios, Triton Hero'], ['W', 'U', 'B', 'G']), ...players],
    }),
  },
}
