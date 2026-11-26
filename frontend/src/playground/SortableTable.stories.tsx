import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { initialOrder } from './ordering'
import { SortableTable } from './SortableTable'

type Args = { design: 'parchment' | 'classic'; reduced: boolean; onChange: (order: string[]) => void }

function Table({ design, reduced, onChange }: Args) {
  const [order, setOrder] = useState(initialOrder)
  return <div className="lounge" lang="de" data-card-design={design} data-fire data-reduced={reduced}>
    <div style={{ maxWidth: 640, margin: 'auto', padding: '24px 16px' }}>
      <SortableTable order={order} reduced={reduced} onChange={next => { setOrder(next); onChange(next) }} />
    </div>
  </div>
}

/**
 * The Lounge's sortable player table (#165, #358): drag a card by its grip, or
 * use the arrow buttons. The `.lounge` root supplies the card design and the
 * reduced-motion state that the scene's switches would set.
 */
const meta = {
  title: 'Experiments/Lounge/Sortable table',
  tags: ['experiment'],
  parameters: { surface: false },
  args: { design: 'parchment', reduced: false, onChange: fn() },
  argTypes: { design: { control: 'inline-radio', options: ['parchment', 'classic'] } },
  render: args => <Table {...args} />,
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

export const Parchment: Story = {}

export const Classic: Story = { args: { design: 'classic' } }

export const ReducedMotion: Story = { name: 'Reduced motion', args: { reduced: true } }

/** Moves the first player down with the arrow button and checks the new order. */
export const Reordered: Story = {
  args: { reduced: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'mira nach unten' }))
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith(['orin', 'mira', 'lumi', 'fenn']))
  },
}
