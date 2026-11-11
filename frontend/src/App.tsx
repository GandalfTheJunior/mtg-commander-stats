import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  login,
  logout,
  registerUser,
  restoreSession,
  type CurrentUser,
} from './api'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AppShell } from './AppShell'
import DeckManager, { type CollectionMemory } from './DeckManager'
import DeckEditor, { type DeckOverview } from './DeckEditor'
import { EditorNavigation } from './EditorNavigation'
import GroupManager from './GroupManager'
import Dashboard from './Dashboard'
import GroupPage from './GroupPage'
import GameDetailsPage from './GameDetailsPage'
import { groupUrl } from './groupNavigation'
import { isProtectedPath, isPublicPath, returnDestination } from './appRoutes'
import GameEditorPage from './GameEditorPage'
import PendingGroupView from './PendingGroupView'
import { navigationToken } from './navigationToken'
import { forgetAllHandoffs } from './gameHandoff'

export type Notice = { kind: 'success' | 'error'; message: string } | null
type SessionStatus = 'checking' | 'signed-out' | 'authenticated' | 'unverified' | 'logging-out'

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (location.pathname.startsWith('/playgroups/') && location.search) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.search, navigate])
  const editorOrigin = useRef<{ token: string; version: number; path: string; overview: DeckOverview } | null>(null)
  useEffect(() => { if (editorOrigin.current?.path !== location.pathname) editorOrigin.current = null }, [location.pathname])
  // Collection search/archive/scroll context survives only a visit to the deck editor.
  const collectionMemory = useRef<CollectionMemory | null>(null)
  useEffect(() => { if (!location.pathname.startsWith('/decks')) collectionMemory.current = null }, [location.pathname])
  const takeCollectionMemory = useCallback(() => { const memory = collectionMemory.current; collectionMemory.current = null; return memory }, [])
  const sessionVersionRef = useRef(0)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking')
  const [registrationNotice, setRegistrationNotice] = useState<Notice>(null)
  const [registrationPasswordError, setRegistrationPasswordError] = useState(false)
  const [sessionNotice, setSessionNotice] = useState<Notice>(null)
  const [registering, setRegistering] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const registrationPending = useRef(false)
  const loginPending = useRef(false)
  const [rechecking, setRechecking] = useState(false)

  useEffect(() => {
    let active = true
    const version = sessionVersionRef.current
    restoreSession()
      .then((user) => {
        if (active && version === sessionVersionRef.current) {
          setCurrentUser(user)
          setSessionStatus(user ? 'authenticated' : 'signed-out')
        }
      })
      .catch((error: unknown) => {
        if (active && version === sessionVersionRef.current) {
          setCurrentUser(null)
          setSessionStatus('unverified')
          setSessionNotice({
            kind: 'error',
            message: messageFrom(error, 'Could not check your session.'),
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (registrationPending.current) return
    const submittedForm = event.currentTarget
    const form = new FormData(submittedForm)
    const password = String(form.get('password'))
    setRegistrationNotice(null)
    if (Array.from(password).length < 12) {
      setRegistrationPasswordError(true)
      submittedForm.querySelector<HTMLInputElement>('[name="password"]')?.focus()
      return
    }
    setRegistrationPasswordError(false)
    registrationPending.current = true
    setRegistering(true)
    try {
      const user = await registerUser({
        email: String(form.get('email')),
        username: String(form.get('username')),
        password,
      })
      setRegistrationNotice({
        kind: 'success',
        message: `Account created for ${user.username}. Sign in separately to continue.`,
      })
      submittedForm.reset()
    } catch (error) {
      setRegistrationNotice({
        kind: 'error',
        message: messageFrom(error, 'Registration failed.'),
      })
    } finally {
      registrationPending.current = false
      setRegistering(false)
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loginPending.current || sessionStatus === 'checking' || sessionStatus === 'logging-out') return
    loginPending.current = true
    let version = sessionVersionRef.current
    const destination = returnDestination(location.pathname)
    const submittedForm = event.currentTarget
    setLoggingIn(true)
    setSessionNotice(null)
    const form = new FormData(submittedForm)
    try {
      const user = await login(
        {
          email: String(form.get('email')),
          password: String(form.get('password')),
        },
        () => {
          if (version !== sessionVersionRef.current) return
          editorOrigin.current = null
          collectionMemory.current = null
          forgetAllHandoffs()
          version = ++sessionVersionRef.current
          setSessionVersion(version)
          setCurrentUser(null)
          setSessionStatus('unverified')
        },
      )
      if (version !== sessionVersionRef.current) return
      setCurrentUser(user)
      setSessionStatus('authenticated')
      setRegistrationNotice(null)
      setSessionNotice({ kind: 'success', message: 'Login successful.' })
      void navigate(destination, { replace: true })
      submittedForm.reset()
    } catch (error) {
      if (version !== sessionVersionRef.current) return
      setSessionNotice({
        kind: 'error',
        message: messageFrom(error, 'Login failed.'),
      })
    } finally {
      loginPending.current = false
      if (version === sessionVersionRef.current) setLoggingIn(false)
    }
  }

  async function logOut() {
    if (sessionStatus !== 'authenticated') return
    // Retire old requests immediately, including while DELETE or its recovery GET is pending.
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    const version = ++sessionVersionRef.current
    setSessionVersion(version)
    setSessionStatus('logging-out')
    setCurrentUser(null)
    // Explicit logout discards the former destination, including during recovery.
    void navigate('/', { replace: true })
    setSessionNotice(null)
    setRegistrationNotice(null)
    try {
      await logout()
      if (version !== sessionVersionRef.current) return
      setCurrentUser(null)
      setSessionStatus('signed-out')
      setSessionNotice({ kind: 'success', message: 'Logged out.' })
      void navigate('/', { replace: true })
    } catch {
      try {
        const user = await restoreSession()
        if (version !== sessionVersionRef.current) return
        setCurrentUser(user)
        setSessionStatus(user ? 'authenticated' : 'signed-out')
        void navigate(user ? '/dashboard' : '/', { replace: true })
        setSessionNotice({
          kind: 'error',
          message: user
            ? 'Logout could not be confirmed. You are still signed in. Try again.'
            : 'Logout could not be confirmed. Your session is no longer active.',
        })
      } catch {
        if (version !== sessionVersionRef.current) return
        setCurrentUser(null)
        setSessionStatus('unverified')
        setSessionNotice({ kind: 'error', message: 'Logout could not be confirmed. Check your session before continuing.' })
      }
    }
  }

  async function checkSession() {
    if (loggingIn || sessionStatus !== 'unverified') return
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    const version = ++sessionVersionRef.current
    setSessionVersion(version)
    setSessionStatus('checking')
    setRechecking(true)
    setSessionNotice(null)
    try {
      const user = await restoreSession()
      if (version !== sessionVersionRef.current) return
      setCurrentUser(user)
      setSessionStatus(user ? 'authenticated' : 'signed-out')
    } catch {
      if (version !== sessionVersionRef.current) return
      setCurrentUser(null)
      setSessionStatus('unverified')
      setSessionNotice({ kind: 'error', message: 'Could not check your session. Try again or reload.' })
    } finally {
      if (version === sessionVersionRef.current) setRechecking(false)
    }
  }

  const sessionExpired = useCallback(() => {
    // Check synchronously: an old response can arrive before effect cleanup.
    if (sessionVersion !== sessionVersionRef.current) return
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    setSessionVersion(++sessionVersionRef.current)
    setCurrentUser(null)
    setSessionStatus('signed-out')
    setSessionNotice({ kind: 'error', message: 'Your session expired. Sign in again.' })
  }, [sessionVersion])

  function openEditor(overview: DeckOverview, id?: string) {
    const path = id ? `/decks/${encodeURIComponent(id)}/edit` : '/decks/new'
    const token = navigationToken()
    editorOrigin.current = { token, version: sessionVersion, path, overview }
    setSessionNotice(null)
    void navigate(path, { state: { editorToken: token } })
  }
  const editorToken: unknown = location.state?.editorToken
  const getReturnTo = useCallback((): DeckOverview => {
    const pending = editorOrigin.current
    return pending && pending.version === sessionVersion && pending.path === location.pathname &&
      pending.token === editorToken ? pending.overview : '/decks'
  }, [sessionVersion, location.pathname, editorToken])
  const editor = <DeckEditor key={`editor-${sessionVersion}-${location.pathname}`} onUnauthorized={sessionExpired} getReturnTo={getReturnTo}
    onFinished={(message, destination) => {
      if (sessionVersion !== sessionVersionRef.current) return
      editorOrigin.current = null
      setSessionNotice({ kind: 'success', message })
      void navigate(destination, { replace: true, state: null })
    }} />

  if (sessionStatus === 'authenticated' && currentUser) {
    if (isPublicPath(location.pathname)) return <Box component="main" sx={{ p: 3 }}>
      <Typography component="h1" variant="h4">{location.pathname.startsWith('/claim/') ? 'Profilübernahme' : 'Einladung'}</Typography>
      <Typography>Dieser Link kann noch nicht angezeigt werden.</Typography>
      <Button component={Link} to="/dashboard">Zum Dashboard</Button>
    </Box>
    return (
      <EditorNavigation key={`navigation-${sessionVersion}`} onLogout={logOut}>
        <AppShell user={currentUser} notice={sessionNotice} onLogout={logOut}>
          {isProtectedPath(location.pathname) ? <Routes>
            <Route path="/dashboard" element={
              <Dashboard key={`dashboard-${sessionVersion}`} onUnauthorized={sessionExpired} onOpen={(intent) => {
                setSessionNotice(null)
                void navigate(`/playgroups/${encodeURIComponent(intent.id)}`)
              }} />
            } />
            <Route path="/decks" element={
              <DeckManager key={`decks-${sessionVersion}`} onUnauthorized={sessionExpired} takeMemory={takeCollectionMemory}
                onOpen={(id, memory) => { collectionMemory.current = memory; openEditor('/decks', id) }} />
            } />
            <Route path="/decks/new" element={editor} />
            <Route path="/decks/:deckId/edit" element={editor} />
            <Route path="/playgroups" element={
              <GroupManager key={`groups-${sessionVersion}`} onUnauthorized={sessionExpired} />
            } />
            <Route path="/playgroups/:groupId/games/new" element={<GameEditorPage key={`game-new-${sessionVersion}-${location.pathname}`} currentUser={currentUser} onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />
            <Route path="/playgroups/:groupId/games/:gameId/edit" element={<GameEditorPage key={`game-edit-${sessionVersion}-${location.pathname}`} currentUser={currentUser} onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />
            <Route path="/playgroups/:groupId/games/:gameId" element={
              <GameDetailsPage key={`game-${sessionVersion}-${location.pathname}`} currentUser={currentUser} onUnauthorized={sessionExpired}
                onNotice={setSessionNotice} onEdit={(groupId, gameId) => {
                  void navigate(`${groupUrl(groupId, 'games')}/${encodeURIComponent(gameId)}/edit`)
                }} />
            } />
            {(['overview', 'games', 'statistics', 'members'] as const).map(tab => <Route key={tab}
              path={tab === 'overview' ? '/playgroups/:groupId' : `/playgroups/:groupId/${tab}`}
              element={<GroupPage key={`group-${sessionVersion}-${location.pathname}`} tab={tab} currentUser={currentUser}
                onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />)}
            {['/playgroups/:groupId/statistics/reports', '/playgroups/:groupId/statistics/reports/players',
              '/playgroups/:groupId/statistics/reports/decks', '/playgroups/:groupId/statistics/reports/starting-seats',
              '/playgroups/:groupId/statistics/reports/mana-colors', '/playgroups/:groupId/members/:memberId/decks',
              '/playgroups/:groupId/members/:memberId/decks/new'].map(path => <Route key={path} path={path}
                element={<PendingGroupView key={`${sessionVersion}-${location.pathname}`} onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />)}
          </Routes> : <Navigate to="/dashboard" replace />}
        </AppShell>
      </EditorNavigation>
    )
  }

  return (
    <Box component="main" sx={{
      bgcolor: 'background.default', color: 'text.primary', colorScheme: 'dark',
      fontFamily: theme => theme.typography.fontFamily,
      boxSizing: 'border-box', width: '100%', maxWidth: 'none', m: 0,
      minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
      pl: 'max(16px, env(safe-area-inset-left, 0px))',
      pr: 'max(16px, env(safe-area-inset-right, 0px))',
      pt: 'max(32px, env(safe-area-inset-top, 0px))',
      pb: 'calc(32px + env(safe-area-inset-bottom, 0px))',
      overflowWrap: 'anywhere',
      '& input': { scrollMarginBlock: '24px' },
      // MUI's default dark autofill uses a blue fill; keep auth on our semantic palette.
      '& input:-webkit-autofill': theme => ({
        WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.paper} inset`,
        WebkitTextFillColor: theme.palette.text.primary,
        caretColor: theme.palette.text.primary,
      }),
    }}>
      {location.pathname !== '/' && !isProtectedPath(location.pathname) && !isPublicPath(location.pathname) && <Navigate to="/" replace />}
      {isPublicPath(location.pathname) && <Typography component="h2" variant="h5">Dieser Link kann noch nicht angezeigt werden.</Typography>}
      <Container maxWidth="md" disableGutters>
        <Stack spacing={3}>
          <Box component="header" sx={{ m: 0 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              Commander game tracker
            </Typography>
            <Typography component="h1" variant="wordmark" sx={{ mb: 2 }}>
              MTG Commander Stats
            </Typography>
            <Typography sx={{ color: 'text.secondary' }}>
              A home for your Commander play group’s game statistics.
            </Typography>
          </Box>

          <Card component="section" aria-labelledby="auth-session-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
            <Stack spacing={2}>
              <Typography id="auth-session-heading" component="h2" variant="h6">Your session</Typography>
              <Typography role="status">
                {sessionStatus === 'logging-out' ? 'Logging out…'
                  : sessionStatus === 'checking' ? 'Checking your session…'
                    : sessionStatus === 'unverified' ? 'Your session identity could not be confirmed.'
                      : 'Not signed in.'}
              </Typography>
              {(sessionStatus === 'unverified' || rechecking) && (
                <Button type="button" variant="outlined" disabled={loggingIn}
                  aria-disabled={rechecking} onClick={checkSession} sx={{ alignSelf: 'flex-start' }}>
                  Check session
                </Button>
              )}
              {sessionNotice && (
                <Typography id="auth-session-notice" role={sessionNotice.kind === 'error' ? 'alert' : 'status'}
                  sx={{ color: sessionNotice.kind === 'error' ? 'error.main' : 'success.main' }}>
                  {sessionNotice.message}
                </Typography>
              )}
            </Stack>
          </Card>

          {sessionStatus !== 'logging-out' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3, alignItems: 'start' }}>
              <Card component="section" aria-labelledby="auth-register-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
                <Typography id="auth-register-heading" component="h2" variant="h6" sx={{ mb: 1 }}>Create an account</Typography>
                <Typography sx={{ color: 'text.secondary' }}>
                  Registration creates your account. You will sign in afterward.
                </Typography>
                <Stack component="form" onSubmit={submitRegistration} spacing={3} useFlexGap sx={{ mt: 3 }}
                  aria-describedby={registrationNotice ? 'auth-register-notice' : undefined}>
                  <TextField id="auth-register-email" label="Email" name="email" type="email" autoComplete="email" required fullWidth slotProps={{ inputLabel: { required: false } }} />
                  <TextField id="auth-register-username" label="Username" name="username" autoComplete="username" required fullWidth slotProps={{ inputLabel: { required: false } }} />
                  <TextField id="auth-register-password" label="Password" name="password" type="password" autoComplete="new-password" required fullWidth
                    error={registrationPasswordError}
                    helperText={registrationPasswordError ? 'Password must be at least 12 characters long.' : 'Use at least 12 characters. Whitespace is allowed and counts toward the minimum.'}
                    onChange={() => setRegistrationPasswordError(false)}
                    slotProps={{ inputLabel: { required: false }, formHelperText: { role: registrationPasswordError ? 'alert' : undefined } }} />
                  <Button disabled={registering} type="submit" variant="contained" fullWidth>
                    {registering ? 'Creating account…' : 'Create account'}
                  </Button>
                </Stack>
                <Typography role="status" sx={{ mt: registering ? 2 : 0 }}>{registering ? 'Creating account…' : ''}</Typography>
                {registrationNotice && (
                  <Typography id="auth-register-notice" role={registrationNotice.kind === 'error' ? 'alert' : 'status'}
                    sx={{ mt: 2, color: registrationNotice.kind === 'error' ? 'error.main' : 'success.main' }}>
                    {registrationNotice.message}
                  </Typography>
                )}
              </Card>

              <Card component="section" aria-labelledby="auth-login-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
                <Typography id="auth-login-heading" component="h2" variant="h6">Sign in</Typography>
                <Stack component="form" onSubmit={submitLogin} spacing={3} useFlexGap sx={{ mt: 3 }}
                  aria-describedby={sessionNotice ? 'auth-session-notice' : undefined}>
                  <TextField id="auth-login-email" label="Email" name="email" type="email" autoComplete="email" required fullWidth slotProps={{ inputLabel: { required: false } }} />
                  <TextField id="auth-login-password" label="Password" name="password" type="password" autoComplete="current-password" required fullWidth slotProps={{ inputLabel: { required: false } }} />
                  <Button disabled={loggingIn || sessionStatus === 'checking'} type="submit" variant="contained" fullWidth>
                    {loggingIn ? 'Signing in…' : 'Sign in'}
                  </Button>
                </Stack>
                {import.meta.env.DEV && (
                  <Button component="a" href="/dev/lounge.html" variant="outlined" fullWidth sx={{ mt: 2 }}>
                    Open Tech Playground
                  </Button>
                )}
                <Typography role="status" sx={{ mt: loggingIn ? 2 : 0 }}>{loggingIn ? 'Signing in…' : ''}</Typography>
              </Card>
            </Box>
          )}
        </Stack>
      </Container>
    </Box>
  )
}
