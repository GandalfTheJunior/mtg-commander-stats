export type CurrentUser = {
  id: string
  username: string
}

type CsrfToken = {
  headerName: string
  token: string
}

type Registration = {
  email: string
  username: string
  password: string
}

type Credentials = {
  email: string
  password: string
}

const requestDefaults = {
  credentials: 'same-origin' as const,
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const problem: unknown = await response.json()
    if (
      typeof problem === 'object' &&
      problem !== null &&
      'detail' in problem &&
      typeof problem.detail === 'string'
    ) {
      return problem.detail
    }
  } catch {
    // Use the stable, operation-specific fallback for non-JSON responses.
  }
  return fallback
}

async function currentUserFrom(response: Response): Promise<CurrentUser> {
  const user: unknown = await response.json()
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('username' in user) ||
    typeof user.username !== 'string'
  ) {
    throw new Error('The server returned an invalid user response.')
  }
  return { id: user.id, username: user.username }
}

export async function restoreSession(): Promise<CurrentUser | null> {
  const response = await fetch('/api/me', requestDefaults)
  if (response.status === 401) return null
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not check your session.'))
  }
  return currentUserFrom(response)
}

export async function registerUser(registration: Registration) {
  const response = await fetch('/api/users', {
    ...requestDefaults,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration),
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Registration failed.'))
  }
  return currentUserFrom(response)
}

async function getCsrf(): Promise<CsrfToken> {
  const response = await fetch('/api/csrf', requestDefaults)
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not prepare login.'))
  }
  const csrf: unknown = await response.json()
  if (
    typeof csrf !== 'object' ||
    csrf === null ||
    !('headerName' in csrf) ||
    typeof csrf.headerName !== 'string' ||
    !('token' in csrf) ||
    typeof csrf.token !== 'string'
  ) {
    throw new Error('The server returned an invalid CSRF response.')
  }
  return { headerName: csrf.headerName, token: csrf.token }
}

export async function login(credentials: Credentials): Promise<CurrentUser> {
  const csrf = await getCsrf()
  const response = await fetch('/api/session', {
    ...requestDefaults,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(credentials),
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Login failed.'))
  }

  // Successful authentication rotates the session and invalidates the old token.
  await getCsrf()
  const user = await restoreSession()
  if (user === null) throw new Error('The authenticated session could not be confirmed.')
  return user
}
