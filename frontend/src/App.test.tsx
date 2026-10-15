import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  expect(screen.queryByRole('heading', { name: 'My decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create deck' })).not.toBeInTheDocument()
})

test('restores the authenticated session and loads its decks', async () => {
  const deck = {
    id: 'd7c6daac-d72f-49b2-9c10-cb7c653ededa',
    name: 'Atraxa Superfriends',
    commander: "Atraxa, Praetors' Voice",
    colorIdentity: ['W', 'U', 'B', 'G'],
  }
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([deck]))
    .mockResolvedValueOnce(jsonResponse([]))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'My decks' })).toBeInTheDocument()
  expect(await screen.findByText('Atraxa Superfriends')).toBeInTheDocument()
  expect(screen.getByText(/Atraxa, Praetors' Voice/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/decks', {
    credentials: 'same-origin',
  })
})

test('a deck API 401 clears authenticated controls and reports an expired session', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(jsonResponse([]))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(await screen.findByText('Your session expired. Sign in again.')).toBeInTheDocument()
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'My decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create deck' })).not.toBeInTheDocument()
})

test('restores and displays the current user from an existing session', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse([]))
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
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse([]))
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
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse({ detail: 'Invalid credentials.' }, 401))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Gandalf')
  await screen.findByText('You have no decks yet.')

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

test('does not preserve a previous identity when post-login CSRF refresh fails', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        id: 'e55c4c26-2d30-4ae0-8f9b-6100171ee99a',
        username: 'Saruman',
      }),
    )
    .mockResolvedValueOnce(jsonResponse({}, 503))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Gandalf')
  await screen.findByText('You have no decks yet.')

  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), {
    target: { value: 'saruman@example.com' },
  })
  fireEvent.change(form.getByLabelText('Password'), {
    target: { value: password },
  })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByText('Could not prepare login.')).toBeInTheDocument()
  expect(
    screen.getByText('Your session identity could not be confirmed.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('Gandalf')).not.toBeInTheDocument()
  expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()
})

test('shows an unverified session when identity confirmation fails after login', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(
      jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'post-login-token' }),
    )
    .mockResolvedValueOnce(jsonResponse({}, 503))
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

  expect(await screen.findByText('Could not check your session.')).toBeInTheDocument()
  expect(
    screen.getByText('Your session identity could not be confirmed.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('Not signed in.')).not.toBeInTheDocument()
  expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()
})

test.each(['request', 'csrf'])('a group 401 during %s expires the session and clears decks and groups', async (source) => {
  const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Private group', role: 'OWNER' }
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return Promise.resolve(jsonResponse(user))
    if (path === '/api/decks') return Promise.resolve(jsonResponse([]))
    if (path === '/api/groups') return Promise.resolve(jsonResponse([group]))
    if (path === '/api/csrf') return Promise.resolve(jsonResponse({}, 401))
    return Promise.resolve(jsonResponse({}, 401))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByRole('button', { name: 'Private group (OWNER)' })
  if (source === 'request') {
    fireEvent.click(screen.getByRole('button', { name: 'Private group (OWNER)' }))
  } else {
    fireEvent.change(screen.getByLabelText('Invitation code'), { target: { value: 'abcdefghijklmnopqrstuv' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join group' }))
  }
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('heading', { name: 'My groups' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'My decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  if (source === 'csrf') expect(fetchMock.mock.calls.some(([path]) => path === '/api/groups/join')).toBe(false)
})

test('sign-out clears group details and a late invitation-code response cannot restore them', async () => {
  const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Private group', role: 'OWNER' }
  let resolveCode!: (response: Response) => void
  const pendingCode = new Promise<Response>((resolve) => { resolveCode = resolve })
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return Promise.resolve(jsonResponse(user))
    if (path === '/api/decks') return Promise.resolve(jsonResponse([]))
    if (path === '/api/groups') return Promise.resolve(jsonResponse([group]))
    if (path === `/api/groups/${group.id}`) return Promise.resolve(jsonResponse({ ...group, members: [] }))
    if (path.endsWith('/join-code')) return pendingCode
    if (path === '/api/csrf') return Promise.resolve(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'logout-token' }))
    if (path === '/api/session') return Promise.resolve(new Response(null, { status: 204 }))
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Private group (OWNER)' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Show invitation code' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByText('Signed out.')
  await act(async () => { resolveCode(jsonResponse({ code: 'abcdefghijklmnopqrstuv' })) })
  expect(screen.queryByRole('heading', { name: 'My groups' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Group details' })).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('abcdefghijklmnopqrstuv')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/session', {
    credentials: 'same-origin', method: 'DELETE', headers: { 'X-CSRF-TOKEN': 'logout-token' },
  })
})

test('switching identity discards old groups and ignores a late create response', async () => {
  const nextUser = { id: 'e55c4c26-2d30-4ae0-8f9b-6100171ee99a', username: 'Saruman' }
  const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Old private group', role: 'OWNER' }
  let currentUser = user
  let resolveCreate!: (response: Response) => void
  const pendingCreate = new Promise<Response>((resolve) => { resolveCreate = resolve })
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/me') return Promise.resolve(jsonResponse(currentUser))
    if (path === '/api/decks') return Promise.resolve(jsonResponse([]))
    if (path === '/api/groups' && init?.method === 'POST') return pendingCreate
    if (path === '/api/groups') return Promise.resolve(jsonResponse(currentUser.id === user.id ? [group] : []))
    if (path === '/api/csrf') return Promise.resolve(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }))
    if (path === '/api/session') {
      currentUser = nextUser
      return Promise.resolve(jsonResponse(nextUser))
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByRole('button', { name: 'Old private group (OWNER)' })
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Unconfirmed old group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'saruman@example.com' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Saruman')
  await screen.findByText('You have no groups yet.')
  await act(async () => { resolveCreate(jsonResponse({ ...group, name: 'Unconfirmed old group' }, 201)) })
  expect(screen.queryByText(/Old private group/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Unconfirmed old group/)).not.toBeInTheDocument()
  expect(screen.getByText('Saruman')).toBeInTheDocument()
})
