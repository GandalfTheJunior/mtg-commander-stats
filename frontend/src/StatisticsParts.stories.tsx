import type { Meta, StoryObj } from '@storybook/react-vite'
import { Stack } from '@mui/material'
import { fn } from 'storybook/test'
import { EmptyState, LoadFeedback, SkeletonCards } from './StatisticsParts'

/** Shared load states of the statistics reports (#197), combined as StatisticsReportPage does. */
const meta = {
  title: 'Patterns/Load feedback',
  component: LoadFeedback,
  args: { load: { status: 'loading' }, onRetry: fn() },
} satisfies Meta<typeof LoadFeedback>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton cards; the loading announcement is visually hidden and only read by assistive technology. */
export const Loading: Story = {
  render: args => <Stack sx={{ gap: 2 }}>
    <LoadFeedback {...args} />
    <SkeletonCards count={3} />
  </Stack>,
}

export const ErrorWithRetry: Story = { name: 'Error with retry', args: { load: { status: 'error' } } }

export const Empty: Story = {
  render: () => <EmptyState>Noch keine Spielerstatistiken. Erfasst ein Spiel in dieser Gruppe, um Ergebnisse zu sehen.</EmptyState>,
}
