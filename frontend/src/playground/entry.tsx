import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from '../theme/AppThemeProvider'
import { Playground } from './Playground'
import './lounge.css'

// Deliberately separate from index.html and the production import graph.
if (import.meta.env.DEV) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode><AppThemeProvider><Playground /></AppThemeProvider></StrictMode>,
  )
}
