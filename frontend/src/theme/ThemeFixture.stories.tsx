import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeFixture } from './ThemeFixture'

/** The /dev/theme.html fixture, unchanged; it paints its own page surface. */
const meta = {
  title: 'Foundations/Themed controls',
  component: ThemeFixture,
  parameters: { surface: false },
} satisfies Meta<typeof ThemeFixture>

export default meta

export const Fixture: StoryObj<typeof meta> = {}
