import { fireEvent, screen, within } from '@testing-library/react'

export function clickAccountLogout() {
  fireEvent.click(within(screen.getByRole('banner', { hidden: true })).getByRole('button', { hidden: true }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
}
