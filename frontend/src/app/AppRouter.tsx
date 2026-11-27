import { useCallback, useInsertionEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { EditorPopSubscription } from './editorGuard'

/** Install POP interception before BrowserRouter installs its history listener.
 * Chrome can flush a router transition in the first window listener, including
 * unmounting the draft, before a subsequently registered listener gets control.
 */
export function AppRouter({ children }: { children: ReactNode }) {
  const handler = useRef<((event: PopStateEvent) => void) | null>(null)
  const subscribe = useCallback((listener: (event: PopStateEvent) => void) => {
    handler.current = listener
    return () => { if (handler.current === listener) handler.current = null }
  }, [])
  useInsertionEffect(() => {
    const onPop = (event: PopStateEvent) => handler.current?.(event)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return <EditorPopSubscription.Provider value={subscribe}><BrowserRouter>{children}</BrowserRouter></EditorPopSubscription.Provider>
}
