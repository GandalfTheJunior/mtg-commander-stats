import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp } from './test/renderApp'
import { appTheme } from './theme/theme'

// #277 signed-out entry: German copy, one form at a time, safe feedback and session recovery.
const identity = { id: 'f058bf9c-c4ce-4b88-a252-aa176a5ef539', username: 'Gandalf' }
// Credentials must reach the API exactly as entered, including Unicode and spaces.
const password = ' 🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈 '
const loginHeading = 'Willkommen zurück!'
const registerHeading = 'Konto erstellen'
const toRegister = 'Noch kein Konto? Registrieren'
const toLogin = 'Bereits ein Konto? Anmelden'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { promise, resolve }
}
function entry() {
  return screen.getByRole('region', { name: /Willkommen zurück!|Konto erstellen/ })
}
function fill(section: HTMLElement) {
  const fields = within(section)
  fireEvent.change(fields.getByLabelText('E-Mail'), { target: { value: 'gandalf@example.com' } })
  fireEvent.change(fields.getByLabelText('Passwort'), { target: { value: password } })
  const username = fields.queryByLabelText('Benutzername')
  if (username) fireEvent.change(username, { target: { value: 'Gandalf' } })
  return section.querySelector('form')!
}
function openRegistration() {
  fireEvent.click(screen.getByRole('button', { name: toRegister }))
  return entry()
}
function expectProtectedHidden() {
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Meine Decks' })).not.toBeInTheDocument()
}
const precedes = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
afterEach(() => vi.unstubAllGlobals())

test('a fresh visit shows only the German sign-in form with unchanged native field contracts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)))
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('MTG Commander Stats')
  expect(screen.getByText('Deine Commander-Runden, Decks und Statistiken an einem Ort.')).toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveStyle({ backgroundColor: appTheme.palette.background.default, margin: '0px' })
  expect(entry()).toHaveStyle({ backgroundColor: appTheme.palette.background.paper })
  expect(screen.getByRole('heading', { name: loginHeading }).tagName).toBe('H2')
  // Exactly one form; no status panel merely saying that the visitor is signed out, no expiry notice.
  expect(document.querySelectorAll('form')).toHaveLength(1)
  expect(screen.queryByRole('heading', { name: registerHeading })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Benutzername')).not.toBeInTheDocument()
  expect(screen.queryByText(/Your session|Not signed in|abgelaufen/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  const contracts = [
    ['E-Mail', 'auth-login-email', 'email', 'email', 'email'],
    ['Passwort', 'auth-login-password', 'password', 'password', 'current-password'],
  ] as const
  for (const [label, id, name, type, autocomplete] of contracts) {
    const input = within(entry()).getByLabelText(label)
    expect(input).toHaveAttribute('id', id)
    expect(input).toHaveAttribute('name', name)
    expect(input).toHaveAttribute('type', type)
    expect(input).toHaveAttribute('autocomplete', autocomplete)
    expect(input).toBeRequired()
    expect(input).not.toHaveAttribute('minlength')
  }
  // Reading and tab order: email, password, its visibility toggle, submit, then the registration switch.
  const order = [
    within(entry()).getByLabelText('E-Mail'), within(entry()).getByLabelText('Passwort'),
    within(entry()).getByRole('button', { name: 'Passwort anzeigen' }), within(entry()).getByRole('button', { name: 'Anmelden' }),
    within(entry()).getByRole('button', { name: toRegister }),
  ]
  order.slice(1).forEach((element, index) => expect(precedes(order[index]!, element)).toBe(true))
  expect(within(entry()).getByRole('button', { name: 'Anmelden' })).toHaveAttribute('type', 'submit')
  expectProtectedHidden()
})

test('the registration switch replaces sign-in with the approved registration inventory and back again', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)))
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  const section = openRegistration()
  const heading = screen.getByRole('heading', { name: registerHeading })
  expect(heading).toHaveFocus()
  expect(screen.queryByRole('heading', { name: loginHeading })).not.toBeInTheDocument()
  expect(document.querySelectorAll('form')).toHaveLength(1)
  const contracts = [
    ['E-Mail', 'auth-register-email', 'email', 'email', 'email'],
    ['Benutzername', 'auth-register-username', 'username', 'text', 'username'],
    ['Passwort', 'auth-register-password', 'password', 'password', 'new-password'],
  ] as const
  for (const [label, id, name, type, autocomplete] of contracts) {
    const input = within(section).getByLabelText(label)
    expect(input).toHaveAttribute('id', id)
    expect(input).toHaveAttribute('name', name)
    expect(input).toHaveAttribute('type', type)
    expect(input).toHaveAttribute('autocomplete', autocomplete)
    expect(input).toBeRequired()
    expect(input).not.toHaveAttribute('minlength')
  }
  // No password confirmation field; the minimum is explained with the password.
  expect(section.querySelectorAll('input')).toHaveLength(3)
  expect(within(section).getByLabelText('Passwort')).toHaveAccessibleDescription('Mindestens 12 Zeichen. Leerzeichen sind erlaubt und zählen mit.')
  expect(within(section).getByRole('button', { name: 'Konto erstellen' })).toHaveAttribute('type', 'submit')

  fireEvent.click(within(section).getByRole('button', { name: toLogin }))
  expect(screen.getByRole('heading', { name: loginHeading })).toHaveFocus()
  expect(screen.queryByLabelText('Benutzername')).not.toBeInTheDocument()
})

