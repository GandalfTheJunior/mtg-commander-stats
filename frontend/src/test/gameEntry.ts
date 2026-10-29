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
  const games = within(await screen.findByRole('region', { name: 'Spiele' }))
  fireEvent.click((await games.findAllByRole('link', { name: /^Spieldetails:/ }))[0])
  await screen.findByRole('heading', { name: 'Spieldetails' })
}
export async function gameAction(name: 'Bearbeiten' | 'Löschen', open = true) {
  if (open) await openGameDetails()
  const details = within(await screen.findByRole('region', { name: 'Spieldetails' }))
  fireEvent.click(await details.findByRole('button', { name: 'Spielaktionen' }))
  const menu = within(await screen.findByRole('menu', { name: 'Spielaktionen' }))
  fireEvent.click(menu.getByRole('menuitem', { name }))
}

// Select explicit final ranks using the editor's visible per-card controls.
export function selectGameWinner(userId: string) {
  const cards = screen.getAllByRole('region', { name: /^Spieler \d$/ }).map(card => within(card))
  const number = Number(userId.slice(-12))
  let rank = 2
  for (const card of cards) {
    const deck = card.queryByRole('combobox', { name: /Deck für Spieler/ }) as HTMLSelectElement | null
    if (deck ? !deck.value : !card.queryByRole('button', { name: /bearbeiten$/ })) continue
    // Query rank buttons inside their named group, not every card action.
    const placement = card.queryByRole('group', { name: 'Platzierung' })
    if (!placement) continue
    const winner = card.queryByText(`Deck ${number}`) !== null ||
      (card.queryByRole('combobox', { name: /^Spieler \d$/ }) as HTMLSelectElement | null)?.value === userId
    fireEvent.click(within(placement).getByRole('button', { name: `Platz ${winner ? 1 : rank++}` }))
  }
}
