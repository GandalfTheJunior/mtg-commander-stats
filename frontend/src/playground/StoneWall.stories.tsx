import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoneJoints, StoneWall } from './StoneWall'

type Args = { fire: boolean }

/**
 * The Lounge's stone relief (#358): `StoneWall` and `StoneJoints` as layered in
 * the scene, without the live Firelight, so the relief shows its resting light.
 * The `.lounge` root supplies the `data-fire` state the scene would set.
 */
const meta = {
  title: 'Experiments/Lounge/Stone wall',
  tags: ['experiment'],
  parameters: { surface: false },
  args: { fire: true },
  render: ({ fire }) => <div className="lounge" lang="de" data-fire={fire}>
    <StoneWall />
    <StoneJoints />
  </div>,
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

export const FireOn: Story = { name: 'Fire on' }

export const FireOff: Story = { name: 'Fire off', args: { fire: false } }