test.each([['login'], ['register']] as const)('the %s password toggle reveals only its field, keeps the value and never submits', async (mode) => {
  const fetchMock = vi.fn().mockResolvedValue(json({}, 401))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  const section = mode === 'login' ? entry() : openRegistration()
  const input = within(section).getByLabelText('Passwort')
  const email = within(section).getByLabelText('E-Mail')
  expect(input).toHaveAttribute('type', 'password')
  fireEvent.change(input, { target: { value: password } })
  const toggle = within(section).getByRole('button', { name: 'Passwort anzeigen' })
  expect(toggle).toHaveAttribute('type', 'button')
  expect(toggle).toHaveAttribute('aria-controls', input.id)
  fireEvent.click(toggle)
  expect(input).toHaveAttribute('type', 'text')
  expect(input).toHaveValue(password)
  expect(email).toHaveAttribute('type', 'email')
  expect(toggle).toHaveAccessibleName('Passwort verbergen')
  fireEvent.click(toggle)
  expect(input).toHaveAttribute('type', 'password')
  expect(toggle).toHaveAccessibleName('Passwort anzeigen')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('startup shows only the brand and an accessible check until the session is answered', async () => {
  const initial = deferred()
  vi.stubGlobal('fetch', vi.fn(() => initial.promise))
  renderApp(<App />, '/')
  expect(screen.getByRole('status')).toHaveTextContent('Sitzung wird geprüft …')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('MTG Commander Stats')
  // No flash of the sign-in form for visitors whose session is still valid.
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(document.querySelector('form')).toBeNull()
  expect(screen.queryByRole('heading', { name: loginHeading })).not.toBeInTheDocument()
  expectProtectedHidden()
  await act(async () => initial.resolve(json({}, 401)))
  expect(screen.getByRole('heading', { name: loginHeading })).toBeInTheDocument()
  expect(screen.queryByText('Sitzung wird geprüft …')).not.toBeInTheDocument()
})

test('local validation keeps requests back and places messages below the affected fields', async () => {
  const fetchMock = vi.fn().mockResolvedValue(json({}, 401))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  fireEvent.click(within(entry()).getByRole('button', { name: 'Anmelden' }))
  const email = within(entry()).getByLabelText('E-Mail')
  expect(email).toHaveAccessibleDescription('Bitte gib deine E-Mail-Adresse ein.')
  expect(email).toHaveFocus()
  expect(within(entry()).getByLabelText('Passwort')).toHaveAccessibleDescription('Bitte gib dein Passwort ein.')
  expect(fetchMock).toHaveBeenCalledTimes(1)

  const section = openRegistration()
  fireEvent.change(within(section).getByLabelText('E-Mail'), { target: { value: 'not-an-email' } })
  fireEvent.change(within(section).getByLabelText('Benutzername'), { target: { value: '   ' } })
  fireEvent.click(within(section).getByRole('button', { name: 'Konto erstellen' }))
  expect(within(section).getByLabelText('E-Mail')).toHaveAccessibleDescription('Bitte gib eine gültige E-Mail-Adresse ein.')
  expect(within(section).getByLabelText('E-Mail')).toHaveFocus()
  expect(within(section).getByLabelText('Benutzername')).toHaveAccessibleDescription('Bitte gib einen Benutzernamen ein.')
  expect(within(section).getByLabelText('Passwort')).toHaveAccessibleDescription('Das Passwort muss mindestens 12 Zeichen lang sein.')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('registration guards duplicate submits through the chained sign-in and opens the app only after verification', async () => {
  const users = deferred()
  const csrf = deferred()
  const me = deferred()
  const csrfResponses = [csrf.promise, Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'rotated' }))]
  const meResponses = [Promise.resolve(json({}, 401)), me.promise]
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return meResponses.shift()!
    if (path === '/api/users') return users.promise
    if (path === '/api/csrf') return csrfResponses.shift()!
    if (path === '/api/session') return Promise.resolve(json(identity))
    return Promise.resolve(json([]))
  })
  const calls = (path: string) => fetchMock.mock.calls.filter(([called]) => called === path)
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  const form = fill(openRegistration())
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(calls('/api/users')).toHaveLength(1)
  expect(within(entry()).getByRole('button', { name: 'Konto wird erstellt …' })).toBeDisabled()
  expect(within(entry()).getByRole('status')).toHaveTextContent('Konto wird erstellt …')
  expect(within(entry()).getByRole('button', { name: toLogin })).toBeDisabled()

  // #370: the created account signs in through the normal CSRF-protected login, with one continuous pending state.
  await act(async () => users.resolve(json(identity, 201)))
  expect(screen.getByRole('heading', { name: registerHeading })).toBeInTheDocument()
  expect(within(entry()).getByRole('button', { name: 'Anmeldung läuft …' })).toBeDisabled()
  expect(within(entry()).getByRole('status')).toHaveTextContent('Anmeldung läuft …')
  expect(within(entry()).getByRole('button', { name: toLogin })).toBeDisabled()
  fireEvent.submit(form)
  await act(async () => csrf.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'initial' })))
  // Still pending while the rotated session's identity is unconfirmed: no protected content, no false success.
  await waitFor(() => expect(calls('/api/me')).toHaveLength(2))
  fireEvent.submit(form)
  expect(calls('/api/users')).toHaveLength(1)
  expect(calls('/api/session')).toHaveLength(1)
  expect(screen.queryByText('Anmeldung erfolgreich.')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sitzung konnte nicht überprüft werden.' })).not.toBeInTheDocument()
  expectProtectedHidden()
  // The registration password is used only in memory; it is never mirrored into the markup.
  expect(document.body.innerHTML).not.toContain(password)

  await act(async () => me.resolve(json(identity)))
  await screen.findByRole('navigation', { name: 'Main navigation' })
  expect(screen.getByText('Anmeldung erfolgreich.')).toBeInTheDocument()
  expect(calls('/api/session')).toEqual([['/api/session', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ email: 'gandalf@example.com', password }),
  })]])
  expect(calls('/api/users')).toHaveLength(1)
})

