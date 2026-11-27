import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import SvgIcon from '@mui/material/SvgIcon'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { RegistrationError, registerUser, type RegistrationFieldError } from './api'
import { authCopy } from './authCopy'

/** Signed-out session states owned by App; `authenticated` never renders this entry. */
export type AuthStatus = 'checking' | 'signed-out' | 'unverified' | 'logging-out'
export type AuthMode = 'login' | 'register'
/** #200 invitation or #247 claim detour whose public preview remains the return destination. */
export type AuthContext = 'invitation' | 'claim' | null
export type AuthNotice = { kind: 'success' | 'error'; message: string } | null
export type Credentials = { email: string; password: string }

const contextNotices: Record<Exclude<AuthContext, null>, Record<AuthMode, string>> = {
  invitation: {
    login: 'Melde dich an, um mit deiner Playgroup-Einladung fortzufahren.',
    register: 'Erstelle ein Konto und melde dich danach an, um mit deiner Playgroup-Einladung fortzufahren.',
  },
  claim: {
    login: 'Melde dich an, um mit der Übernahme des Schnellprofils fortzufahren.',
    register: 'Erstelle ein Konto und melde dich danach an, um mit der Übernahme des Schnellprofils fortzufahren.',
  },
}

const fieldMessages = {
  emailRequired: 'Bitte gib deine E-Mail-Adresse ein.',
  emailInvalid: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  emailTaken: 'Diese E-Mail-Adresse ist bereits registriert.',
  passwordRequired: 'Bitte gib dein Passwort ein.',
  passwordShort: 'Das Passwort muss mindestens 12 Zeichen lang sein.',
  passwordBlank: 'Das Passwort darf nicht nur aus Leerzeichen bestehen.',
  usernameRequired: 'Bitte gib einen Benutzernamen ein.',
  usernameInvalid: 'Der Benutzername enthält nicht unterstützte Zeichen oder mehrere Leerzeichen hintereinander.',
  usernameReserved: 'Dieser Benutzername ist reserviert.',
  usernameTaken: 'Dieser Benutzername ist bereits vergeben.',
  usernameLong: (max: number) => `Der Benutzername darf höchstens ${max} Zeichen lang sein.`,
  registrationInvalid: 'Bitte überprüfe deine Eingaben.',
  registrationUnavailable: 'Die Registrierung ist gerade nicht möglich. Bitte prüfe deine Verbindung und versuche es erneut.',
}

type RegisterField = 'email' | 'username' | 'password'
type LoginField = 'email' | 'password'
type FieldErrors<F extends string> = Partial<Record<F, string>>

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', margin: '-1px', p: 0, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const

// Code points, not UTF-16 units, matching the server's minimum; passwords are never trimmed.
const passwordTooShort = (password: string) => Array.from(password).length < 12
const plausibleEmail = (email: string) => /^[^\s@]+@[^\s@]+$/.test(email.trim())

function serverFieldMessage(error: RegistrationFieldError): [RegisterField, string] | null {
  switch (error.code) {
    case 'INVALID_EMAIL': return ['email', fieldMessages.emailInvalid]
    case 'USERNAME_BLANK': return ['username', fieldMessages.usernameRequired]
    case 'NAME_INVALID_CHARACTERS': return ['username', fieldMessages.usernameInvalid]
    case 'NAME_TOO_LONG': return error.maxLength ? ['username', fieldMessages.usernameLong(error.maxLength)] : null
    case 'USERNAME_RESERVED': return ['username', fieldMessages.usernameReserved]
    case 'USERNAME_TAKEN': return ['username', fieldMessages.usernameTaken]
    case 'PASSWORD_BLANK': return ['password', fieldMessages.passwordBlank]
    case 'PASSWORD_TOO_SHORT': return ['password', fieldMessages.passwordShort]
    default: return null
  }
}

