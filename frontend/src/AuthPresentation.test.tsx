import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp } from './test/renderApp'
import { appTheme } from './theme/theme'

const identity = { id: 'f058bf9c-c4ce-4b88-a252-aa176a5ef539', username: 'Gandalf' }
// Credentials must reach the API exactly as entered, including Unicode and spaces.
const password = ' 🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈 '
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { promise, resolve }
}
function panel(name: string) {
  return screen.getByRole('heading', { name }).closest('section')!
}
function fill(section: HTMLElement) {
  const fields = within(section)
  fireEvent.change(fields.getByLabelText('Email'), { target: { value: 'gandalf@example.com' } })
  fireEvent.change(fields.getByLabelText('Password'), { target: { value: password } })
  const username = fields.queryByLabelText('Username')
  if (username) fireEvent.change(username, { target: { value: 'Gandalf' } })
  return section.querySelector('form')!
}
function expectProtectedHidden() {
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Meine Decks' })).not.toBeInTheDocument()
}
afterEach(() => vi.unstubAllGlobals())

test('auth has themed semantic sections and distinct visible labels with unchanged native field contracts', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 401)))
  renderApp(<App />)
  await screen.findByText('Not signed in.')
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('main')).toHaveStyle({ backgroundColor: appTheme.palette.background.default, margin: '0px' })
  for (const name of ['Your session', 'Create an account', 'Sign in']) {
    expect(screen.getByRole('region', { name })).toBe(panel(name))
    expect(panel(name)).toHaveStyle({ backgroundColor: appTheme.palette.background.paper })
    expect(screen.getByRole('heading', { name }).tagName).toBe('H2')
  }
  const contracts = [
    ['Create an account', 'Email', 'auth-register-email', 'email', 'email', 'email'],
    ['Create an account', 'Username', 'auth-register-username', 'username', 'text', 'username'],
    ['Create an account', 'Password', 'auth-register-password', 'password', 'password', 'new-password'],
    ['Sign in', 'Email', 'auth-login-email', 'email', 'email', 'email'],
    ['Sign in', 'Password', 'auth-login-password', 'password', 'password', 'current-password'],
  ]
  for (const [section, label, id, name, type, autocomplete] of contracts) {
    const input = within(panel(section)).getByLabelText(label)
    expect(input).toHaveAttribute('id', id)
    expect(input).toHaveAttribute('name', name)
    expect(input).toHaveAttribute('type', type)
    expect(input).toHaveAttribute('autocomplete', autocomplete)
    expect(input).toBeRequired()
    expect(input).not.toHaveAttribute('minlength')
    expect(input.closest('form')).toBeInTheDocument()
  }
  expect(document.querySelectorAll('.forms, .session, .success, .error')).toHaveLength(0)
  expectProtectedHidden()
})

test('checking blocks login while preserving available registration and guards batched duplicate registration submits', async () => {
  const initial = deferred()
  const pending = deferred()
  const fetchMock = vi.fn((path: string) => path === '/api/me' ? initial.promise : pending.promise)
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  expect(screen.getByText('Checking your session…')).toHaveAttribute('role', 'status')
  expect(within(panel('Sign in')).getByRole('button', { name: 'Sign in' })).toBeDisabled()
  const registration = fill(panel('Create an account'))
  const login = fill(panel('Sign in'))
  act(() => {
    fireEvent.submit(registration)
    fireEvent.submit(registration)
    fireEvent.submit(login)
  })
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/users')).toHaveLength(1)
  expect(fetchMock.mock.calls.some(([path]) => path === '/api/csrf')).toBe(false)
  expect(within(panel('Create an account')).getByRole('button', { name: 'Creating account…' })).toBeDisabled()
  expect(within(panel('Create an account')).getByRole('status')).toHaveTextContent('Creating account…')
  await act(async () => pending.resolve(json(identity, 201)))
  const notice = await screen.findByText('Account created for Gandalf. Sign in separately to continue.')
  expect(notice).toHaveAttribute('role', 'status')
  expect(notice).toHaveStyle({ color: appTheme.palette.success.main })
  expect(within(panel('Create an account')).getByLabelText('Password')).toHaveValue('')
  expect(within(panel('Sign in')).getByLabelText('Password')).toHaveValue(password)
  expectProtectedHidden()
  await act(async () => initial.resolve(json({}, 401)))
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
})