test('a sign-in failure after registration continues on sign-in with only the email and never registers again', async () => {
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return Promise.resolve(json({}, 401))
    if (path === '/api/users') return Promise.resolve(json(identity, 201))
    if (path === '/api/csrf') return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'initial' }))
    return Promise.reject(new TypeError('Failed to fetch'))
  })
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  fireEvent.submit(fill(openRegistration()))

  expect(await screen.findByRole('heading', { name: loginHeading })).toBeInTheDocument()
  const alert = within(entry()).getByRole('alert')
  expect(alert).toHaveTextContent('Dein Konto wurde erstellt, aber die Anmeldung ist fehlgeschlagen. Bitte melde dich an.')
  expect(alert).not.toHaveTextContent(/Failed to fetch/)
  expect(precedes(alert, within(entry()).getByLabelText('E-Mail'))).toBe(true)
  expect(within(entry()).getByLabelText('E-Mail')).toHaveValue('gandalf@example.com')
  const loginPassword = within(entry()).getByLabelText('Passwort')
  expect(loginPassword).toHaveValue('')
  expect(loginPassword).toHaveFocus()
  expect(document.body.innerHTML).not.toContain(password)
  expectProtectedHidden()
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/users')).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/session')).toHaveLength(1)

  // The registration form starts empty again; its password was never copied.
  fireEvent.click(within(entry()).getByRole('button', { name: toRegister }))
  expect(within(entry()).getByLabelText('Passwort')).toHaveValue('')
  expect(within(entry()).getByLabelText('Benutzername')).toHaveValue('')
})

