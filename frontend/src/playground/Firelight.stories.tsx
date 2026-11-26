import type { Meta, StoryObj } from '@storybook/react-vite'
import { Firelight, type FirelightMode } from './Firelight'
import { StoneJoints, StoneWall } from './StoneWall'

type Args = { mode: FirelightMode; enabled: boolean; strong: boolean; reduced: boolean }

/**
 * The Lounge's firelight (#162, #358) on the stone wall, layered as in the scene.
 * Firelight writes its light levels to its parent, the `.lounge` root, whose
 * `data-*` state the scene would otherwise set. `reduced` stands in for the
 * scene's reduced-motion detection: static light and no transitions.
 */
const meta = {
  title: 'Experiments/Lounge/Firelight',
  tags: ['experiment'],
  parameters: { surface: false },
  args: { mode: 'optimized', enabled: true, strong: false, reduced: false },
  argTypes: { mode: { control: 'inline-radio', options: ['baseline', 'optimized', 'static'] } },
  render: ({ mode, enabled, strong, reduced }) => <div className="lounge" lang="de" data-light-mode={mode} data-fire={enabled}
    data-intensity={strong ? 'strong' : 'quiet'} data-reduced={reduced} data-hidden={false}>
    <StoneWall />
    <Firelight enabled={enabled} animated={!reduced} strong={strong} mode={mode} />
    <StoneJoints />
  </div>,
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

export const Optimized: Story = {}

export const Baseline: Story = { args: { mode: 'baseline' } }

export const Static: Story = { args: { mode: 'static' } }

export const Strong: Story = { args: { strong: true } }

export const Off: Story = { args: { enabled: false } }

export const ReducedMotion: Story = { name: 'Reduced motion', args: { reduced: true } }
