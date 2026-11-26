import type { Meta, StoryObj } from '@storybook/react-vite'
import { Lounge } from './Lounge'

/**
 * The complete, unchanged Lounge experiment (#160, #358); not approved for
 * production. It paints its own room, so the application surface is off. The
 * scene reads `?firelight=` from the page URL, so here it always starts in the
 * default `optimized` light mode; the Firelight story compares the modes.
 */
const meta = {
  title: 'Experiments/Lounge/Scene',
  component: Lounge,
  tags: ['experiment'],
  parameters: { surface: false },
  // The Playground page is German (`<html lang="de">`); the Storybook preview is not.
  decorators: [Story => <div lang="de"><Story /></div>],
} satisfies Meta<typeof Lounge>

export default meta

export const Scene: StoryObj<typeof meta> = {}
