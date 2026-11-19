import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import Box from '@mui/material/Box'
import type { Decorator, Preview } from '@storybook/react-vite'
// Same order as main.tsx: legacy global CSS first, then the shared MUI theme.
import '../src/index.css'
import { AppThemeProvider } from '../src/theme/AppThemeProvider'

/**
 * Production-faithful frame for every story. The application surface is painted
 * explicitly because index.css alone keeps its light legacy page colors.
 * `parameters: { surface: false }` opts out for stories that paint their own page.
 */
const withAppTheme: Decorator = (Story, { parameters, viewMode }) => <StrictMode>
  <AppThemeProvider>
    {parameters.surface === false ? <Story /> : <Box sx={{
      bgcolor: 'background.default', color: 'text.primary', p: 2, boxSizing: 'border-box',
      minHeight: viewMode === 'docs' ? undefined : '100vh',
    }}><Story /></Box>}
  </AppThemeProvider>
</StrictMode>

/** Opt-in router context for components that render react-router links: `parameters: { router: { initialEntries: ['/'] } }`. */
const withRouter: Decorator = (Story, { parameters }) => parameters.router
  ? <MemoryRouter initialEntries={parameters.router.initialEntries ?? ['/']}><Story /></MemoryRouter>
  : <Story />

const viewport = (name: string, width: number, height: number, type: 'mobile' | 'desktop') =>
  ({ name, type, styles: { width: `${width}px`, height: `${height}px` } })

const preview: Preview = {
  decorators: [withRouter, withAppTheme],
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        phone320: viewport('Phone 320 px', 320, 640, 'mobile'),
        phone375: viewport('Phone 375 px', 375, 667, 'mobile'),
        phone390: viewport('Phone 390 px', 390, 844, 'mobile'),
        desktop1280: viewport('Desktop 1280 px', 1280, 800, 'desktop'),
      },
    },
    options: {
      storySort: { order: ['Overview', 'Foundations', 'Patterns', 'Components', 'Experiments'] },
    },
  },
}

export default preview
