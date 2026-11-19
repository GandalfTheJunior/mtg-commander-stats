import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { WaxSealButton } from './WaxSealButton'

/**
 * Unchanged Lounge experiment (#160); not approved for production. waxSeal.css
 * scopes part of its button styling to a `.lounge` ancestor, which the story
 * wrapper supplies without loading the rest of the Lounge styles.
 */
const meta = {
  title: 'Experiments/Wax seal button',
  component: WaxSealButton,
  tags: ['experiment'],
  decorators: [Story => <div className="lounge"><Story /></div>],
  args: { onClick: fn() },
} satisfies Meta<typeof WaxSealButton>

export default meta
type Story = StoryObj<typeof meta>

export const Check: Story = { args: { symbol: 'check', children: 'Auswahl bestätigen' } }

export const Play: Story = { args: { symbol: 'play', children: 'Spiel starten' } }

export const Reset: Story = { args: { symbol: 'reset', children: '↺ Demo zurücksetzen' } }

export const Pressed: Story = { args: { symbol: 'check', 'aria-pressed': true, children: '✓ Auswahl bestätigt' } }

export const Disabled: Story = { args: { symbol: 'play', disabled: true, children: 'Spiel starten' } }
