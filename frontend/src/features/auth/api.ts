import { ApiError, errorMessage, getCsrf, requestDefaults, unsafeRequest } from '../../shared/http/client'

export type CurrentUser = {
  id: string
  username: string
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

/** One server-reported registration field problem, e.g. `{ field: 'username', code: 'USERNAME_TAKEN' }`. */
export type RegistrationFieldError = { field: string; code: string; maxLength?: number }

/** A rejected registration with its status, problem detail and any field-attributable errors (#277). */
export class RegistrationError extends ApiError {
  readonly fieldErrors: RegistrationFieldError[]

  constructor(message: string, status: number, fieldErrors: RegistrationFieldError[]) {
    super(message, status, fieldErrors[0]?.code)
    this.fieldErrors = fieldErrors
  }
}

function registrationFieldErrors(problem: unknown): RegistrationFieldError[] {
  if (typeof problem !== 'object' || problem === null) return []
  const errors = (problem as Record<string, unknown>).errors
  if (!Array.isArray(errors)) return []
  return errors.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { field, code, maxLength } = entry as Record<string, unknown>
    if (typeof field !== 'string' || typeof code !== 'string') return []
    return [{ field, code, ...(typeof maxLength === 'number' ? { maxLength } : {}) }]
  })
}

export async function registerUser(registration: Registration) {
  const response = await fetch('/api/users', {
    ...requestDefaults,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registration),
  })
  if (!response.ok) {
    let problem: unknown = null
    try {
      problem = await response.json()
    } catch {
      // Non-JSON failures keep the stable fallback message and no field errors.
    }
    const detail = typeof problem === 'object' && problem !== null && typeof (problem as Record<string, unknown>).detail === 'string'
      ? (problem as Record<string, string>).detail : 'Registration failed.'
    throw new RegistrationError(detail, response.status, registrationFieldErrors(problem))
  }
  return currentUserFrom(response)
}

export async function login(
  credentials: Credentials,
  onSessionChanged: () => void,
): Promise<CurrentUser> {
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
    // The status lets the entry distinguish rejected credentials (401) from server problems.
    throw new ApiError(await errorMessage(response, 'Login failed.'), response.status)
  }

  // The server-side identity changed, so the previous client identity is no
  // longer authoritative while the rotated session is being verified.
  onSessionChanged()
  await getCsrf()
  const user = await restoreSession()
  if (user === null) throw new Error('The authenticated session could not be confirmed.')
  return user
}

export async function logout(): Promise<void> {
  const response = await unsafeRequest('DELETE', '/api/session')
  if (response.status !== 204) {
    throw new ApiError('Logout could not be confirmed.', response.status)
  }
}
