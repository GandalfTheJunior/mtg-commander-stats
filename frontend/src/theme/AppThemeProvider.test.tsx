import { render, screen } from '@testing-library/react'
import Button from '@mui/material/Button'
import { expect, test } from 'vitest'
import { AppThemeProvider } from './AppThemeProvider'

test.each(['text', 'outlined', 'contained'] as const)('%s buttons inherit a differently colored parent', (variant) => {
  render(
    <AppThemeProvider>
      <div style={{ color: 'rgb(175, 200, 245)' }}>
        <Button variant={variant} color="inherit">Account</Button>
      </div>
    </AppThemeProvider>,
  )
  const button = screen.getByRole('button', { name: 'Account' })
  expect(getComputedStyle(button).color).toBe('rgb(175, 200, 245)')
  expect(getComputedStyle(button).minHeight).toBe('48px')
})
