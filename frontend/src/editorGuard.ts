import { createContext, useContext, useLayoutEffect } from 'react'

export const EditorGuard = createContext<(blocked: boolean, pending?: boolean) => () => void>(() => () => {})
export function useEditorGuard(blocked: boolean, pending = false) {
  const register = useContext(EditorGuard)
  useLayoutEffect(() => register(blocked, pending), [register, blocked, pending])
  return () => register(false)
}

export const EditorPopSubscription = createContext<((listener: (event: PopStateEvent) => void) => () => void) | null>(null)
