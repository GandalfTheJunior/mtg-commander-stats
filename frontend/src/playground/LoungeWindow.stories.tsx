import type { Meta, StoryObj } from '@storybook/react-vite'
import { LoungeWindow } from './LoungeWindow'

type Args = { flies: boolean; fire: boolean; strong: boolean }

/**
 * The Lounge's brass-framed evening window with fireflies (#358). The `.lounge`
 * root supplies the scene's fire and intensity state, which tint the glass and
 * the brass; the width matches the window's column in the desktop scene.
 */
const meta = {
  title: 'Experiments/Lounge/Window',
  tags: ['experiment'],
  parameters: { surface: false },
  args: { flies: true, fire: true, strong: false },
  render: ({ flies, fire, strong }) => <div className="lounge" lang="de" data-fire={fire} data-intensity={strong ? 'strong' : 'quiet'}>
    <div style={{ maxWidth: 480, margin: 'auto', padding: '24px 16px' }}>
      <LoungeWindow flies={flies} />
    </div>
  </div>,
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

export const FirefliesOn: Story = { name: 'Fireflies on' }

export const FirefliesOff: Story = { name: 'Fireflies off', args: { flies: false } }

export const FireOff: Story = { name: 'Fire off', args: { fire: false } }
