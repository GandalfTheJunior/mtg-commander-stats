import { useEffect, useState } from 'react'
import { ApiError } from './api'

const defaultRetryAfter = 60
/** Retry-After seconds for a 429 (default one minute); null when another attempt is allowed at once. */
export function retryDelay(error: unknown): number | null {
  return error instanceof ApiError && error.status === 429 ? Math.max(1, error.retryAfterSeconds ?? defaultRetryAfter) : null
}
const waitHint = (seconds: number) => seconds >= 60
  ? `Bitte warte etwa ${Math.round(seconds / 60)} ${Math.round(seconds / 60) === 1 ? 'Minute' : 'Minuten'}, bevor du es erneut versuchst.`
  : `Bitte warte etwa ${seconds} Sekunden, bevor du es erneut versuchst.`

/** Keeps a manual retry disabled until its Retry-After window has passed; nothing is resent automatically. */
export function useRetryWindow(delay: number | null, attempt: unknown) {
  const [elapsed, setElapsed] = useState<unknown>(null)
  useEffect(() => {
    if (delay === null) return
    const timer = window.setTimeout(() => setElapsed(attempt), delay * 1000)
    return () => window.clearTimeout(timer)
  }, [delay, attempt])
  const waiting = delay !== null && elapsed !== attempt
  return { waiting, hint: waiting ? waitHint(delay) : null }
}

