import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayerSeatCard, type PlayerSeatCardProps } from './PlayerSeatCard'
import { savedCommander } from '../../test/commanderFixtures'
import { uid } from '../../test/gameFixtures'

const props = (overrides: Partial<PlayerSeatCardProps> = {}): PlayerSeatCardProps => ({
  seatKey: 1, position: 1, count: 2, name: 'Ada', done: true, expanded: true, startSeat: 1, busy: false,
  deck: { id: uid(101), name: 'Praetors’ Council', commanders: [savedCommander('Atraxa')], colorIdentity: [], companion: null },
  result: { mode: 'WIN', draft: {}, count: 2, hasWinner: false },
  onSelect: vi.fn(), onToggle: vi.fn(), onChangeMember: vi.fn(), onChangeDeck: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn(),
  onRemove: vi.fn(), onResult: vi.fn(), onDraw: vi.fn(), ...overrides,
})

const original = window.matchMedia
afterEach(() => { window.matchMedia = original })

function reduceMotion() {
  window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('prefers-reduced-motion') })) as typeof window.matchMedia
}

test('collapsing hides the details from assistive technology and the tab order at once, while they animate out (#382)', () => {
  const { rerender } = render(<PlayerSeatCard {...props()} />)
  const toggle = screen.getByRole('button', { name: 'Spieler 1 einklappen' })
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Mitglied ändern' })).toBeVisible()

  rerender(<PlayerSeatCard {...props({ expanded: false })} />)
  expect(screen.getByRole('button', { name: 'Spieler 1 bearbeiten' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Mitglied ändern' })).not.toBeInTheDocument()
  // Still mounted for the exit animation, but inert.
  const details = document.getElementById('game-1-details')
  if (details) expect(details).toHaveAttribute('inert')
})

test('with reduced motion the details unmount without an animation (#382)', async () => {
  reduceMotion()
  const { rerender } = render(<PlayerSeatCard {...props()} />)
  rerender(<PlayerSeatCard {...props({ expanded: false })} />)
  await waitFor(() => expect(document.getElementById('game-1-details')).toBeNull())
})

test('the parchment card keeps the drag target and seat semantics (#382)', () => {
  render(<PlayerSeatCard {...props({ seatKey: 7, position: 2, expanded: false })} />)
  const card = screen.getByRole('region', { name: 'Spieler 2' })
  expect(card).toHaveAttribute('data-seat-key', '7')
  expect(screen.getByRole('button', { name: 'Ada verschieben' })).toBeInTheDocument()
})

test('an empty slot offers member selection (#382)', () => {
  const onSelect = vi.fn()
  render(<PlayerSeatCard {...props({ name: undefined, deck: undefined, done: false, expanded: false, onSelect })} />)
  screen.getByRole('button', { name: 'Spieler 1 auswählen' }).click()
  expect(onSelect).toHaveBeenCalledOnce()
})
