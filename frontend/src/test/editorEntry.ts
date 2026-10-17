import { fireEvent, screen } from '@testing-library/react'

/** Integration tests retain their session assertions while following the new screens. */
export async function openNewDeck() {
  fireEvent.click(await screen.findByRole('button', { name: 'Deck erstellen' }))
  return screen.findByRole('textbox', { name: /Deckname/ })
}
export async function openExistingDeck() {
  fireEvent.click(await screen.findByRole('button', { name: /bearbeiten$/ }))
  await screen.findByRole('textbox', { name: /Deckname/ })
}
export async function openDeckAction(action: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Deckaktionen' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: action }))
}
