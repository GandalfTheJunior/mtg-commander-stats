import { BrowserRouter } from 'react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppThemeProvider } from './theme/AppThemeProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <BrowserRouter><App /></BrowserRouter>
    </AppThemeProvider>
  </StrictMode>,
)