test('an unconfirmed identity after the chained sign-in shows the unverified state with sign-in below it', async () => {
  const meResponses = [json({}, 401), json({}, 503)]
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return Promise.resolve(meResponses.shift()!)
    if (path === '/api/users') return Promise.resolve(json(identity, 201))
    if (path === '/api/csrf') return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
    if (path === '/api/session') return Promise.resolve(json(identity))
    return Promise.resolve(json([]))
  })
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  fireEvent.submit(fill(openRegistration()))

  expect(await screen.findByRole('heading', { name: 'Sitzung konnte nicht überprüft werden.' })).toBeInTheDocument()
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('alert')).toHaveTextContent('Deine Anmeldung konnte nicht bestätigt werden. Bitte prüfe deine Sitzung erneut.')
  expect(within(entry()).getByLabelText('E-Mail')).toHaveValue('gandalf@example.com')
  expect(within(entry()).getByLabelText('Passwort')).toHaveValue('')
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/users')).toHaveLength(1)
  expectProtectedHidden()
})

test('registration failure is announced above the form, preserves inputs, and allows a retry without duplicate POSTs', async () => {
  const pending = deferred()
  const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(json(identity, 201))
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'login' })).mockResolvedValueOnce(json(identity))
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'rotated' })).mockResolvedValueOnce(json(identity))
    .mockResolvedValue(json([]))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  const section = openRegistration()
  const form = fill(section)
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  await act(async () => pending.resolve(json({ detail: 'Registration could not be completed.' }, 500)))
  const alert = within(section).getByRole('alert')
  expect(alert).toHaveTextContent('Die Registrierung ist gerade nicht möglich. Bitte prüfe deine Verbindung und versuche es erneut.')
  expect(alert).not.toHaveTextContent('Registration could not be completed.')
  expect(form).toHaveAccessibleDescription(alert.textContent!)
  expect(precedes(alert, within(section).getByLabelText('E-Mail'))).toBe(true)
  expect(within(section).getByLabelText('Passwort')).toHaveValue(password)
  expect(within(section).getByLabelText('Benutzername')).toHaveValue('Gandalf')
  expect(within(section).getByRole('button', { name: 'Konto erstellen' })).toBeEnabled()
  expect(document.body.textContent).not.toContain(password)
  fireEvent.submit(form)
  // The retry registers once more and then signs in with the same credentials (#370).
  await screen.findByRole('navigation', { name: 'Main navigation' })
  const registrations = fetchMock.mock.calls.filter(([path]) => path === '/api/users')
  expect(registrations).toHaveLength(2)
  expect(registrations[1]).toEqual(['/api/users', expect.objectContaining({
    body: JSON.stringify({ email: 'gandalf@example.com', username: 'Gandalf', password }),
  })])
})

