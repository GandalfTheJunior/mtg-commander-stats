import { fireEvent, screen, within } from '@testing-library/react'
import { expect } from 'vitest'
import type { DeckSelection } from '../api'

/** Each member loader is independent: wait for this field's actual option. */
export async function selectGameDeck(slot: number, deck: DeckSelection) {
  const card = within(screen.getByRole('region', { name: `Spieler ${slot}` }))
  const field = card.getByRole('combobox', { name: `Deck für Spieler ${slot}` })
  const option = await within(field).findByRole('option', {
    name: `${deck.name} — ${deck.commander} — ${deck.colorIdentity.join('') || 'Farblos'}`,
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