/** Field-attributable errors where the response allows it; otherwise one general message above the form. */
function registrationFailure(error: unknown): { fields: FieldErrors<RegisterField>; general: string | null } {
  if (!(error instanceof RegistrationError)) return { fields: {}, general: fieldMessages.registrationUnavailable }
  const fields: FieldErrors<RegisterField> = {}
  let unattributed = false
  for (const fieldError of error.fieldErrors) {
    const mapped = serverFieldMessage(fieldError)
    if (mapped) fields[mapped[0]] ??= mapped[1]
    else unattributed = true
  }
  // The duplicate-email conflict carries no field list; its stable server detail identifies the field.
  if (error.status === 409 && error.fieldErrors.length === 0 && error.message === 'Email is already registered.') {
    fields.email = fieldMessages.emailTaken
  }
  if (Object.keys(fields).length > 0) return { fields, general: unattributed ? fieldMessages.registrationInvalid : null }
  if (error.status === 400 || error.status === 409) return { fields, general: fieldMessages.registrationInvalid }
  return { fields, general: fieldMessages.registrationUnavailable }
}

function VisibilityIcon({ visible }: { visible: boolean }) {
  return <SvgIcon fontSize="small" aria-hidden="true">
    {visible
      ? <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7M2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2m4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3z" />
      : <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3" />}
  </SvgIcon>
}

type FieldProps = {
  id: string
  label: string
  name: string
  error?: string | undefined
  hint?: string
  onChange: (value: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
}

/**
 * Uncontrolled on purpose: a controlled React input mirrors its value into the DOM `value` attribute,
 * which would expose the typed password in the page markup. Unmounting the field discards the secret.
 */
function PasswordField({ autoComplete, ...props }: FieldProps & { autoComplete: 'current-password' | 'new-password' }) {
  const [visible, setVisible] = useState(false)
  const helper = props.error ?? props.hint
  return <TextField id={props.id} label={props.label} name={props.name} type={visible ? 'text' : 'password'}
    autoComplete={autoComplete} required fullWidth error={Boolean(props.error)} helperText={helper}
    inputRef={props.inputRef} onChange={event => props.onChange(event.target.value)}
    slotProps={{
      inputLabel: { required: false },
      htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false },
      input: {
        endAdornment: <InputAdornment position="end">
          {/* type="button": toggling never submits; only this field's visibility changes. */}
          <IconButton type="button" edge="end" aria-controls={props.id}
            aria-label={visible ? authCopy.hidePassword : authCopy.showPassword}
            onClick={() => setVisible(value => !value)} onMouseDown={event => event.preventDefault()}
            sx={{ width: 44, height: 44 }}>
            <VisibilityIcon visible={visible} />
          </IconButton>
        </InputAdornment>,
      },
    }} />
}

function PlainField({ type, autoComplete, value, ...props }: FieldProps & { type: 'email' | 'text'; autoComplete: 'email' | 'username'; value: string }) {
  return <TextField id={props.id} label={props.label} name={props.name} value={value} type={type} autoComplete={autoComplete}
    required fullWidth error={Boolean(props.error)} helperText={props.error}
    inputRef={props.inputRef} onChange={event => props.onChange(event.target.value)}
    slotProps={{
      inputLabel: { required: false },
      htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false },
    }} />
}

function Brand() {
  return <Box component="header" sx={{ m: 0, textAlign: 'center' }}>
    <Typography component="h1" variant="wordmark" sx={{ mb: 1 }}>MTG Commander Stats</Typography>
    <Typography sx={{ color: 'text.secondary' }}>{authCopy.intro}</Typography>
  </Box>
}

function Progress({ label }: { label: string }) {
  return <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center', minHeight: 48 }}>
    <CircularProgress size={20} color="secondary" aria-hidden="true"
      sx={{ '@media (prefers-reduced-motion: reduce)': { animation: 'none', '& circle': { animation: 'none' } } }} />
    <Typography>{label}</Typography>
  </Stack>
}

const focus = (element: HTMLElement | null | undefined) => element?.focus()
/** Restore a recoverable focus target when a request disabled the focused control. */
function restoreFocus(form: HTMLElement | null, fallback: HTMLElement | null) {
  if (!form?.contains(document.activeElement)) focus(fallback)
}

