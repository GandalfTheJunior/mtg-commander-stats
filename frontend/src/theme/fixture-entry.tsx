import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { AppThemeProvider } from './AppThemeProvider'
import { ThemeFixture } from './ThemeFixture'

// Separate Vite development HTML entry; never imported by the production app.
if (import.meta.env.DEV) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppThemeProvider><ThemeFixture /></AppThemeProvider>
    </StrictMode>,
  )
}
