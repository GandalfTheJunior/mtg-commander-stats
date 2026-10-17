import { fireEvent, screen } from '@testing-library/react'

export async function openGameDetails() {
  fireEvent.click((await screen.findAllByRole('link', { name: /^Spieldetails:/ }))[0])
  await screen.findByRole('heading', { name: 'Spieldetails' })
}
export async function gameAction(name: 'Bearbeiten' | 'Löschen', open = true) {
  if (open) await openGameDetails()
  fireEvent.click(await screen.findByRole('button', { name: 'Spielaktionen' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
}
