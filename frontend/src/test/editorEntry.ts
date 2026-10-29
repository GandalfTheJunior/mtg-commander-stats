import { fireEvent, screen, within } from '@testing-library/react'

/** Integration tests retain their session assertions while following the new screens. */
export async function openNewDeck() {
  fireEvent.click(await screen.findByRole('button', { name: 'Deck erstellen' }))
  return screen.findByRole('textbox', { name: /Deckname/ })
}
export async function openExistingDeck() {
  const decks = within(await screen.findByRole('region', { name: 'Meine Decks' }))
  fireEvent.click(await decks.findByRole('button', { name: /bearbeiten$/ }))
  await screen.findByRole('textbox', { name: /Deckname/ })
}
export async function openDeckAction(action: string) {
  const editor = within(await screen.findByRole('region', { name: 'Deck bearbeiten' }))
  fireEvent.click(await editor.findByRole('button', { name: 'Deckaktionen' }))
  const menu = within(await screen.findByRole('menu'))
  fireEvent.click(menu.getByRole('menuitem', { name: action }))
}