type Props = {
  status: AuthStatus
  /** A user-requested session re-check is running; the retry view stays mounted to keep its focus. */
  rechecking: boolean
  /** Login is in flight, including CSRF rotation and identity verification. */
  loggingIn: boolean
  notice: AuthNotice
  context: AuthContext
  contextPath: string
  initialMode: AuthMode
  /** Focus the first field in the commit that reveals the form (invitation/claim detours). */
  focusOnReveal: boolean
  onLogin: (credentials: Credentials) => Promise<boolean>
  onRecheck: () => void
  onDismissNotice: () => void
  footer?: ReactNode
}

/**
 * #277 shared signed-out entry: one form at a time (sign-in by default), German copy, inline field errors,
 * general errors above the affected form, and explicit session-check recovery. The session lifecycle stays in App.
 */
export default function AuthEntry(props: Props) {
  const { status, rechecking, loggingIn, notice, context } = props
  const [mode, setMode] = useState<AuthMode>(props.initialMode)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginErrors, setLoginErrors] = useState<FieldErrors<LoginField>>({})
  const [registration, setRegistration] = useState({ email: '', username: '' })
  const [registrationErrors, setRegistrationErrors] = useState<FieldErrors<RegisterField>>({})
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const [registering, setRegistering] = useState(false)
  const registrationPending = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const loginEmailRef = useRef<HTMLInputElement>(null)
  const loginPasswordRef = useRef<HTMLInputElement>(null)
  const registerEmailRef = useRef<HTMLInputElement>(null)
  const registerUsernameRef = useRef<HTMLInputElement>(null)
  const registerPasswordRef = useRef<HTMLInputElement>(null)
  const registerField = (field: RegisterField) =>
    (field === 'email' ? registerEmailRef : field === 'username' ? registerUsernameRef : registerPasswordRef).current
  const pendingFocus = useRef<'heading' | 'login-password' | null>(null)

  // Login keeps its form (with progress) while CSRF rotation and identity verification run.
  const view = loggingIn ? 'form'
    : rechecking || status === 'unverified' ? 'unverified'
      : status === 'signed-out' ? 'form'
        : status
  // Leaving the form (verification failure, logout, session check) unmounts it and discards typed passwords.
  const showForm = view === 'form'

  useLayoutEffect(() => {
    if (!props.focusOnReveal || !showForm) return
    focus(document.getElementById(mode === 'login' ? 'auth-login-email' : 'auth-register-email'))
    // Only the commit that reveals the form; later mode switches manage their own focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusOnReveal, showForm])

  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    focus(target === 'heading' ? headingRef.current : loginPasswordRef.current)
  }, [mode, registered])

  function switchMode(next: AuthMode) {
    if (registering || loggingIn) return
    props.onDismissNotice()
    setRegistered(false)
    setLoginErrors({})
    setRegistrationErrors({})
    setRegistrationError(null)
    pendingFocus.current = 'heading'
    setMode(next)
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loggingIn) return
    const password = loginPasswordRef.current?.value ?? ''
    const errors: FieldErrors<LoginField> = {}
    if (!loginEmail.trim()) errors.email = fieldMessages.emailRequired
    if (!password) errors.password = fieldMessages.passwordRequired
    setLoginErrors(errors)
    if (errors.email || errors.password) {
      focus(errors.email ? loginEmailRef.current : loginPasswordRef.current)
      return
    }
    setRegistered(false)
    const form = formRef.current
    const failed = !await props.onLogin({ email: loginEmail, password })
    if (failed) restoreFocus(form, loginPasswordRef.current)
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (registrationPending.current) return
    const { email, username } = registration
    const password = registerPasswordRef.current?.value ?? ''
    const errors: FieldErrors<RegisterField> = {}
    if (!email.trim()) errors.email = fieldMessages.emailRequired
    else if (!plausibleEmail(email)) errors.email = fieldMessages.emailInvalid
    if (!username.trim()) errors.username = fieldMessages.usernameRequired
    if (passwordTooShort(password)) errors.password = fieldMessages.passwordShort
    setRegistrationErrors(errors)
    setRegistrationError(null)
    const firstInvalid = (['email', 'username', 'password'] as const).find(field => errors[field])
    if (firstInvalid) {
      focus(registerField(firstInvalid))
      return
    }
    props.onDismissNotice()
    registrationPending.current = true
    setRegistering(true)
    const form = formRef.current
    try {
      // Exactly as entered: the server owns normalization and password rules.
      await registerUser({ email, username, password })
      // Registration never authenticates: return to sign-in with only the email carried over.
      setRegistration({ email: '', username: '' })
      setLoginEmail(email)
      setLoginErrors({})
      setRegistered(true)
      pendingFocus.current = 'login-password'
      setMode('login')
    } catch (error) {
      const failure = registrationFailure(error)
      setRegistrationErrors(failure.fields)
      setRegistrationError(failure.general)
      const firstServerInvalid = (['email', 'username', 'password'] as const).find(field => failure.fields[field])
      if (firstServerInvalid) focus(registerField(firstServerInvalid))
      else restoreFocus(form, registerEmailRef.current)
    } finally {
      registrationPending.current = false
      setRegistering(false)
    }
  }

  const loginNotice = mode === 'login' ? (registered ? { kind: 'success' as const, message: authCopy.registered } : notice) : null
  const generalError = mode === 'login' ? (loginNotice?.kind === 'error' ? loginNotice.message : null) : registrationError
  const generalSuccess = loginNotice?.kind === 'success' ? loginNotice.message : null
  const pendingLabel = mode === 'login' ? (loggingIn ? authCopy.pendingLogin : '') : (registering ? authCopy.pendingRegister : '')
  const heading = mode === 'login' ? authCopy.loginHeading : authCopy.registerHeading
  const errorId = `auth-${mode}-error`

  return (
    <Box component="main" sx={{
      bgcolor: 'background.default', color: 'text.primary', colorScheme: 'dark',
      fontFamily: theme => theme.typography.fontFamily,
      boxSizing: 'border-box', width: '100%', maxWidth: 'none', m: 0,
      minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
      pl: 'max(16px, env(safe-area-inset-left, 0px))',
      pr: 'max(16px, env(safe-area-inset-right, 0px))',
      pt: { xs: 'max(32px, env(safe-area-inset-top, 0px))', md: 'max(80px, env(safe-area-inset-top, 0px))' },
      pb: 'calc(32px + env(safe-area-inset-bottom, 0px))',
      overflowWrap: 'anywhere',
      // Keep a focused field clear of the software keyboard and the viewport edge.
      '& input': { scrollMarginBlock: '24px' },
      // MUI's default dark autofill uses a blue fill; keep auth on our semantic palette.
      '& input:-webkit-autofill': theme => ({
        WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.paper} inset`,
        WebkitTextFillColor: theme.palette.text.primary,
        caretColor: theme.palette.text.primary,
      }),
    }}>
      <Container maxWidth={false} disableGutters sx={{ maxWidth: 440 }}>
        <Stack spacing={3}>
          <Brand />

          {(view === 'checking' || view === 'logging-out') &&
            <Progress label={view === 'checking' ? authCopy.checking : authCopy.loggingOut} />}

          {view === 'unverified' && (
            <Card component="section" aria-labelledby="auth-unverified-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
              <Stack spacing={2}>
                <Typography id="auth-unverified-heading" component="h2" variant="h6">{authCopy.unverifiedHeading}</Typography>
                {/* Remounted after each failed check so a repeated failure is announced again. */}
                {rechecking ? <Progress label={authCopy.checking} />
                  : <Alert severity="error" role="alert">{notice?.kind === 'error' ? notice.message : authCopy.unverifiedDetail}</Alert>}
                {/* aria-disabled keeps keyboard focus on the action across the retry. */}
                <Button type="button" variant="contained" fullWidth aria-disabled={rechecking}
                  onClick={() => { if (!rechecking) props.onRecheck() }} sx={{ minHeight: 48 }}>
                  {authCopy.retry}
                </Button>
              </Stack>
            </Card>
          )}

          {showForm && (
            <Card component="section" aria-labelledby="auth-form-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
              <Stack spacing={2}>
                <Typography id="auth-form-heading" ref={headingRef} tabIndex={-1} component="h2" variant="h5"
                  sx={{ '&:focus': { outline: 'none' }, '&:focus-visible': { outline: theme => `2px solid ${theme.palette.interaction.focus}`, outlineOffset: 2 } }}>
                  {heading}
                </Typography>
                {context && <Alert severity="info" role="none" sx={{ alignItems: 'flex-start' }}>
                  <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                    <span>{contextNotices[context][mode]}</span>
                    <Button component={Link} to={props.contextPath} replace state={null} color="secondary" size="small" sx={{ minHeight: 44, px: 0 }}>
                      {authCopy.backToInvitation}
                    </Button>
                  </Stack>
                </Alert>}
                {generalError && <Alert id={errorId} severity="error" role="alert">{generalError}</Alert>}
                {/* One persistent polite region for progress and success, so each change is announced once. */}
                <Box role="status" sx={generalSuccess ? undefined : visuallyHidden}>
                  {generalSuccess ? <Alert severity="success" role="none">{generalSuccess}</Alert> : pendingLabel}
                </Box>

                {mode === 'login' ? (
                  <Stack ref={formRef} component="form" key="login" noValidate onSubmit={submitLogin} spacing={2.5} useFlexGap
                    aria-labelledby="auth-form-heading" aria-describedby={generalError ? errorId : undefined}>
                    <PlainField id="auth-login-email" label="E-Mail" name="email" type="email" autoComplete="email"
                      value={loginEmail} error={loginErrors.email} inputRef={loginEmailRef}
                      onChange={email => { setLoginEmail(email); setLoginErrors(value => ({ ...value, email: undefined })) }} />
                    <PasswordField id="auth-login-password" label="Passwort" name="password" autoComplete="current-password"
                      error={loginErrors.password} inputRef={loginPasswordRef}
                      onChange={() => setLoginErrors(value => ({ ...value, password: undefined }))} />
                    <Button type="submit" variant="contained" fullWidth disabled={loggingIn} sx={{ minHeight: 48 }}>
                      {loggingIn ? authCopy.pendingLogin : authCopy.submitLogin}
                    </Button>
                  </Stack>
                ) : (
                  <Stack ref={formRef} component="form" key="register" noValidate onSubmit={submitRegistration} spacing={2.5} useFlexGap
                    aria-labelledby="auth-form-heading" aria-describedby={generalError ? errorId : undefined}>
                    <PlainField id="auth-register-email" label="E-Mail" name="email" type="email" autoComplete="email"
                      value={registration.email} error={registrationErrors.email} inputRef={registerEmailRef}
                      onChange={email => { setRegistration(value => ({ ...value, email })); setRegistrationErrors(value => ({ ...value, email: undefined })) }} />
                    <PlainField id="auth-register-username" label="Benutzername" name="username" type="text" autoComplete="username"
                      value={registration.username} error={registrationErrors.username} inputRef={registerUsernameRef}
                      onChange={username => { setRegistration(value => ({ ...value, username })); setRegistrationErrors(value => ({ ...value, username: undefined })) }} />
                    <PasswordField id="auth-register-password" label="Passwort" name="password" autoComplete="new-password"
                      error={registrationErrors.password} hint={authCopy.passwordHint} inputRef={registerPasswordRef}
                      onChange={() => setRegistrationErrors(value => ({ ...value, password: undefined }))} />
                    <Button type="submit" variant="contained" fullWidth disabled={registering} sx={{ minHeight: 48 }}>
                      {registering ? authCopy.pendingRegister : authCopy.submitRegister}
                    </Button>
                  </Stack>
                )}

                <Button type="button" variant="text" color="secondary" fullWidth disabled={registering || loggingIn}
                  onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} sx={{ minHeight: 44 }}>
                  {mode === 'login' ? authCopy.toRegister : authCopy.toLogin}
                </Button>
              </Stack>
            </Card>
          )}
          {props.footer}
        </Stack>
      </Container>
    </Box>
  )
}
