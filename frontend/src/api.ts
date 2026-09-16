export type CurrentUser = {
  id: string
  username: string
}

export const magicColors = ['W', 'U', 'B', 'R', 'G'] as const
export type MagicColor = (typeof magicColors)[number]

export type Deck = {
  id: string
  name: string
  commander: string
  colorIdentity: MagicColor[]
}

export type DeckInput = Omit<Deck, 'id'>

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
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

function deckFrom(value: unknown): Deck {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('commander' in value) ||
    typeof value.commander !== 'string' ||
    !('colorIdentity' in value) ||
    !Array.isArray(value.colorIdentity) ||
    !value.colorIdentity.every((color) =>
      magicColors.includes(color as MagicColor),
    )
  ) {
    throw new Error('The server returned an invalid deck response.')
  }
  return {
    id: value.id,
    name: value.name,
    commander: value.commander,
    colorIdentity: value.colorIdentity as MagicColor[],
  }
}

async function deckResponse(response: Response, fallback: string): Promise<Deck> {
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, fallback), response.status)
  }
  return deckFrom(await response.json())
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

async function unsafeDeckRequest(method: 'POST' | 'PUT' | 'DELETE', path: string, input?: DeckInput) {
  const csrf = await getCsrf()
  return fetch(path, {
    ...requestDefaults,
    method,
    headers: {
      ...(input ? { 'Content-Type': 'application/json' } : {}),
      [csrf.headerName]: csrf.token,
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  })
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
    throw new Error(await errorMessage(response, 'Login failed.'))
  }

  // The server-side identity changed, so the previous client identity is no
  // longer authoritative while the rotated session is being verified.
  onSessionChanged()
  await getCsrf()
  const user = await restoreSession()
  if (user === null) throw new Error('The authenticated session could not be confirmed.')
  return user
}

export async function listDecks(): Promise<Deck[]> {
  const response = await fetch('/api/decks', requestDefaults)
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not load your decks.'), response.status)
  }
  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('The server returned an invalid deck list.')
  }
  return body.map(deckFrom)
}

export async function createDeck(input: DeckInput): Promise<Deck> {
  return deckResponse(await unsafeDeckRequest('POST', '/api/decks', input), 'Could not create the deck.')
}

export async function updateDeck(id: string, input: DeckInput): Promise<Deck> {
  return deckResponse(
    await unsafeDeckRequest('PUT', `/api/decks/${id}`, input),
    'Could not update the deck.',
  )
}

export async function deleteDeck(id: string): Promise<void> {
  const response = await unsafeDeckRequest('DELETE', `/api/decks/${id}`)
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not delete the deck.'), response.status)
  }
}
