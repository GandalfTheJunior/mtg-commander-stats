import { createContext, useContext, useLayoutEffect } from 'react'

export type EditorGuardOptions = {
  allows?: (destination: URL) => boolean
  onDiscard?: () => void
}
export const EditorGuard = createContext<(blocked: boolean, pending?: boolean, options?: EditorGuardOptions) => () => void>(() => () => {})
// Local actions (cancel, refresh) retire a draft without changing the URL.
export const EditorLeave = createContext<(leave: () => void) => void>(leave => leave())
export function useEditorGuard(blocked: boolean, pending = false, options?: EditorGuardOptions) {
  const register = useContext(EditorGuard)
  useLayoutEffect(() => register(blocked, pending, options), [register, blocked, pending, options])
  return () => register(false)
}

export const EditorPopSubscription = createContext<((listener: (event: PopStateEvent) => void) => () => void) | null>(null)
