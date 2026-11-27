import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../shared/http/client'
import { login, logout, restoreSession, type CurrentUser } from '../features/auth/api'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import Button from '@mui/material/Button'
import { AppShell } from './AppShell'
import AuthEntry, { type Credentials, type LoginOptions } from '../features/auth/AuthEntry'
import { authCopy } from '../features/auth/authCopy'
import DeckManager, { type CollectionMemory } from '../features/decks/DeckManager'
import DeckEditor, { type DeckOverview } from '../features/decks/DeckEditor'
import { EditorNavigation } from './EditorNavigation'
import GroupManager from '../features/groups/GroupManager'
import Dashboard from '../features/groups/Dashboard'
import GroupPage from '../features/groups/GroupPage'
import GameDetailsPage from '../features/games/GameDetailsPage'
import { groupUrl } from '../features/groups/groupNavigation'
import { isProtectedPath, isPublicPath, returnDestination } from './appRoutes'
import GameEditorPage from '../features/games/GameEditorPage'
import MemberDecksPage from '../features/groups/MemberDecksPage'
import QuickProfileDeckPage from '../features/groups/QuickProfileDeckPage'
import { navigationToken } from './navigationToken'
import { forgetAllHandoffs } from '../features/games/gameHandoff'
import { forgetDirectoryMemories } from '../features/groups/membersModel'
import { createStatisticsMemory, StatisticsMemoryContext, type StatisticsView } from '../features/statistics/statisticsState'
import InvitationPage from '../features/groups/InvitationPage'
import ClaimPage, { claimSuccessMessage } from '../features/claims/ClaimPage'
import { claimSegment, inviteAuthIntent, inviteAuthKey, inviteSegment } from '../features/groups/invitationLink'

const statisticsRoutes: [string, StatisticsView][] = [['', 'landing'], ['/reports', 'chooser'],
  ...(['players', 'decks', 'starting-seats', 'mana-colors'] as const).map((report): [string, StatisticsView] => [`/reports/${report}`, report])]

