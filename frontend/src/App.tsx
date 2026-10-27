import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  login,
  logout,
  registerUser,
  restoreSession,
  type CurrentUser,
} from './api'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AppShell } from './AppShell'
import DeckManager from './DeckManager'
import DeckEditor, { type DeckOverview } from './DeckEditor'
import { EditorNavigation } from './EditorNavigation'
import GroupManager from './GroupManager'
import Dashboard from './Dashboard'
import GroupPage from './GroupPage'
import GameDetailsPage from './GameDetailsPage'
import { groupUrl } from './groupNavigation'
import type { GroupTab } from './groupNavigation'
import { navigationToken } from './navigationToken'

export type Notice = { kind: 'success' | 'error'; message: string } | null
type SessionStatus = 'checking' | 'signed-out' | 'authenticated' | 'unverified' | 'logging-out'
const topLevelPaths = ['/dashboard', '/playgroups', '/decks']
const isSupportedPath = (path: string) => topLevelPaths.includes(path) || path === '/decks/new' || /^\/decks\/[^/]+\/edit$/.test(path) || /^\/playgroups\/[^/]+(?:\/invitation-code|\/games\/[^/]+)?$/.test(path)

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  // Session transitions retire protected state even when the user UUID is unchanged.
  const gameEdit = useRef<{ token: string; version: number; path: string; gameId: string } | null>(null)
  // Only the render reached by this navigation can read the opaque intent.
  // Browser history/reload cannot replay it, even for the same group/session.
  useEffect(() => { gameEdit.current = null }, [location.key])
  const codeOrigin = useRef<{ token: string; version: number; path: string; tab: GroupTab } | null>(null)
  const editorOrigin = useRef<{ token: string; version: number; path: string; overview: DeckOverview } | null>(null)
  useEffect(() => {
    if (codeOrigin.current?.path !== location.pathname) codeOrigin.current = null
    if (editorOrigin.current?.path !== location.pathname) editorOrigin.current = null
  }, [location.pathname])
  const sessionVersionRef = useRef(0)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking')
  const [registrationNotice, setRegistrationNotice] = useState<Notice>(null)
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
    registrationPending.current = true
    const submittedForm = event.currentTarget
    setRegistering(true)
    setRegistrationNotice(null)
    const form = new FormData(submittedForm)
    try {
      const user = await registerUser({
        email: String(form.get('email')),
        username: String(form.get('username')),
        password: String(form.get('password')),
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
    const destination = isSupportedPath(location.pathname)
      ? location.pathname + location.search : '/dashboard'
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
          gameEdit.current = null
          editorOrigin.current = null
          codeOrigin.current = null
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
    gameEdit.current = null
    editorOrigin.current = null
    codeOrigin.current = null
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
    gameEdit.current = null
    editorOrigin.current = null
    codeOrigin.current = null
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
    gameEdit.current = null
    editorOrigin.current = null
    codeOrigin.current = null
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
      editorToken === pending.token ? pending.overview : '/decks'
  }, [sessionVersion, location.pathname, editorToken])
  const codeToken: unknown = location.state?.codeToken
  const getCodeReturn = useCallback((): GroupTab => {
    const origin = codeOrigin.current
    return origin && origin.version === sessionVersion && origin.path === location.pathname && origin.token === codeToken ? origin.tab : 'games'
  }, [sessionVersion, location.pathname, codeToken])
  const gameEditToken: unknown = location.state?.gameEditToken
  const getGameEdit = useCallback(() => {
    const intent = gameEdit.current
    return intent && intent.version === sessionVersion && intent.path === location.pathname && intent.token === gameEditToken ? intent.gameId : undefined
  }, [sessionVersion, location.pathname, gameEditToken])
  const editor = <DeckEditor key={`editor-${sessionVersion}-${location.pathname}`} onUnauthorized={sessionExpired} getReturnTo={getReturnTo} onLogout={logOut}
    onFinished={(message, destination) => {
      if (sessionVersion !== sessionVersionRef.current) return
      gameEdit.current = null
      editorOrigin.current = null
      codeOrigin.current = null
      setSessionNotice({ kind: 'success', message })
      void navigate(destination, { replace: true, state: null })
    }} />

  if (sessionStatus === 'authenticated' && currentUser) {
    return (
      <EditorNavigation key={`navigation-${sessionVersion}`} onLogout={logOut}>
        <AppShell user={currentUser} notice={sessionNotice} onLogout={logOut}>
          {isSupportedPath(location.pathname) ? <Routes>
            <Route path="/dashboard" element={
              <Dashboard key={`dashboard-${sessionVersion}`} onUnauthorized={sessionExpired} onOpen={(intent) => {
                if (intent.kind !== 'group') { openEditor('/dashboard', intent.kind === 'deck' ? intent.id : undefined); return }
                setSessionNotice(null)
                void navigate(`/playgroups/${encodeURIComponent(intent.id)}`)
              }} />
            } />
            <Route path="/decks" element={
              <DeckManager key={`decks-${sessionVersion}`} onUnauthorized={sessionExpired} onOpen={id => openEditor('/decks', id)} />
            } />
            <Route path="/decks/new" element={editor} />
            <Route path="/decks/:deckId/edit" element={editor} />
            <Route path="/playgroups" element={
              <GroupManager key={`groups-${sessionVersion}`} onUnauthorized={sessionExpired} />
            } />
            <Route path="/playgroups/:groupId/games/:gameId" element={
              <GameDetailsPage key={`game-${sessionVersion}-${location.pathname}`} currentUser={currentUser} onUnauthorized={sessionExpired}
                onNotice={setSessionNotice} onEdit={(groupId, gameId) => {
                  if (sessionVersion !== sessionVersionRef.current) return
                  const token = navigationToken()
                  const path = groupUrl(groupId)
                  gameEdit.current = { token, version: sessionVersion, path, gameId }
                  setSessionNotice(null)
                  void navigate(path, { state: { gameEditToken: token } })
                }} />
            } />
            {['/playgroups/:groupId', '/playgroups/:groupId/invitation-code'].map(path => <Route key={path} path={path} element={
              <GroupPage key={`group-${sessionVersion}-${location.pathname}`} currentUser={currentUser} onUnauthorized={sessionExpired}
                onNotice={notice => setSessionNotice(notice)}
                getCodeReturn={getCodeReturn} getGameEdit={getGameEdit}
                onOpenCode={(id, tab) => {
                  const path = `/playgroups/${encodeURIComponent(id)}/invitation-code`
                  const token = navigationToken()
                  codeOrigin.current = { token, version: sessionVersion, path, tab }
                  setSessionNotice(null)
                  void navigate(path, { state: { codeToken: token } })
                }} />
            } />)}
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
      {location.pathname !== '/' && !isSupportedPath(location.pathname) && <Navigate to="/" replace />}
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
                  <TextField id="auth-register-password" label="Password" name="password" type="password" autoComplete="new-password" required fullWidth slotProps={{ inputLabel: { required: false } }} />
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
