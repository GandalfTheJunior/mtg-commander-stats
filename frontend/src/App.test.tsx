import { savedCommander } from './test/commanderFixtures'
import { openNewDeck, openExistingDeck, openDeckAction } from './test/editorEntry'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { renderApp as render, goTo } from './test/renderApp'

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

async function logOutBeforeLogin() {
  fireEvent.click(within(screen.getByRole('banner', { hidden: true })).getByRole('button', { hidden: true }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
  await screen.findByText('Logged out.')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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
  const playgroundLink = screen.getByRole('link', { name: 'Open Tech Playground' })
  expect(playgroundLink).toHaveAttribute('href', '/dev/lounge.html')
  expect(playgroundLink.closest('form')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Meine Decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Deck erstellen' })).not.toBeInTheDocument()
})

test('hides the tech playground link outside development mode', async () => {
  vi.stubEnv('DEV', false)
  expect(import.meta.env.DEV).toBe(false)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
  render(<App />)

  expect(await screen.findByText('Not signed in.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Open Tech Playground' })).toBeNull()
})

test('restores the authenticated session and loads its decks', async () => {
  const deck = {
    id: 'd7c6daac-d72f-49b2-9c10-cb7c653ededa',
    name: 'Atraxa Superfriends',
    commanders: [savedCommander("Atraxa, Praetors' Voice")],
    colorIdentity: ['W', 'U', 'B', 'G'],
    everUsed: false, archived: false,
  }
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([deck]))
    .mockResolvedValueOnce(jsonResponse([]))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Meine Decks' })).toBeInTheDocument()
  expect(await screen.findByText('Atraxa Superfriends')).toBeInTheDocument()
  const savedDeck = within(screen.getByRole('heading', { name: deck.name }).closest('li')!)
  expect(savedDeck.getByText("Commander: Atraxa, Praetors' Voice")).toBeInTheDocument()
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/decks', {
    signal: expect.any(AbortSignal),
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
  expect(screen.queryByRole('heading', { name: 'Meine Decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Deck erstellen' })).not.toBeInTheDocument()
})

test('restores and displays the current user from an existing session', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([]))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(await screen.findByText('Gandalf')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Gandalf' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Gandalf' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Create an account' })).not.toBeInTheDocument()
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

test('shows an accessible password hint before registration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
  render(<App />)
  await screen.findByText('Not signed in.')

  const input = registrationForm().getByLabelText('Password')
  expect(input).toHaveAccessibleDescription('Use at least 12 characters. Whitespace is allowed and counts toward the minimum.')
  expect(registrationForm().getByText(/Use at least 12 characters/)).toBeVisible()
  expect(input).not.toHaveAttribute('minlength')
  expect(loginForm().getByLabelText('Password')).not.toHaveAccessibleDescription()
})

test.each(['short', '12345678901', '😀'.repeat(11)])('blocks a short registration password by code-point length: %s', async (shortPassword) => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Not signed in.')

  const form = registrationForm()
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'gandalf@example.com' } })
  fireEvent.change(form.getByLabelText('Username'), { target: { value: 'Gandalf' } })
  const input = form.getByLabelText('Password')
  fireEvent.change(input, { target: { value: shortPassword } })
  fireEvent.click(form.getByRole('button', { name: 'Create account' }))

  expect(form.getByRole('alert')).toHaveTextContent('Password must be at least 12 characters long.')
  expect(input).toHaveAccessibleDescription('Password must be at least 12 characters long.')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveFocus()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(form.queryByText(/valid email|Username must/)).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain(shortPassword)

  fireEvent.change(input, { target: { value: password } })
  expect(form.queryByRole('alert')).not.toBeInTheDocument()
  expect(input).toHaveAttribute('aria-invalid', 'false')
})

test.each(['😀'.repeat(12), '  abcdefghij', 'abcdefghij  ', 'e\u0301'.repeat(6)])('submits a valid passphrase unchanged: %s', async (passphrase) => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(jsonResponse(user, 201))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Not signed in.')

  const form = registrationForm()
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'gandalf@example.com' } })
  fireEvent.change(form.getByLabelText('Username'), { target: { value: 'Gandalf' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: passphrase } })
  fireEvent.click(form.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByText('Account created for Gandalf. Sign in separately to continue.')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenLastCalledWith('/api/users', expect.objectContaining({
    body: JSON.stringify({ email: 'gandalf@example.com', username: 'Gandalf', password: passphrase }),
  }))
  expect(form.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
})

test.each([
  [409, 'Email is already registered.'],
  [400, 'Provide a valid email address.'],
  [400, 'Username must not be blank.'],
  [400, 'Password must not be blank or consist only of whitespace.'],
  [400, 'Provide a valid email address. Username must not be blank.'],
])('surfaces a safe registration failure (%i): %s', async (status, detail) => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({}, 401))
    .mockResolvedValueOnce(
      jsonResponse({ detail }, status),
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

  expect(await screen.findByRole('alert')).toHaveTextContent(detail)
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
  expect(screen.queryByRole('button', { name: 'Gandalf' })).not.toBeInTheDocument()
})

