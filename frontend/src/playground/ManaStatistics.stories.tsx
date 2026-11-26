import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { ManaStatistics } from './ManaStatistics'

/**
 * Unchanged Mana statistics experiment (#357); not approved for production. It
 * paints its own parchment page and uses only local sample data. The filter is
 * internal state, so the filtered stories select it in a play function.
 * Reduced motion follows `prefers-reduced-motion`: emulate it in the browser's
 * developer tools to see the static variant without bubbles or sorting motion.
 */
const meta = {
  title: 'Experiments/Mana statistics',
  component: ManaStatistics,
  tags: ['experiment'],
  parameters: { surface: false },
  // The Playground page paints the area below this short page via lounge.css (`:root`), which stories must not load.
  decorators: [Story => <div style={{ minHeight: '100vh', background: '#20151c' }}><Story /></div>],
} satisfies Meta<typeof ManaStatistics>

export default meta
type Story = StoryObj<typeof meta>

const selectPlayers = (label: string): Story['play'] => async ({ canvasElement }) => {
  const radio = within(canvasElement).getByRole('radio', { name: label })
  await userEvent.click(radio)
  await expect(radio).toBeChecked()
}

export const AllPlayerCounts: Story = { name: 'All player counts' }

export const FourPlayers: Story = { name: 'Four players', play: selectPlayers('4') }

/** Shows colors without observations ("Keine Daten vorhanden"). */
export const SixPlayers: Story = { name: 'Six players', play: selectPlayers('6') }