test('login guards repeated submissions throughout CSRF and identity verification; a credential failure permits retry', async () => {
  const csrf = deferred()
  const post = deferred()
  const rotation = deferred()
  const me = deferred()
  const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockReturnValueOnce(csrf.promise)
    .mockReturnValueOnce(post.promise)
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'retry' }))
    .mockResolvedValueOnce(json(identity)).mockReturnValueOnce(rotation.promise).mockReturnValueOnce(me.promise)
    .mockResolvedValue(json([]))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  await screen.findByRole('heading', { name: loginHeading })
  const section = entry()
  const form = fill(section)
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(within(section).getByRole('button', { name: 'Anmeldung läuft …' })).toBeDisabled()
  expect(within(section).getByRole('status')).toHaveTextContent('Anmeldung läuft …')
  await act(async () => csrf.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'initial' })))
  fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  await act(async () => post.resolve(json({ detail: 'Invalid credentials.' }, 401)))
  const alert = within(section).getByRole('alert')
  expect(alert).toHaveTextContent('Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.')
  expect(form).toHaveAccessibleDescription('Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.')
  expect(precedes(alert, within(section).getByLabelText('E-Mail'))).toBe(true)
  expect(within(section).getByLabelText('E-Mail')).toHaveValue('gandalf@example.com')
  expect(within(section).getByLabelText('Passwort')).toHaveValue(password)
  expect(within(section).getByRole('button', { name: 'Anmelden' })).toBeEnabled()
  expect(document.body.textContent).not.toContain(password)
  // Password inputs stay uncontrolled, so the secret is never mirrored into a DOM attribute.
  expect(document.body.innerHTML).not.toContain(password)
  expectProtectedHidden()
  fireEvent.submit(form)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
  expect(within(section).queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(6)
  expectProtectedHidden()
  await act(async () => rotation.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'rotated' })))
  fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(7)
  // No false success while the identity is still unverified.
  expect(screen.queryByText('Anmeldung erfolgreich.')).not.toBeInTheDocument()
  expectProtectedHidden()
  await act(async () => me.resolve(json(identity)))
  await screen.findByRole('navigation', { name: 'Main navigation' })
  expect(screen.getByText('Anmeldung erfolgreich.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: loginHeading })).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/session')).toHaveLength(2)
  expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/session', expect.objectContaining({
    body: JSON.stringify({ email: 'gandalf@example.com', password }),
  }))
})

test.each([
  ['a server error', () => Promise.resolve(json({ detail: 'Authentication unavailable.' }, 500))],
  ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
])('login distinguishes %s from rejected credentials without asserting anything about the account', async (_, failure) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401))
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'login' })).mockImplementationOnce(failure)
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />, '/')
  await screen.findByRole('heading', { name: loginHeading })
  const form = fill(entry())
  const submit = within(entry()).getByRole('button', { name: 'Anmelden' })
  submit.focus()
  fireEvent.submit(form)
  const alert = await within(entry()).findByRole('alert')
  expect(alert).toHaveTextContent('Anmeldung ist gerade nicht möglich. Bitte prüfe deine Verbindung und versuche es erneut.')
  expect(alert).not.toHaveTextContent(/Zugangsdaten|Authentication unavailable|Failed to fetch/)
  expect(within(entry()).getByLabelText('Passwort')).toHaveValue(password)
  // Focus stays recoverable inside the form after the pending button re-enables.
  expect(entry().contains(document.activeElement)).toBe(true)
  expectProtectedHidden()
})

