import { commanderNames } from '../api'
import { fireEvent, screen, within } from '@testing-library/react'
import { expect } from 'vitest'
import type { DeckSelection } from '../api'

/** Each member loader is independent: wait for this field's actual option. */
export async function selectGameDeck(slot: number, deck: DeckSelection) {
  const card = within(screen.getByRole('region', { name: `Spieler ${slot}` }))
  const field = card.getByRole('combobox', { name: `Deck für Spieler ${slot}` })
  const option = await within(field).findByRole('option', {
    name: `${deck.name} — ${commanderNames(deck)} — ${deck.colorIdentity.join('') || 'Farblos'}`,
  })
  expect(field).toBeEnabled()
  expect(option).toHaveValue(deck.id)
  fireEvent.change(field, { target: { value: deck.id } })
  expect(card.getByRole('button', { name: `Spieler ${slot} bearbeiten` })).toBeInTheDocument()
  expect(card.getByText(deck.name)).toBeInTheDocument()
}

export async function openGameDetails() {
  fireEvent.click((await screen.findAllByRole('link', { name: /^Spieldetails:/ }))[0])
  await screen.findByRole('heading', { name: 'Spieldetails' })
}
export async function gameAction(name: 'Bearbeiten' | 'Löschen', open = true) {
  if (open) await openGameDetails()
  fireEvent.click(await screen.findByRole('button', { name: 'Spielaktionen' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
}

// Select explicit final ranks using the editor's visible per-card controls.
export function selectGameWinner(userId: string) {
  const cards = screen.getAllByRole('region', { name: /^Spieler \d$/ }).filter(card =>
    within(card).queryByRole('button', { name: 'Platz 1' }) && (within(card).queryByRole('button', { name: /bearbeiten$/ }) || (within(card).queryByRole('combobox', { name: /Deck für Spieler/ }) as HTMLSelectElement | null)?.value))
  const number = Number(userId.slice(-12))
  let rank = 2
  for (const card of cards) {
    const winner = within(card).queryByText(`Deck ${number}`) !== null ||
      (within(card).queryByRole('combobox', { name: /^Spieler \d$/ }) as HTMLSelectElement | null)?.value === userId
    fireEvent.click(within(card).getByRole('button', { name: `Platz ${winner ? 1 : rank++}` }))
  }
}
