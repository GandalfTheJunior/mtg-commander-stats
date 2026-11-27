import { AppRouter } from './app/AppRouter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { AppThemeProvider } from './theme/AppThemeProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <AppRouter><App /></AppRouter>
    </AppThemeProvider>
  </StrictMode>,
)