test('unverified recovery offers sign-in below its focused retry action and hides the form during each check', async () => {
  const pending = deferred()
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(json({}, 401))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  const retryHeading = await screen.findByRole('heading', { name: 'Sitzung konnte nicht überprüft werden.' })
  expect(screen.getByRole('alert')).toHaveTextContent('Bitte prüfe deine Verbindung und versuche es erneut.')
  // #370: the retry card stays on top and the ordinary sign-in card follows below it in the same column.
  const retry = screen.getByRole('button', { name: 'Erneut prüfen' })
  expect(document.querySelectorAll('form')).toHaveLength(1)
  expect(precedes(retry, entry())).toBe(true)
  expect(precedes(retryHeading, screen.getByRole('heading', { name: loginHeading }))).toBe(true)
  expect(within(entry()).getByRole('button', { name: toRegister })).toBeEnabled()
  expect(within(entry()).queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.change(within(entry()).getByLabelText('Passwort'), { target: { value: password } })
  retry.focus()
  fireEvent.click(retry)
  fireEvent.click(retry)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(retry).toHaveFocus()
  expect(retry).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Sitzung wird geprüft …')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  // An active check hides the form, which discards the typed password.
  expect(document.querySelector('form')).toBeNull()
  expectProtectedHidden()
  await act(async () => pending.resolve(json({}, 503)))
  expect(screen.getByRole('alert')).toHaveTextContent('Bitte prüfe deine Verbindung und versuche es erneut.')
  expect(retry).toHaveFocus()
  expect(retry).toHaveAttribute('aria-disabled', 'false')
  expect(within(entry()).getByLabelText('Passwort')).toHaveValue('')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expectProtectedHidden()
  fireEvent.click(retry)
  await screen.findByRole('heading', { name: loginHeading })
  expect(screen.queryByRole('button', { name: 'Erneut prüfen' })).not.toBeInTheDocument()
  expect(screen.queryByText(/abgelaufen/)).not.toBeInTheDocument()
})

test('signing in from an unverified session uses the normal verified login flow', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'login' })).mockResolvedValueOnce(json({ detail: 'Invalid credentials.' }, 401))
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'login' })).mockResolvedValueOnce(json(identity))
    .mockResolvedValueOnce(json({ headerName: 'X-CSRF-TOKEN', token: 'rotated' })).mockResolvedValueOnce(json(identity))
    .mockResolvedValue(json([]))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  await screen.findByRole('heading', { name: 'Sitzung konnte nicht überprüft werden.' })
  const form = fill(entry())
  fireEvent.submit(form)
  // The retry card stays, locked, while the login runs; a rejected login is reported in the sign-in card.
  const retry = screen.getByRole('button', { name: 'Erneut prüfen' })
  expect(retry).toHaveAttribute('aria-disabled', 'true')
  const alert = await within(entry()).findByRole('alert')
  expect(alert).toHaveTextContent('Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.')
  expect(screen.getAllByRole('alert').map(element => element.textContent)).toEqual([
    'Bitte prüfe deine Verbindung und versuche es erneut.', 'Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.',
  ])
  expect(retry).toHaveAttribute('aria-disabled', 'false')
  expectProtectedHidden()
  fireEvent.submit(form)
  await screen.findByRole('navigation', { name: 'Main navigation' })
  expect(screen.getByText('Anmeldung erfolgreich.')).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/me')).toHaveLength(2)
})

test('a registration from the unverified view locks the retry until its chained sign-in has finished', async () => {
  const users = deferred()
  const meResponses = [Promise.reject(new TypeError('Failed to fetch')), Promise.resolve(json({}, 503))]
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return meResponses.shift()!
    if (path === '/api/users') return users.promise
    if (path === '/api/csrf') return Promise.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
    if (path === '/api/session') return Promise.resolve(json(identity))
    return Promise.resolve(json([]))
  })
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  await screen.findByRole('heading', { name: 'Sitzung konnte nicht überprüft werden.' })
  fireEvent.submit(fill(openRegistration()))
  // While the registration POST runs, a re-check would race the chained sign-in, so the retry is locked.
  const retry = screen.getByRole('button', { name: 'Erneut prüfen' })
  expect(retry).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(retry)
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/me')).toHaveLength(1)
  expect(screen.getByRole('heading', { name: registerHeading })).toBeInTheDocument()

  // The chained sign-in changes the session, but its identity check fails: the unverified view stays usable.
  await act(async () => users.resolve(json(identity, 201)))
  expect(await screen.findByText('Deine Anmeldung konnte nicht bestätigt werden. Bitte prüfe deine Sitzung erneut.')).toBeInTheDocument()
  expect(retry).toHaveAttribute('aria-disabled', 'false')
  expect(document.querySelectorAll('form')).toHaveLength(1)
  expect(screen.queryByText('Sitzung wird geprüft …')).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/users')).toHaveLength(1)
})

test('a session lost after confirmation shows the expiry notice above the sign-in fields', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json({}, 401)).mockResolvedValue(json([])))
  renderApp(<App />)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.')
  expect(precedes(alert, within(entry()).getByLabelText('E-Mail'))).toBe(true)
  expect(screen.getByRole('heading', { name: loginHeading })).toBeInTheDocument()
  expectProtectedHidden()
})
