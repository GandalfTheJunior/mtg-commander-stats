import type { Meta, StoryObj } from '@storybook/react-vite'
import { ManaSymbols } from './ManaSymbols'

const meta = {
  title: 'Components/ManaSymbols',
  component: ManaSymbols,
} satisfies Meta<typeof ManaSymbols>

export default meta
type Story = StoryObj<typeof meta>

export const OneColor: Story = { name: 'One color', args: { colors: ['R'] } }

export const AllFiveColors: Story = { name: 'All five colors', args: { colors: ['W', 'U', 'B', 'R', 'G'] } }

export const Colorless: Story = { args: { colors: [] } }

export const LargeSize: Story = { name: 'Non-default size', args: { colors: ['W', 'U', 'B', 'R', 'G'], size: 40 } }
