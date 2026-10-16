import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { appTheme } from './theme'

export function AppThemeProvider({ children }: { children: ReactNode }) {
  // No CssBaseline: native screens retain index.css during incremental adoption.
  // Keep Emotion's default insertion order, after legacy CSS; no injectFirst.
  return <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
}
