import { commanderNames } from '../api'
import { fireEvent, screen, within } from '@testing-library/react'
import { expect } from 'vitest'
import type { DeckSelection } from '../api'

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const gameCard = (slot: number) => within(screen.getByRole('region', { name: `Spieler ${slot}` }))

/** Opens the member picker from an empty card (or "Mitglied ändern") and chooses by public name. */
export async function selectGameMember(slot: number, name: string) {
  if (!screen.queryByRole('dialog', { name: 'Gruppenmitglied auswählen' })) {
    const card = gameCard(slot)
    fireEvent.click(card.queryByRole('button', { name: `Spieler ${slot} auswählen` }) ?? card.getByRole('button', { name: 'Mitglied ändern' }))
  }
  const dialog = within(await screen.findByRole('dialog', { name: 'Gruppenmitglied auswählen' }))
  fireEvent.click(dialog.getByRole('button', { name: new RegExp(`^${escape(name)} · `) }))
}

/** Each member loader is independent: wait for this member's actual deck in the chained dialog. */
export async function selectGameDeck(slot: number, deck: DeckSelection) {
  if (!screen.queryByRole('dialog', { name: 'Deck auswählen' })) {
    const card = gameCard(slot)
    fireEvent.click(card.queryByRole('button', { name: 'Deck auswählen' }) ?? card.getByRole('button', { name: 'Deck ändern' }))
  }
  const dialog = within(await screen.findByRole('dialog', { name: 'Deck auswählen' }))
  fireEvent.click(await dialog.findByRole('button', { name: new RegExp(`^${escape(commanderNames(deck))} · ${escape(deck.name)}`) }))
  const card = gameCard(slot)
  expect(card.getByRole('button', { name: `Spieler ${slot} bearbeiten` })).toBeInTheDocument()
  expect(card.getByText(deck.name)).toBeInTheDocument()
}

export async function selectGamePlayer(slot: number, name: string, deck: DeckSelection) {
  await selectGameMember(slot, name)
  await selectGameDeck(slot, deck)
}

export async function openGameDetails() {
  const games = within(await screen.findByRole('region', { name: 'Spielehistorie' }))
  fireEvent.click((await games.findAllByRole('link', { name: /^Spieldetails:/ }))[0])
  await screen.findByRole('heading', { name: 'Spieldetails' })
}
export async function gameAction(name: 'Bearbeiten' | 'Löschen', open = true) {
  if (open) await openGameDetails()
  const details = within(await screen.findByRole('region', { name: 'Spieldetails' }))
  fireEvent.click(await details.findByRole('button', { name: name === 'Bearbeiten' ? 'Spiel bearbeiten' : 'Spiel löschen' }))
}

/** One click elects the winner; every other result stays unknown (winner-only). */
export function selectGameWinner(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name}: Sieger des Spiels` }))
}