/** `form`: a failed sign-in attempt, shown in the sign-in form even while the session is unverified (#370). */
export type Notice = { kind: 'success' | 'error'; message: string; form?: true } | null
type SessionStatus = 'checking' | 'signed-out' | 'authenticated' | 'unverified' | 'logging-out'

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
  // #197 report filter/sorts persist only within one group visit of one session.
  const [statisticsMemory] = useState(createStatisticsMemory)
  useEffect(() => { statisticsMemory.retain(location.pathname) }, [statisticsMemory, location.pathname])
  const takeCollectionMemory = useCallback(() => { const memory = collectionMemory.current; collectionMemory.current = null; return memory }, [])
  const sessionVersionRef = useRef(0)
  const [sessionVersion, setSessionVersion] = useState(0)
  const statisticsContext = useMemo(() => ({ memory: statisticsMemory, session: sessionVersion }), [statisticsMemory, sessionVersion])
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking')
  const [sessionNotice, setSessionNotice] = useState<Notice>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const loginPending = useRef(false)
  const [rechecking, setRechecking] = useState(false)
  // Refs, not render state: a login chained after registration runs a closure captured before a re-check began.
  const recheckPending = useRef(false)
  // #200/#247: invitation and claim deep links are public; their auth detour keeps the exact link URL.
  const invitation = inviteSegment(location.pathname)
  const claim = claimSegment(location.pathname)
  const inviteAuth = invitation === null && claim === null ? null : inviteAuthIntent(location.state)

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
      .catch(() => {
        // Uncertain, not a confirmed logout: the entry offers an explicit re-check only.
        if (active && version === sessionVersionRef.current) {
          setCurrentUser(null)
          setSessionStatus('unverified')
          setSessionNotice(null)
        }
      })
    return () => {
      active = false
    }
  }, [])

  /**
   * Resolves true once the server-verified identity is shown; false when the entry should allow a retry.
   * #370: registration calls this right after the account was created, with the same credentials.
   */
  async function submitLogin(credentials: Credentials, { afterRegistration = false }: LoginOptions = {}): Promise<boolean> {
    if (loginPending.current || recheckPending.current || sessionStatus === 'checking' || sessionStatus === 'logging-out') return false
    loginPending.current = true
    let version = sessionVersionRef.current
    let sessionChanged = false
    const destination = returnDestination(location.pathname)
    setLoggingIn(true)
    setSessionNotice(null)
    try {
      const user = await login(credentials, () => {
        if (version !== sessionVersionRef.current) return
        sessionChanged = true
        editorOrigin.current = null
        collectionMemory.current = null
        forgetAllHandoffs()
        forgetDirectoryMemories()
        version = ++sessionVersionRef.current
        setSessionVersion(version)
        setCurrentUser(null)
        setSessionStatus('unverified')
      })
      if (version !== sessionVersionRef.current) return false
      setCurrentUser(user)
      setSessionStatus('authenticated')
      setSessionNotice({ kind: 'success', message: authCopy.loginSuccess })
      void navigate(destination, { replace: true })
      return true
    } catch (error) {
      if (version !== sessionVersionRef.current) return false
      // Never assert whether an account exists; keep credential, server and verification failures distinct.
      setSessionNotice(sessionChanged ? { kind: 'error', message: authCopy.loginUnconfirmed } : {
        kind: 'error', form: true,
        message: afterRegistration ? authCopy.registeredLoginFailed
          : error instanceof ApiError && error.status === 401 ? authCopy.loginFailed : authCopy.loginUnavailable,
      })
      return false
    } finally {
      loginPending.current = false
      if (version === sessionVersionRef.current) setLoggingIn(false)
    }
  }

  /**
   * Explicit logout. `resume` is only honored for a validated `/claim/:code` path (#247 “Anderes Konto verwenden”):
   * after a confirmed 204 the visitor returns to that same link's sign-in detour; every other outcome is unchanged.
   */
  async function logOut(resume?: unknown) {
    if (sessionStatus !== 'authenticated') return
    const claimReturn = typeof resume === 'string' && claimSegment(resume) !== null ? resume : null
    // Retire old requests immediately, including while DELETE or its recovery GET is pending.
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    forgetDirectoryMemories()
    const version = ++sessionVersionRef.current
    setSessionVersion(version)
    setSessionStatus('logging-out')
    setCurrentUser(null)
    // Explicit logout discards the former destination, including during recovery.
    void navigate('/', { replace: true })
    setSessionNotice(null)
    try {
      await logout()
      if (version !== sessionVersionRef.current) return
      // The router transitions to the return URL. Reveal the form in that same
      // transition so it cannot accept input with a stale destination or focus.
      startTransition(() => {
        setCurrentUser(null)
        setSessionStatus('signed-out')
        setSessionNotice({ kind: 'success', message: authCopy.loggedOut })
        void navigate(claimReturn ?? '/', { replace: true, state: claimReturn ? { [inviteAuthKey]: 'login' } : null })
      })
    } catch {
      try {
        const user = await restoreSession()
        if (version !== sessionVersionRef.current) return
        setCurrentUser(user)
        setSessionStatus(user ? 'authenticated' : 'signed-out')
        void navigate(user ? '/dashboard' : '/', { replace: true })
        setSessionNotice({
          kind: 'error',
          message: user ? authCopy.logoutStillSignedIn : authCopy.logoutInactive,
        })
      } catch {
        if (version !== sessionVersionRef.current) return
        setCurrentUser(null)
        setSessionStatus('unverified')
        setSessionNotice({ kind: 'error', message: authCopy.logoutUnverified })
      }
    }
  }

  async function checkSession() {
    if (loginPending.current || recheckPending.current || sessionStatus !== 'unverified') return
    recheckPending.current = true
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    forgetDirectoryMemories()
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
    } finally {
      // Always release the retry, even when a newer session version superseded this check.
      recheckPending.current = false
      setRechecking(false)
    }
  }

  /**
   * #247: the shared session switched to another account (e.g. in another tab) while a claim was being confirmed.
   * Retire everything bound to the old identity, then re-read the authoritative identity like a session check.
   */
  async function accountChanged(version: number) {
    if (version !== sessionVersionRef.current) return
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    forgetDirectoryMemories()
    const next = ++sessionVersionRef.current
    setSessionVersion(next)
    setCurrentUser(null)
    setSessionStatus('checking')
    try {
      const user = await restoreSession()
      if (next !== sessionVersionRef.current) return
      setCurrentUser(user)
      setSessionStatus(user ? 'authenticated' : 'signed-out')
      setSessionNotice({ kind: 'error', message: 'Das angemeldete Konto hat sich geändert. Es wurde nichts übernommen. Prüfe das Konto und bestätige erneut.' })
    } catch {
      if (next !== sessionVersionRef.current) return
      setSessionStatus('unverified')
      setSessionNotice(null)
    }
  }

  const sessionExpired = useCallback(() => {
    // Check synchronously: an old response can arrive before effect cleanup.
    if (sessionVersion !== sessionVersionRef.current) return
    editorOrigin.current = null
    collectionMemory.current = null
    forgetAllHandoffs()
    forgetDirectoryMemories()
    setSessionVersion(++sessionVersionRef.current)
    setCurrentUser(null)
    setSessionStatus('signed-out')
    setSessionNotice({ kind: 'error', message: authCopy.expired })
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

  const authenticated = sessionStatus === 'authenticated' && currentUser !== null
  if (invitation !== null && (authenticated || sessionStatus === 'checking' || (sessionStatus === 'signed-out' && !inviteAuth))) {
    // Keyed by session: login, logout or an account switch discards all invitation presentation state.
    return <InvitationPage key={`invite-${sessionVersion}-${location.pathname}`} segment={invitation} user={authenticated ? currentUser : null}
      checking={sessionStatus === 'checking'} notice={sessionNotice} onUnauthorized={sessionExpired} />
  }
  if (claim !== null && (authenticated || sessionStatus === 'checking' || (sessionStatus === 'signed-out' && !inviteAuth))) {
    const version = sessionVersion
    // Keyed by session: login, logout or an account switch discards names, confirmation and in-flight requests.
    return <ClaimPage key={`claim-${sessionVersion}-${location.pathname}`} segment={claim} user={authenticated ? currentUser : null}
      checking={sessionStatus === 'checking'} notice={sessionNotice} onUnauthorized={sessionExpired}
      onSwitchAccount={() => { void logOut(location.pathname) }}
      onAccountChanged={() => { void accountChanged(version) }}
      onClaimed={() => {
        if (version !== sessionVersionRef.current) return
        // Replace the consumed link; the collection mounts fresh and re-reads this account's groups. BrowserRouter
        // applies location changes in a transition (flushSync only works in data routers), so the notice joins that
        // transition: both commit together and the claim page never renders the success message itself (#348).
        startTransition(() => {
          setSessionNotice({ kind: 'success', message: claimSuccessMessage })
          void navigate('/playgroups', { replace: true, state: null })
        })
      }} />
  }

  if (sessionStatus === 'authenticated' && currentUser) {
    return (
      <StatisticsMemoryContext.Provider value={statisticsContext}>
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
            {(['overview', 'games', 'members'] as const).map(tab => <Route key={tab}
              path={tab === 'overview' ? '/playgroups/:groupId' : `/playgroups/:groupId/${tab}`}
              element={<GroupPage key={`group-${sessionVersion}-${location.pathname}`} tab={tab} currentUser={currentUser}
                onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />)}
            {statisticsRoutes.map(([path, view]) => <Route key={path} path={`/playgroups/:groupId/statistics${path}`}
              element={<GroupPage key={`group-${sessionVersion}-${location.pathname}`} tab="statistics" statisticsView={view} currentUser={currentUser}
                onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />)}
            <Route path="/playgroups/:groupId/members/:memberId/decks"
              element={<MemberDecksPage key={`${sessionVersion}-${location.pathname}`} onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />
            <Route path="/playgroups/:groupId/members/:memberId/decks/new"
              element={<QuickProfileDeckPage key={`${sessionVersion}-${location.pathname}`} onUnauthorized={sessionExpired} onNotice={setSessionNotice} />} />
          </Routes> : <Navigate to="/dashboard" replace />}
        </AppShell>
      </EditorNavigation>
      </StatisticsMemoryContext.Provider>
    )
  }

  return (
    <>
      {location.pathname !== '/' && !isProtectedPath(location.pathname) && !isPublicPath(location.pathname) && <Navigate to="/" replace />}
      {/* Keyed by detour: another invitation/claim link or intent starts with a fresh form. */}
      <AuthEntry key={`auth-${invitation ?? claim ?? ''}-${inviteAuth ?? ''}`}
        status={sessionStatus === 'authenticated' ? 'checking' : sessionStatus}
        rechecking={rechecking} loggingIn={loggingIn} notice={sessionNotice}
        context={claim !== null ? 'claim' : invitation !== null ? 'invitation' : null} contextPath={location.pathname}
        initialMode={inviteAuth ?? 'login'} focusOnReveal={inviteAuth !== null}
        onLogin={submitLogin} onRecheck={() => { void checkSession() }} onDismissNotice={() => setSessionNotice(null)}
        footer={import.meta.env.DEV && (
          <Button component="a" href="/dev/lounge.html" variant="text" size="small" sx={{ alignSelf: 'center' }}>
            Open Tech Playground
          </Button>
        )} />
    </>
  )
}
