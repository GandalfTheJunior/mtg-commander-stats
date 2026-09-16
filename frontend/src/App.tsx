import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  login,
  registerUser,
  restoreSession,
  type CurrentUser,
} from './api'
import DeckManager from './DeckManager'

type Notice = { kind: 'success' | 'error'; message: string } | null
type SessionStatus = 'checking' | 'signed-out' | 'authenticated' | 'unverified'

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking')
  const [registrationNotice, setRegistrationNotice] = useState<Notice>(null)
  const [loginNotice, setLoginNotice] = useState<Notice>(null)
  const [registering, setRegistering] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    let active = true
    restoreSession()
      .then((user) => {
        if (active) {
          setCurrentUser(user)
          setSessionStatus(user ? 'authenticated' : 'signed-out')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCurrentUser(null)
          setSessionStatus('unverified')
          setLoginNotice({
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
    const submittedForm = event.currentTarget
    setLoggingIn(true)
    setLoginNotice(null)
    const form = new FormData(submittedForm)
    try {
      const user = await login(
        {
          email: String(form.get('email')),
          password: String(form.get('password')),
        },
        () => {
          setCurrentUser(null)
          setSessionStatus('unverified')
        },
      )
      setCurrentUser(user)
      setSessionStatus('authenticated')
      setLoginNotice({ kind: 'success', message: 'Login successful.' })
      submittedForm.reset()
    } catch (error) {
      setLoginNotice({
        kind: 'error',
        message: messageFrom(error, 'Login failed.'),
      })
    } finally {
      setLoggingIn(false)
    }
  }

  const deckSessionExpired = useCallback(() => {
    setCurrentUser(null)
    setSessionStatus('signed-out')
    setLoginNotice({ kind: 'error', message: 'Your session expired. Sign in again.' })
  }, [])

  return (
    <main>
      <header>
        <p className="eyebrow">Commander game tracker</p>
        <h1>MTG Commander Stats</h1>
        <p>A home for your Commander play group’s game statistics.</p>
      </header>

      <section className="session" aria-live="polite">
        <h2>Your session</h2>
        {sessionStatus === 'checking' ? (
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
      </section>

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
          {loginNotice && (
            <p className={loginNotice.kind} role="status">
              {loginNotice.message}
            </p>
          )}
        </section>
      </div>

      {sessionStatus === 'authenticated' && currentUser && (
        <DeckManager onUnauthorized={deckSessionExpired} />
      )}
    </main>
  )
}
