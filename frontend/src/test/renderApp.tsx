import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppThemeProvider } from '../theme/AppThemeProvider'

export function renderApp(ui: ReactNode, path = '/decks') {
  return render(<AppThemeProvider><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></AppThemeProvider>)
}

export async function goTo(name: 'Dashboard' | 'Decks' | 'Playgroups') {
  fireEvent.click(await screen.findByRole('link', { name }))
}
