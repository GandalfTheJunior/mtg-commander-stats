import { useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { UNSAFE_NavigationContext, useLocation } from 'react-router'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

import { EditorGuard, EditorLeave, EditorPopSubscription, type EditorGuardOptions } from './editorGuard'

/** Scoped Declarative Mode guard. Router push/replace/go and native POP are distinct paths. */
export function EditorNavigation({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const subscribePop = useContext(EditorPopSubscription)
  const parent = useContext(UNSAFE_NavigationContext)
  const location = useLocation()
  const blocked = useRef(false)
  const guardOptions = useRef<EditorGuardOptions | undefined>(undefined)
  const requestPending = useRef(false)
  const stayButton = useRef<HTMLButtonElement>(null)
  const [writePending, setWritePending] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  const restoring = useRef(false)
  const allowingPop = useRef(false)
  const afterRestore = useRef<(() => void) | null>(null)
  const index = useRef<number | undefined>(window.history.state?.idx)
  const focus = useRef<HTMLElement | null>(null)
  const [confirming, setConfirming] = useState(false)
  const ask = useCallback((leave: () => void) => {
    if (!blocked.current) { leave(); return }
    if (pending.current) return
    focus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pending.current = leave
    setWritePending(requestPending.current)
    setConfirming(true)
  }, [])
  const register = useCallback((value: boolean, pending = false, options?: EditorGuardOptions) => {
    requestPending.current = pending
    blocked.current = value
    guardOptions.current = options
    return () => { blocked.current = false; guardOptions.current = undefined }
  }, [])
  function navigateTo(to: Parameters<typeof parent.navigator.push>[0], leave: () => void) {
    const href = typeof to === 'string' ? to : `${to.pathname ?? location.pathname}${to.search ?? ''}${to.hash ?? ''}`
    if (guardOptions.current?.allows?.(new URL(href, window.location.href))) leave()
    else ask(leave)
  }
  const navigator = {
    ...parent.navigator,
    push: (...args: Parameters<typeof parent.navigator.push>) => navigateTo(args[0], () => parent.navigator.push(...args)),
    replace: (...args: Parameters<typeof parent.navigator.replace>) => navigateTo(args[0], () => parent.navigator.replace(...args)),
    go: (delta: number) => ask(() => parent.navigator.go(delta)),
  }

  useLayoutEffect(() => { index.current = window.history.state?.idx }, [location])
  useLayoutEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next: unknown = event.state?.idx
      if (restoring.current) {
        event.stopImmediatePropagation()
        if (typeof next === 'number' && next !== index.current && index.current !== undefined) {
          window.history.go(index.current - next)
          return
        }
        restoring.current = false
        const replay = afterRestore.current
        afterRestore.current = null
        replay?.()
        return
      }
      if (allowingPop.current) { allowingPop.current = false; return }
      if (!pending.current && guardOptions.current?.allows?.(new URL(window.location.href))) return
      if (!blocked.current || typeof next !== 'number' || index.current === undefined) return
      const delta = next - index.current
      if (!delta) return
      // Stop BrowserRouter notification and restore before replaying a confirmed
      // traversal. No duplicate synthetic history entries are inserted.
      event.stopImmediatePropagation()
      restoring.current = true
      window.history.go(-delta)
      ask(() => {
        const replay = () => { allowingPop.current = true; window.history.go(delta) }
        if (restoring.current) afterRestore.current = replay
        else replay()
      })
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!blocked.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') ||
        event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const url = new URL(anchor.href)
      if (guardOptions.current?.allows?.(url)) return
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return
      // Router links use the wrapped navigator; native links need their own fence.
      if (anchor.hasAttribute('data-discover') || !blocked.current) return
      event.preventDefault()
      event.stopPropagation()
      ask(() => window.location.assign(url.href))
    }
    const unsubscribePop = subscribePop?.(onPop)
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onLink, true)
    return () => {
      unsubscribePop?.()
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onLink, true)
    }
  }, [ask, subscribePop])
  function stay() { pending.current = null; setConfirming(false) }
  return <EditorGuard.Provider value={register}>
    <EditorLeave.Provider value={ask}>
    <UNSAFE_NavigationContext.Provider value={{ ...parent, navigator }}>
      {children}
      <Dialog open={confirming} onClose={stay} aria-labelledby="discard-title" aria-describedby="discard-description"
        slotProps={{ transition: { onEntered: () => stayButton.current?.focus(), onExited: () => { if (focus.current?.isConnected) focus.current.focus() } } }}>
        <DialogTitle id="discard-title">Änderungen verwerfen?</DialogTitle>
        <DialogContent><DialogContentText id="discard-description">
          Ungespeicherte Änderungen gehen verloren.{writePending && ' Ein bereits gesendeter Vorgang kann den Server trotzdem erreicht haben.'}
        </DialogContentText></DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap' }}>
          <Button ref={stayButton} autoFocus color="secondary" onClick={stay}>Im Editor bleiben</Button>
          <Button color="inherit" onClick={onLogout}>Log out</Button>
          <Button color="error" onClick={() => {
            const leave = pending.current
            pending.current = null
            blocked.current = false
            guardOptions.current?.onDiscard?.()
            setConfirming(false)
            leave?.()
          }}>Verwerfen und verlassen</Button>
        </DialogActions>
      </Dialog>
    </UNSAFE_NavigationContext.Provider>
    </EditorLeave.Provider>
  </EditorGuard.Provider>
}
