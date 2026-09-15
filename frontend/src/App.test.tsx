import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

const user = { id: 'f058bf9c-c4ce-4b88-a252-aa176a5ef539', username: 'Gandalf' }
const password = 'correct horse battery'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function registrationForm() {
  return within(
    screen.getByRole('heading', { name: 'Create an account' }).closest('section')!,
  )
}

function loginForm() {
  return within(screen.getByRole('heading', { name: 'Sign in' }).closest('section')!)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('identifies the application and shows separate auth forms', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(
    screen.getByRole('heading', { level: 1, name: 'MTG Commander Stats' }),
  ).toBeInTheDocument()
  expect(await screen.findByText('Not signed in.')).toBeInTheDocument()
  expect(registrationForm().getByLabelText('Username')).toBeInTheDocument()
  expect(loginForm().queryByLabelText('Username')).not.toBeInTheDocument()
})

test('restores and displays the current user from an existing session', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(user))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(await screen.findByText('Gandalf')).toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/me', {
    credentials: 'same-origin',
  })
})

test('registers an account without treating it as an authenticated session', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(jsonResponse(user, 201))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Not signed in.')

  const form = registrationForm()
  fireEvent.change(form.getByLabelText('Email'), {
    target: { value: 'gandalf@example.com' },
  })
  fireEvent.change(form.getByLabelText('Username'), {
    target: { value: 'Gandalf' },
  })
  fireEvent.change(form.getByLabelText('Password'), {
    target: { value: password },
  })
  fireEvent.click(form.getByRole('button', { name: 'Create account' }))

  expect(
    await screen.findByText(
      'Account created for Gandalf. Sign in separately to continue.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/users', {
    credentials: 'same-origin',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'gandalf@example.com',
      username: 'Gandalf',
      password,
    }),
  })
})

test('surfaces a safe registration failure', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(
      jsonResponse({ detail: 'Email is already registered.' }, 409),
    )
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Not signed in.')

  const form = registrationForm()
  fireEvent.change(form.getByLabelText('Email'), {
    target: { value: 'gandalf@example.com' },
  })
  fireEvent.change(form.getByLabelText('Username'), {
    target: { value: 'Gandalf' },
  })
  fireEvent.change(form.getByLabelText('Password'), {
    target: { value: password },
  })
  fireEvent.click(form.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByText('Email is already registered.')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain(password)
})

test('logs in with the bootstrapped CSRF token, refreshes it, and confirms identity', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'pre-login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'post-login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse(user))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Not signed in.')

  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), {
    target: { value: 'gandalf@example.com' },
  })
  fireEvent.change(form.getByLabelText('Password'), {
    target: { value: password },
  })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByText('Gandalf')).toBeInTheDocument()
  expect(screen.getByText('Login successful.')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/csrf', {
    credentials: 'same-origin',
  })
  expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/session', {
    credentials: 'same-origin',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': 'pre-login-token',
    },
    body: JSON.stringify({ email: 'gandalf@example.com', password }),
  })
  expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/csrf', {
    credentials: 'same-origin',
  })
  expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/me', {
    credentials: 'same-origin',
  })
})

test('invalid credentials leave an unauthenticated UI signed out', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse({ detail: 'Invalid credentials.' }, 401))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Not signed in.')

  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), {
    target: { value: 'gandalf@example.com' },
  })
  fireEvent.change(form.getByLabelText('Password'), {
    target: { value: 'wrong password' },
  })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument()
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
  expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()
})

test('failed re-login preserves an existing authenticated UI state', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse({ detail: 'Invalid credentials.' }, 401))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Gandalf')

  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), {
    target: { value: 'gandalf@example.com' },
  })
  fireEvent.change(form.getByLabelText('Password'), {
    target: { value: 'wrong password' },
  })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument()
  expect(screen.getByText('Gandalf')).toBeInTheDocument()
  expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
  expect(screen.queryByText('Not signed in.')).not.toBeInTheDocument()
})
