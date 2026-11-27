export class ApiError extends Error {
  readonly status: number
  /** Stable problem `code` (or the first field error code), when the server provides one. */
  readonly code?: string
  /** Seconds from a `Retry-After` header, when a rate-limited (429) response provides one. */
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message)
    this.status = status
    if (code) this.code = code
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds
  }
}

type CsrfToken = {
  headerName: string
  token: string
}

export const requestDefaults = {
  credentials: 'same-origin' as const,
}

async function problemOf(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  try {
    const problem: unknown = await response.json()
    if (typeof problem === 'object' && problem !== null) {
      const record = problem as Record<string, unknown>
      const firstError = Array.isArray(record.errors) ? record.errors[0] as unknown : undefined
      const code = typeof record.code === 'string' ? record.code
        : typeof firstError === 'object' && firstError !== null && typeof (firstError as Record<string, unknown>).code === 'string'
          ? (firstError as Record<string, string>).code : undefined
      return { message: typeof record.detail === 'string' ? record.detail : fallback, ...(code ? { code } : {}) }
    }
  } catch {
    // Use the stable, operation-specific fallback for non-JSON responses.
  }
  return { message: fallback }
}

export async function errorMessage(response: Response, fallback: string) {
  return (await problemOf(response, fallback)).message
}

export async function getCsrf(signal?: AbortSignal): Promise<CsrfToken> {
  const response = await fetch('/api/csrf', { ...requestDefaults, ...(signal ? { signal } : {}) })
  if (!response.ok) {
    throw new ApiError(await errorMessage(response, 'Could not prepare login.'), response.status)
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

export async function unsafeRequest(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, input?: object, signal?: AbortSignal,
  extraHeaders: Record<string, string> = {}, options: Pick<RequestInit, 'cache' | 'referrerPolicy'> = {}) {
  const csrf = await getCsrf(signal)
  signal?.throwIfAborted()
  return fetch(path, {
    ...requestDefaults,
    ...options,
    method,
    ...(signal ? { signal } : {}),
    headers: {
      ...(input ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
      [csrf.headerName]: csrf.token,
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Delay-seconds or HTTP-date `Retry-After` value; undefined when absent or unusable. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const date = Date.parse(trimmed)
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000))
}

export async function checkedResponse(response: Response, status: number, fallback: string) {
  if (!response.ok) {
    const problem = await problemOf(response, fallback)
    throw new ApiError(problem.message, response.status, problem.code,
      response.status === 429 ? retryAfterSeconds(response.headers.get('Retry-After')) : undefined)
  }
  if (response.status !== status) throw new Error('The server returned an unexpected response.')
  return response
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}