test('registration failure is announced, preserves inputs, and allows an explicit retry without duplicate POSTs', async () => {
  const pending = deferred()
  const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(json(identity, 201))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  await screen.findByText('Not signed in.')
  const section = panel('Create an account')
  const form = fill(section)
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  await act(async () => pending.resolve(json({ detail: 'Email is already registered.' }, 409)))
  expect(within(section).getByRole('alert')).toHaveTextContent('Email is already registered.')
  expect(within(section).getByRole('alert')).toHaveStyle({ color: appTheme.palette.error.main })
  expect(form).toHaveAccessibleDescription('Email is already registered.')
  expect(within(section).getByLabelText('Password')).toHaveValue(password)
  expect(within(section).getByRole('button', { name: 'Create account' })).toBeEnabled()
  expect(document.body.textContent).not.toContain(password)
  fireEvent.submit(form)
  await screen.findByText('Account created for Gandalf. Sign in separately to continue.')
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/users', expect.objectContaining({
    body: JSON.stringify({ email: 'gandalf@example.com', username: 'Gandalf', password }),
  }))
  expectProtectedHidden()
})

test('login guards repeated submissions throughout CSRF and identity verification; failure permits retry', async () => {
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
  await screen.findByText('Not signed in.')
  const section = panel('Sign in')
  const form = fill(section)
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(within(section).getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  expect(within(section).getByRole('status')).toHaveTextContent('Signing in…')
  await act(async () => csrf.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'initial' })))
  fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  await act(async () => post.resolve(json({}, 401)))
  expect(screen.getByRole('alert')).toHaveTextContent('Login failed.')
  expect(form).toHaveAccessibleDescription('Login failed.')
  expect(within(section).getByLabelText('Password')).toHaveValue(password)
  expect(within(section).getByRole('button', { name: 'Sign in' })).toBeEnabled()
  expectProtectedHidden()
  fireEvent.submit(form)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
  fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(6)
  expectProtectedHidden()
  await act(async () => rotation.resolve(json({ headerName: 'X-CSRF-TOKEN', token: 'rotated' })))
  fireEvent.submit(form)
  expect(fetchMock).toHaveBeenCalledTimes(7)
  expectProtectedHidden()
  await act(async () => me.resolve(json(identity)))
  await screen.findByRole('navigation', { name: 'Main navigation' })
  expect(screen.queryByRole('region', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/session')).toHaveLength(2)
  expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/session', expect.objectContaining({
    body: JSON.stringify({ email: 'gandalf@example.com', password }),
  }))
})

test('unverified recovery remains themed and keeps its focused retry action available after failed checks', async () => {
  const pending = deferred()
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('Could not check your session.'))
    .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(json({}, 401))
  vi.stubGlobal('fetch', fetchMock)
  renderApp(<App />)
  await screen.findByText('Your session identity could not be confirmed.')
  expect(screen.getByRole('alert')).toHaveTextContent('Could not check your session.')
  const retry = screen.getByRole('button', { name: 'Check session' })
  retry.focus()
  fireEvent.click(retry)
  fireEvent.click(retry)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(retry).toHaveFocus()
  expect(retry).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByText('Checking your session…')).toHaveAttribute('role', 'status')
  expectProtectedHidden()
  await act(async () => pending.resolve(json({}, 503)))
  expect(screen.getByRole('alert')).toHaveTextContent('Could not check your session. Try again or reload.')
  expect(retry).toHaveFocus()
  expect(retry).toHaveAttribute('aria-disabled', 'false')
  expectProtectedHidden()
  fireEvent.click(retry)
  await screen.findByText('Not signed in.')
  expect(screen.queryByRole('button', { name: 'Check session' })).not.toBeInTheDocument()
})
