import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('identifies the application', () => {
  render(<App />)

  expect(
    screen.getByRole('heading', { level: 1, name: 'MTG Commander Stats' }),
  ).toBeInTheDocument()
})