test('confirmed authentication hides credentials forms and prevents browser re-login until logout', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([]))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Noch keine Decks.')
  expect(screen.getByText(user.username)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Create an account' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Gandalf' })).toBeEnabled()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('does not preserve a previous identity when post-login CSRF refresh fails', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(user))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'logout-token' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
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
  await screen.findByText('Noch keine Decks.')

  await logOutBeforeLogin()
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
  expect(screen.queryByRole('button', { name: 'Gandalf' })).not.toBeInTheDocument()
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
  expect(screen.queryByRole('button', { name: 'Gandalf' })).not.toBeInTheDocument()
})

test('a group 401 expires the session and clears protected content', async () => {
  const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Private group', role: 'OWNER' }
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/me') return Promise.resolve(jsonResponse(user))
    if (path === '/api/groups') return Promise.resolve(jsonResponse([group]))
    return Promise.resolve(jsonResponse({}, 401))
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />, '/playgroups')
  fireEvent.click(await screen.findByRole('button', { name: 'Private group' }))
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.queryByRole('heading', { name: 'Playgroups' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: user.username })).not.toBeInTheDocument()
})

test.each(['/invite/token-value', '/claim/token-value'])('public %s stays outside the protected redirect gate', async path => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
  render(<App />, path)
  expect(await screen.findByText('Dieser Link kann noch nicht angezeigt werden.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
})

test.each(['same user', 'different user'])('a confirmed login for %s discards old groups and ignores a late create response', async (identity) => {
  const nextUser = identity === 'same user' ? user : { id: 'e55c4c26-2d30-4ae0-8f9b-6100171ee99a', username: 'Saruman' }
  const group = { id: '11111111-1111-4111-8111-111111111111', name: 'Old private group', role: 'OWNER' }
  let currentUser = user
  let reloggedIn = false
  let resolveCreate!: (response: Response) => void
  const pendingCreate = new Promise<Response>((resolve) => { resolveCreate = resolve })
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path.startsWith('/api/scryfall/commanders?')) return Promise.resolve(jsonResponse([{ ...savedCommander('Atraxa'), thumbnailUrl: null }]))
    if (path === '/api/me') return Promise.resolve(jsonResponse(currentUser))
    if (path === '/api/decks') return Promise.resolve(jsonResponse([]))
    if (path === '/api/groups' && init?.method === 'POST') return pendingCreate
    if (path === '/api/groups') return Promise.resolve(jsonResponse(reloggedIn ? [] : [group]))
    if (path === '/api/csrf') return Promise.resolve(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'login-token' }))
    if (path === '/api/session' && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    if (path === '/api/session') {
      reloggedIn = true
      currentUser = nextUser
      return Promise.resolve(jsonResponse(nextUser))
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />, '/playgroups')
  await screen.findByRole('button', { name: 'Old private group' })
  fireEvent.change(screen.getByLabelText(/Gruppenname/), { target: { value: 'Unconfirmed old group' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }))
  await act(async () => {})
  await logOutBeforeLogin()
  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'saruman@example.com' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
  await goTo('Playgroups')
  await screen.findByText('Du bist noch keiner Playgroup beigetreten. Erstelle eine eigene Playgroup oder öffne einen Einladungslink.')
  await act(async () => { resolveCreate(jsonResponse({ ...group, name: 'Unconfirmed old group' }, 201)) })
  expect(screen.queryByText(/Old private group/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Unconfirmed old group/)).not.toBeInTheDocument()
  expect(screen.getByText(nextUser.username)).toBeInTheDocument()
})


