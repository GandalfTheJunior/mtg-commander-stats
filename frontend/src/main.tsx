import { AppRouter } from './AppRouter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppThemeProvider } from './theme/AppThemeProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <AppRouter><App /></AppRouter>
    </AppThemeProvider>
  </StrictMode>,
)
