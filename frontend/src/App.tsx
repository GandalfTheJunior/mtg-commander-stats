import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  login,
  logout,
  registerUser,
  restoreSession,
  type CurrentUser,
} from './api'
import DeckManager from './DeckManager'
import GroupManager from './GroupManager'

type Notice = { kind: 'success' | 'error'; message: string } | null
type SessionStatus = 'checking' | 'signed-out' | 'authenticated' | 'unverified' | 'logging-out'

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function App() {
  // Session transitions retire protected state even when the user UUID is unchanged.
  const sessionVersionRef = useRef(0)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking')
  const [registrationNotice, setRegistrationNotice] = useState<Notice>(null)
  const [sessionNotice, setSessionNotice] = useState<Notice>(null)
  const [registering, setRegistering] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

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
      setRegistering(false)
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loggingIn || sessionStatus === 'checking' || sessionStatus === 'logging-out') return
    let version = sessionVersionRef.current
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
      submittedForm.reset()
    } catch (error) {
      if (version !== sessionVersionRef.current) return
      setSessionNotice({
        kind: 'error',
        message: messageFrom(error, 'Login failed.'),
      })
    } finally {
      if (version === sessionVersionRef.current) setLoggingIn(false)
    }
  }

  async function logOut() {
    if (sessionStatus !== 'authenticated') return
    // Retire old requests immediately, including while DELETE or its recovery GET is pending.
    const version = ++sessionVersionRef.current
    setSessionVersion(version)
    setSessionStatus('logging-out')
    setSessionNotice(null)
    setRegistrationNotice(null)
    try {
      await logout()
      if (version !== sessionVersionRef.current) return
      setCurrentUser(null)
      setSessionStatus('signed-out')
      setSessionNotice({ kind: 'success', message: 'Logged out.' })
    } catch {
      try {
        const user = await restoreSession()
        if (version !== sessionVersionRef.current) return
        setCurrentUser(user)
        setSessionStatus(user ? 'authenticated' : 'signed-out')
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
    const version = ++sessionVersionRef.current
    setSessionVersion(version)
    setSessionStatus('checking')
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
    }
  }

  const sessionExpired = useCallback(() => {
    // Check synchronously: an old response can arrive before effect cleanup.
    if (sessionVersion !== sessionVersionRef.current) return
    setSessionVersion(++sessionVersionRef.current)
    setCurrentUser(null)
    setSessionStatus('signed-out')
    setSessionNotice({ kind: 'error', message: 'Your session expired. Sign in again.' })
  }, [sessionVersion])

  return (
    <main>
      <header>
        <p className="eyebrow">Commander game tracker</p>
        <h1>MTG Commander Stats</h1>
        <p>A home for your Commander play group’s game statistics.</p>
      </header>

      <section className="session" aria-live="polite">
        <h2>Your session</h2>
        {sessionStatus === 'logging-out' ? (
          <p>Logging out…</p>
        ) : sessionStatus === 'checking' ? (
          <p>Checking your session…</p>
        ) : sessionStatus === 'authenticated' && currentUser ? (
          <p>
            Signed in as <strong>{currentUser.username}</strong>.
          </p>
        ) : sessionStatus === 'unverified' ? (
          <p>Your session identity could not be confirmed.</p>
        ) : (
          <p>Not signed in.</p>
        )}
        {sessionStatus === 'authenticated' && (
          <button type="button" onClick={logOut}>Log out</button>
        )}
        {sessionStatus === 'unverified' && (
          <button type="button" disabled={loggingIn} onClick={checkSession}>Check session</button>
        )}
        {sessionNotice && (
          <p className={sessionNotice.kind} role="status">{sessionNotice.message}</p>
        )}
      </section>

      {sessionStatus !== 'authenticated' && sessionStatus !== 'logging-out' && (
        <div className="forms">
          <section>
            <h2>Create an account</h2>
            <p>Registration creates your account. You will sign in afterward.</p>
            <form onSubmit={submitRegistration}>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Username
                <input name="username" autoComplete="username" required />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </label>
              <button disabled={registering} type="submit">
                {registering ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            {registrationNotice && (
              <p className={registrationNotice.kind} role="status">
                {registrationNotice.message}
              </p>
            )}
          </section>

          <section>
            <h2>Sign in</h2>
            <form onSubmit={submitLogin}>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button disabled={loggingIn || sessionStatus === 'checking'} type="submit">
                {loggingIn ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        </div>
      )}

      {sessionStatus === 'authenticated' && currentUser && (
        <>
          <DeckManager key={`decks-${sessionVersion}`} onUnauthorized={sessionExpired} />
          <GroupManager key={`groups-${sessionVersion}`} onUnauthorized={sessionExpired} />
        </>
      )}
    </main>
  )
}
