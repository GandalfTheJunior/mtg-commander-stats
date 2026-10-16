import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppThemeProvider } from './AppThemeProvider'
import { ThemeFixture } from './ThemeFixture'

test('the themed fixture exposes labelled fields, validation and unavailable controls', () => {
  render(<AppThemeProvider><ThemeFixture /></AppThemeProvider>)
  const name = screen.getByRole('textbox', { name: 'Example name' })
  expect(name).toBeRequired()
  fireEvent.click(screen.getByRole('button', { name: 'Validate name' }))
  expect(name).toHaveAttribute('aria-invalid', 'true')
  expect(name).toHaveAccessibleDescription('Error: enter a name.')
  fireEvent.change(name, { target: { value: 'A very long Commander deck name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Validate name' }))
  expect(name).toHaveAttribute('aria-invalid', 'false')
  expect(name).toHaveValue('A very long Commander deck name')
  expect(screen.getByRole('textbox', { name: 'Validation example' })).toHaveAccessibleDescription('Error: this example needs correction.')
  expect(screen.getByRole('textbox', { name: 'Unavailable field' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Saving unavailable' })).toBeDisabled()
})

test('selection exposes a pressed state and a visible label independent of color', () => {
  render(<AppThemeProvider><ThemeFixture /></AppThemeProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Select option', pressed: false }))
  expect(screen.getByRole('button', { name: 'Selected option', pressed: true })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Selected option' }))
  expect(screen.getByRole('button', { name: 'Select option', pressed: false })).toBeInTheDocument()
})
