import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, createInvitation, type Invitation } from './api'

export type InvitationState = { status: 'creating' } | { status: 'failed' } | { status: 'ready'; invitation: Invitation }
type State = InvitationState


/**
 * Owns #200 invitation creation. Requests start only from deliberate user events
 * (never from effects, so React StrictMode cannot duplicate them), at most one at
 * a time. Closing discards the presentation without revoking the issued token;
 * every later “Spieler einladen” issues a new, independent invitation.
 */
export function useInvitationCreation(groupId: string, onAccessError: (error: unknown) => void) {
  const [state, setState] = useState<State | null>(null)
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const accessError = useRef(onAccessError)
  useEffect(() => { accessError.current = onAccessError })
  useEffect(() => () => pending.current?.abort(), [])

  // The trigger stays focusable while pending (aria-disabled) so focus can return to it; this guard drops repeats.
  const create = useCallback(() => {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setState({ status: 'creating' })
    void createInvitation(groupId, controller.signal).then(invitation => {
      if (!controller.signal.aborted) setState(current => current && { status: 'ready', invitation })
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { setState(null); accessError.current(error) }
      else setState(current => current && { status: 'failed' })
    }).finally(() => {
      if (pending.current === controller) { pending.current = null; setBusy(false) }
    })
  }, [groupId])
  // A late result after closing is ignored by the `current &&` guards above; the request is not retried.
  const close = useCallback(() => setState(null), [])
  return { state, busy, create, close }
}
