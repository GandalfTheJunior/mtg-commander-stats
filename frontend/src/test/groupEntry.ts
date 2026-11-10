import { fireEvent, screen } from '@testing-library/react'

export async function openCodeScreen() {
  fireEvent.click(await screen.findByRole('button', { name: 'Gruppenaktionen' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Einladungscode verwalten' }))
  await screen.findByRole('button', { name: 'Einladungscode anzeigen' })
}
export async function showCode() {
  await openCodeScreen()
  fireEvent.click(screen.getByRole('button', { name: 'Einladungscode anzeigen' }))
}
export async function selectTab(name: 'Spiele' | 'Statistiken' | 'Mitglieder') {
  const label = { Spiele: 'Games', Statistiken: 'Statistics', Mitglieder: 'Members' }[name]
  fireEvent.click(await screen.findByRole('tab', { name: label }))
}