for (const identity of ['same user', 'different user']) {
  for (const operation of ['list', 'create', 'edit', 'delete']) {
    test.each(['401', '500', 'success', 'network'])(`late ${operation} %s cannot affect a confirmed login for ${identity}`, async (outcome) => {
      const nextUser = identity === 'same user' ? user : {
        id: 'e55c4c26-2d30-4ae0-8f9b-6100171ee99a', username: 'Saruman',
      }
      const oldDeck = { everUsed: false, archived: false, id: '11111111-1111-4111-8111-111111111111', name: 'Old private deck', commanders: [savedCommander('Atraxa')], colorIdentity: [] }
      const newDeck = { ...oldDeck, id: 'new-deck', name: 'Current session deck' }
      let resolveOld!: (response: Response) => void
      let rejectOld!: (error: Error) => void
      const pendingOld = new Promise<Response>((resolve, reject) => { resolveOld = resolve; rejectOld = reject })
      let confirmedLogin = false
      let oldRequestStarted = false
      const fetchMock = vi.fn((path: string, init?: RequestInit) => {
        if (path.startsWith('/api/scryfall/commanders?')) return Promise.resolve(jsonResponse([{ ...savedCommander('Atraxa'), thumbnailUrl: null }]))
    if (path === '/api/me') return Promise.resolve(jsonResponse(confirmedLogin ? nextUser : user))
        if (path === '/api/csrf') return Promise.resolve(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
        if (path === '/api/session' && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
        if (path === '/api/session') {
          confirmedLogin = true
          return Promise.resolve(jsonResponse(nextUser))
        }
        if (path === '/api/groups') return Promise.resolve(jsonResponse([]))
        if (path.startsWith('/api/decks')) {
          if (confirmedLogin) return Promise.resolve(jsonResponse([newDeck]))
          if (operation === 'list' || init?.method) {
            oldRequestStarted = true
            return pendingOld
          }
          return Promise.resolve(jsonResponse([oldDeck]))
        }
        throw new Error(`Unexpected request: ${path}`)
      })
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      await screen.findByText('Gandalf')
      if (operation !== 'list') {
        await screen.findByText(oldDeck.name)
        if (operation === 'create') {
          fireEvent.change(await openNewDeck(), { target: { value: 'Stale created deck' } })
          fireEvent.change(screen.getByLabelText(/Commander/), { target: { value: 'Atraxa' } })
        fireEvent.focus(screen.getByRole('combobox', { name: /Commander/ }))
        fireEvent.click(await screen.findByRole('option', { name: 'Atraxa' }))
          fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
        } else if (operation === 'edit') {
          await openExistingDeck()
          fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
        } else {
          await openExistingDeck(); await openDeckAction('Löschen')
          fireEvent.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
        }
      }
      // Flush CSRF and start the business request before replacing its session.
      await act(async () => {})
      expect(oldRequestStarted).toBe(true)
      await logOutBeforeLogin()
      const form = loginForm()
      fireEvent.change(form.getByLabelText('Email'), { target: { value: 'wizard@example.com' } })
      fireEvent.change(form.getByLabelText('Password'), { target: { value: password } })
      fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
      await screen.findByText('Login successful.')
      await goTo('Decks')
      await screen.findByText(newDeck.name)
      await act(async () => {
        if (outcome === 'network') rejectOld(new Error('Stale network failure'))
        else if (outcome === '401' || outcome === '500') resolveOld(jsonResponse({ detail: 'Stale request failure' }, Number(outcome)))
        else if (operation === 'delete') resolveOld(new Response(null, { status: 204 }))
        else resolveOld(jsonResponse(operation === 'list' ? [oldDeck] : oldDeck, operation === 'create' ? 201 : 200))
      })
      expect(screen.getByText(nextUser.username)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: nextUser.username })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Meine Decks' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Deck erstellen' })).toBeEnabled()
      expect(screen.getByText(newDeck.name)).toBeInTheDocument()
      expect(screen.queryByText(oldDeck.name)).not.toBeInTheDocument()
      expect(screen.queryByText('Stale request failure')).not.toBeInTheDocument()
      expect(screen.queryByText('Stale network failure')).not.toBeInTheDocument()
      expect(screen.queryByText('Your session expired. Sign in again.')).not.toBeInTheDocument()
      expect(screen.queryByText(`${oldDeck.name} wurde erstellt.`)).not.toBeInTheDocument()
      expect(screen.queryByText(`${oldDeck.name} wurde gespeichert.`)).not.toBeInTheDocument()
      expect(screen.queryByText(`${oldDeck.name} wurde gelöscht.`)).not.toBeInTheDocument()
    })
  }
}


test.each(['request', 'csrf'])('a current deck %s 401 after re-login still expires the active session', async (source) => {
  let rejectDeck = false
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/session' && init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    if (path.startsWith('/api/scryfall/commanders?')) return Promise.resolve(jsonResponse([{ ...savedCommander('Atraxa'), thumbnailUrl: null }]))
    if (path === '/api/me' || path === '/api/session') return Promise.resolve(jsonResponse(user))
    if (path === '/api/groups') return Promise.resolve(jsonResponse([]))
    if (path === '/api/decks') return Promise.resolve(jsonResponse(init?.method ? {} : [], init?.method ? 401 : 200))
    if (path === '/api/csrf') return Promise.resolve(rejectDeck && source === 'csrf'
      ? jsonResponse({}, 401) : jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'token' }))
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Noch keine Decks.')
  await logOutBeforeLogin()
  const form = loginForm()
  fireEvent.change(form.getByLabelText('Email'), { target: { value: 'gandalf@example.com' } })
  fireEvent.change(form.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(form.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Login successful.')
  await goTo('Decks')
  await screen.findByText('Noch keine Decks.')
  rejectDeck = true
  fireEvent.change(await openNewDeck(), { target: { value: 'Deck' } })
  fireEvent.change(screen.getByLabelText(/Commander/), { target: { value: 'Atraxa' } })
  fireEvent.focus(screen.getByRole('combobox', { name: /Commander/ }))
  fireEvent.click(await screen.findByRole('option', { name: 'Atraxa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Deck erstellen' }))
  await screen.findByText('Your session expired. Sign in again.')
  expect(screen.getByText('Not signed in.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Meine Decks' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Playgroups' })).not.toBeInTheDocument()
  if (source === 'csrf') expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/decks' && init?.method)).toBe(false)
})
