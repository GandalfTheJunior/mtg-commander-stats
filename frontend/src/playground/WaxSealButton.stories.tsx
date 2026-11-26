import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { WaxSealButton } from './WaxSealButton'
import './lounge.css'

/**
 * Unchanged Lounge experiment (#160); not approved for production. waxSeal.css
 * scopes part of its button styling to a `.lounge` ancestor. The story renders
 * inside a `.lounge` room with the Lounge styles loaded (#358), as in the scene,
 * so it looks the same whether or not another Lounge story was shown before.
 */
const meta = {
  title: 'Experiments/Lounge/Wax seal button',
  component: WaxSealButton,
  tags: ['experiment'],
  parameters: { surface: false },
  decorators: [Story => <div className="lounge" lang="de"><div style={{ padding: '24px 16px' }}><Story /></div></div>],
  args: { onClick: fn() },
} satisfies Meta<typeof WaxSealButton>

export default meta
type Story = StoryObj<typeof meta>

export const Check: Story = { args: { symbol: 'check', children: 'Auswahl bestätigen' } }

export const Play: Story = { args: { symbol: 'play', children: 'Spiel starten' } }

export const Reset: Story = { args: { symbol: 'reset', children: '↺ Demo zurücksetzen' } }

export const Pressed: Story = { args: { symbol: 'check', 'aria-pressed': true, children: '✓ Auswahl bestätigt' } }

export const Disabled: Story = { args: { symbol: 'play', disabled: true, children: 'Spiel starten' } }
