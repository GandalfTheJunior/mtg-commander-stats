import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import SvgIcon from '@mui/material/SvgIcon'
import Typography from '@mui/material/Typography'
import type { CurrentUser } from './api'
import type { Notice } from './App'

const destinations = [
  { path: '/dashboard', label: 'Dashboard', icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
  { path: '/playgroups', label: 'Playgroups', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm9 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 21v-3c0-4 16-4 16 0v3zm18 0v-3c0-2-1-3-3-4 4 0 7 1 7 4v3z' },
  { path: '/decks', label: 'Decks', icon: 'M7 2h14v17h-2V4H7zM3 6h14v16H3zm2 2v12h10V8z' },
]

export function AppShell({ user, notice, onLogout, children }: {
  user: CurrentUser
  notice: Notice
  onLogout: () => void
  children: ReactNode
}) {
  const location = useLocation()
  const focusedEditor = location.pathname === '/decks/new' || /^\/decks\/[^/]+\/edit$/.test(location.pathname)
  const content = useRef<HTMLElement>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => { content.current?.focus() }, [location.pathname])
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const editing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
      setKeyboardOpen(Boolean(editing && window.innerHeight - viewport.height > 150))
    }
    viewport.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      viewport.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  return (
    <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100dvh', fontFamily: (theme) => theme.typography.fontFamily }}>
      <Button component="a" href="#app-content" color="inherit" sx={{ position: 'absolute', top: -100, left: 16, zIndex: 3,
        '&:focus': { top: 8, bgcolor: 'background.raised' } }}>Skip to content</Button>
      <Box component="header" sx={{ m: 0, p: 2, bgcolor: 'background.paper' }}>
        <Stack direction="row" useFlexGap sx={{ maxWidth: 1024, mx: 'auto', gap: 2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography component="h1" variant="wordmark" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, overflowWrap: 'anywhere' }}>MTG Commander Stats</Typography>
          <Stack sx={{ ml: 'auto', alignItems: 'flex-end', minWidth: 0, maxWidth: '100%' }}>
            <Typography component="p" sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>Signed in as <strong>{user.username}</strong>.</Typography>
            <Button color="inherit" variant="outlined" onClick={onLogout}>Log out</Button>
          </Stack>
        </Stack>
      </Box>
      <Box component="nav" aria-label="Main navigation" sx={{
        display: { xs: keyboardOpen || focusedEditor ? 'none' : 'flex', sm: 'flex' },
        position: { xs: 'fixed', sm: 'static' }, bottom: 0, left: 0, right: 0, zIndex: 2,
        justifyContent: 'center', bgcolor: 'background.paper', px: 1,
        pb: { xs: 'env(safe-area-inset-bottom, 0px)', sm: 0 },
        border: 0, borderStyle: 'solid', borderTopWidth: { xs: 1, sm: 0 },
        borderBottomWidth: { xs: 0, sm: 1 }, borderColor: 'divider',
      }}>
        {destinations.map(({ path, label, icon }) => (
          <Button key={path} component={NavLink} to={path} end color="inherit" sx={{
            display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 0.5,
            flex: { xs: 1, sm: '0 1 200px' }, minWidth: 48, minHeight: { xs: 72, sm: 56 },
            px: 0.5, borderRadius: 0, fontSize: '0.875rem', color: 'text.secondary', transition: 'none',
            '&[aria-current="page"]': { color: 'secondary.main', bgcolor: 'background.raised', textDecoration: 'underline', textUnderlineOffset: '0.3em' },
            '&:focus-visible': { outlineOffset: -4 },
          }}>
            <SvgIcon aria-hidden="true" focusable="false"><path d={icon} /></SvgIcon>{label}
          </Button>
        ))}
      </Box>
      <Box component="main" id="app-content" ref={content} tabIndex={-1} sx={{
        boxSizing: 'border-box', width: '100%', maxWidth: 1056, mx: 'auto', my: 0, px: 2, pt: 3,
        pb: { xs: focusedEditor ? 'calc(32px + env(safe-area-inset-bottom, 0px))' : 'calc(104px + env(safe-area-inset-bottom, 0px))', sm: 4 },
        overflowWrap: 'anywhere', '&:focus': { outline: 'none' },
      }}>
        {notice && <Typography role="status" sx={{ mb: 2, color: notice.kind === 'error' ? 'error.main' : 'success.main' }}>{notice.message}</Typography>}
        {children}
      </Box>
    </Box>
  )
}
