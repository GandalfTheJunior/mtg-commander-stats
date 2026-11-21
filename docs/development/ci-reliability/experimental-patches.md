# CI reliability investigation — experimental patches (Vitest and application candidates)

Companion to the [CI reliability investigation](../ci-reliability-investigation.md).
Browser diagnostics are in [experimental patches (browser)](experimental-patches-browser.md).

**None of these changes is applied to the repository.** They were used only in
a disposable worktree at `88966b7cdb9ce3cade955cd0f2ab36298f9514f1` and are
kept as text so that every experiment can be repeated. Files named `*.diag.*`
or `diag-*`, the instrumented copy of `GameDetailsPage.test.tsx` and
`src/test/delayImmediate.ts` are diagnostics and must never be committed as
source. “Candidate” diffs are proposals for a separately authorized
implementation, not finished or reviewed changes.

To reuse a diff: create a worktree at the baseline commit, save the block to
a file and run `git apply <file>` from the repository root.

## Scheduler control setup (#312, #306, invitation finding)

- `frontend/vite.config.ts`: loads the experimental setup file only when
  `DELAY_IMMEDIATE` is set, so runs without the variable are unchanged.
- `frontend/src/test/delayImmediate.ts`: replaces `setImmediate` (the React
  Scheduler host callback under Node) before React loads. `trace` records
  host callbacks; a number delays every callback by that many milliseconds;
  `targeted` delays only after a test arms it; `gate` lets a test park host
  callbacks and release them later.

```diff
diff --git a/frontend/src/test/delayImmediate.ts b/frontend/src/test/delayImmediate.ts
new file mode 100644
index 0000000..494c28f
--- /dev/null
+++ b/frontend/src/test/delayImmediate.ts
@@ -0,0 +1,20 @@
+// EXPERIMENT ONLY (#312) — never committed. Models an event loop in which the check phase (setImmediate, the React
+// Scheduler host callback under Node) is serviced later than a 0 ms timer (the drain at the end of RTL's waitFor).
+// DELAY_IMMEDIATE=trace keeps the real setImmediate and only records when each host callback runs.
+const mode = process.env.DELAY_IMMEDIATE!
+const real = globalThis.setImmediate
+const trace: string[] = ((globalThis as Record<string, unknown>).__immediateTrace = [])
+const gate = ((globalThis as Record<string, unknown>).__immediateGate = {
+  hold: false, held: [] as (() => void)[],
+  release() { gate.hold = false; for (const run of gate.held.splice(0)) real(run) },
+})
+let sequence = 0
+globalThis.setImmediate = ((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
+  const id = ++sequence
+  const run = () => { const started = performance.now(); callback(...args); trace.push(`${started.toFixed(2)} immediate#${id} ran ${(performance.now() - started).toFixed(2)}ms`) }
+  // 'gate': a test can park host callbacks (gate.hold = true) and let them run later (gate.release()).
+  if (mode === 'gate') return real(() => { if (gate.hold) gate.held.push(run); else run() })
+  // 'targeted': the test arms the delay itself (globalThis.__delayImmediateMs) for one specific commit.
+  const targeted = Number((globalThis as Record<string, unknown>).__delayImmediateMs ?? 0)
+  return mode === 'trace' || (mode === 'targeted' && !targeted) ? real(run) : setTimeout(run, mode === 'targeted' ? targeted : Number(mode))
+}) as unknown as typeof setImmediate
diff --git a/frontend/vite.config.ts b/frontend/vite.config.ts
index 16b3f95..495c619 100644
--- a/frontend/vite.config.ts
+++ b/frontend/vite.config.ts
@@ -51,7 +51,7 @@ export default defineConfig({
       reporter: [[fileURLToPath(new URL('./tools/split-coverage.mjs', import.meta.url))]],
     },
     environment: 'jsdom',
-    setupFiles: ['./src/test/setup.ts'],
+    setupFiles: [...(process.env.DELAY_IMMEDIATE ? ['./src/test/delayImmediate.ts'] : []), './src/test/setup.ts'],
     // Full router flows exceeded the default five seconds on a two-CPU runner.
     testTimeout: availableParallelism() <= 2 ? 15000 : 5000,
     // Two-CPU runners time out when route and editor integration suites compete.
```

## #312 diagnostics

`frontend/src/GamesHistory.diag.test.tsx`: the `41` case with a timeline of
observers, requests, commits and host callbacks. `DIAG_FIX=1` adds the wait
for a live observer.

```diff
diff --git a/frontend/src/GamesHistory.diag.test.tsx b/frontend/src/GamesHistory.diag.test.tsx
new file mode 100644
index 0000000..cfd0dac
--- /dev/null
+++ b/frontend/src/GamesHistory.diag.test.tsx
@@ -0,0 +1,66 @@
+// DIAGNOSTIC ONLY (#312) — never committed. Timeline of observer lifecycles vs waitFor resolution.
+import { act, screen, waitFor } from '@testing-library/react'
+import { afterEach, expect, test, vi } from 'vitest'
+import GameManager from './GameManager'
+import { renderApp } from './test/renderApp'
+import { gameApi, group, recorded, response, uid } from './test/gameFixtures'
+
+const log: string[] = []
+const mark = (m: string) => log.push(`${performance.now().toFixed(2)} ${m}`)
+let intersect: () => void
+let seen = 0
+let intersectId = 0, created = 0, live = new Set<number>()
+function show() {
+  vi.stubGlobal('IntersectionObserver', class {
+    id = ++created
+    constructor(callback: IntersectionObserverCallback) {
+      const id = this.id
+      mark(`observer#${id} constructed`)
+      intersectId = id
+      intersect = () => { mark(`intersect() -> observer#${id} live=${live.has(id)}`); callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
+    }
+    observe() { live.add(this.id) }
+    disconnect() { live.delete(this.id); mark(`observer#${this.id} disconnected`) }
+  })
+  return renderApp(<GameManager group={group} onUnauthorized={vi.fn()} onAccessLost={vi.fn()}
+    onCheckingAccess={vi.fn()} onGroupConfirmed={vi.fn()} />)
+}
+const path = `/api/groups/${group.id}/games/history`
+const rows = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
+  ...recorded({ id: uid(200 + start + i) }), playedOn: i % 2 ? null : '2026-11-09',
+}))
+afterEach(() => { (globalThis as Record<string, unknown>).__delayImmediateMs = 0; vi.unstubAllGlobals(); vi.restoreAllMocks() })
+
+test('diag 41', async () => {
+  const count = 41
+  const api = gameApi()
+  for (let offset = 0; offset < count; offset += 20) {
+    const cursor = offset ? `?cursor=page${offset}` : ''
+    api.next(path + cursor, () => { mark(`reply queued-hit ${cursor || '(first)'}`); return response({ games: rows(Math.min(20, count - offset), offset),
+      nextCursor: offset + 20 < count ? `page${offset + 20}` : null }) })
+  }
+  const original = api.fetchMock.getMockImplementation()!
+  api.fetchMock.mockImplementation(async (p: string, init?: RequestInit) => {
+    const r = await original(p, init)
+    mark(`fetch ${p.replace(/.*\/groups\/[^/]+/, '')} -> ${r.status}`)
+    return r
+  })
+  show()
+  new MutationObserver(() => { const n = document.querySelectorAll('article').length; if (n !== seen) { seen = n; mark(`DOM commit observed: ${n} articles`) } }).observe(document.body, { childList: true, subtree: true })
+  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
+  mark(`waitFor(20) resolved; current intersect -> observer#${intersectId}, live=${[...live]}`)
+  let failure: unknown
+  try {
+    for (let offset = 20; offset < count; offset += 20) {
+      // Targeted intervention: from the first append on, service scheduler host callbacks 100 ms late, so the
+      // passive effect that re-creates the observer for page 3 runs after waitFor(40) has returned.
+      if (process.env.DELAY_IMMEDIATE === 'targeted') (globalThis as Record<string, unknown>).__delayImmediateMs = 100
+      if (process.env.DIAG_FIX) await waitFor(() => expect(live.size).toBe(1))
+      act(() => { intersect(); intersect() })
+      await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(Math.min(offset + 20, count)), { timeout: 1500 })
+      mark(`waitFor(${Math.min(offset + 20, count)}) resolved; current intersect -> observer#${intersectId}, live=${[...live]}`)
+    }
+  } catch (error) { failure = error; mark('FAILED: ' + String((error as Error).message).split('\n')[0]) }
+  (await import('node:fs')).appendFileSync(process.env.DIAG_OUT ?? '/dev/null', [...log, ...(((globalThis as Record<string, unknown>).__immediateTrace as string[]) ?? [])].sort((a, b) => parseFloat(a) - parseFloat(b)).join('\n') + '\n---\n')
+  if (failure) throw new Error('diag failure: ' + document.body.textContent?.slice(0, 300))
+})
```

## #312 candidate test correction

Test-only. Keeps every assertion of `GamesHistory.test.tsx`.

```diff
diff --git a/frontend/src/GamesHistory.test.tsx b/frontend/src/GamesHistory.test.tsx
index 5e4bbbc..8d5d50e 100644
--- a/frontend/src/GamesHistory.test.tsx
+++ b/frontend/src/GamesHistory.test.tsx
@@ -4,24 +4,33 @@ import GameManager from './GameManager'
 import { renderApp } from './test/renderApp'
 import { deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'
 
-let intersect: () => void
+// Models observe()/disconnect(): only an observer that currently observes the sentinel can deliver a callback.
+type Observer = { fire: () => void }
+const observing = new Set<Observer>()
 function show() {
-  vi.stubGlobal('IntersectionObserver', class {
-    constructor(callback: IntersectionObserverCallback) {
-      intersect = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
-    }
-    observe() {}
-    disconnect() {}
+  vi.stubGlobal('IntersectionObserver', class implements Observer {
+    private readonly callback: IntersectionObserverCallback
+    constructor(callback: IntersectionObserverCallback) { this.callback = callback }
+    observe() { observing.add(this) }
+    disconnect() { observing.delete(this) }
+    fire() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
   })
   return renderApp(<GameManager group={group} onUnauthorized={vi.fn()} onAccessLost={vi.fn()}
     onCheckingAccess={vi.fn()} onGroupConfirmed={vi.fn()} />)
 }
+// The observer is created by a passive effect that React may flush after the commit that rendered the cards.
+// Wait for the current page's observer instead of assuming it exists once the cards are visible.
+async function intersect(times = 1) {
+  await waitFor(() => expect(observing.size).toBe(1))
+  const [current] = observing
+  act(() => { for (let index = 0; index < times; index++) current.fire() })
+}
 const path = `/api/groups/${group.id}/games/history`
 const end = 'Du hast das Ende der Bibliothek erreicht.'
 const rows = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
   ...recorded({ id: uid(200 + start + i) }), playedOn: i % 2 ? null : '2026-11-09',
 }))
-afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
+afterEach(() => { observing.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
 
 test.each([0, 1, 20, 21, 40, 41])('loads %s games in bounded server order and stops at the confirmed end', async count => {
   const api = gameApi()
@@ -39,7 +48,7 @@ test.each([0, 1, 20, 21, 40, 41])('loads %s games in bounded server order and st
     await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(Math.min(20, count)))
     for (let offset = 20; offset < count; offset += 20) {
       expect(screen.queryByText(end)).not.toBeInTheDocument()
-      act(() => { intersect(); intersect() })
+      await intersect(2)
       await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(Math.min(offset + 20, count)))
     }
     expect(screen.getByText(end)).toBeInTheDocument()
@@ -55,11 +64,9 @@ test('failed append preserves cards, retries the same cursor and deduplicates ov
   api.next(path, () => response({ games: rows(20), nextCursor: 'next' }))
   api.next(path + '?cursor=next', () => response({}, 503))
   api.next(path + '?cursor=next', () => response({ games: rows(2, 19), nextCursor: null }))
-  const previousObserver = intersect
   show()
   await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
-  await waitFor(() => expect(intersect).not.toBe(previousObserver))
-  act(() => intersect())
+  await intersect()
   fireEvent.click(await screen.findByRole('button', { name: 'Erneut versuchen' }))
   await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(21))
   expect(screen.getByText(end)).toBeInTheDocument()
@@ -71,7 +78,7 @@ test.each([200, 401, 403])('retired append response %s cannot update a new lifet
   api.next(path + '?cursor=next', () => pending.promise)
   const view = show()
   await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
-  act(() => intersect())
+  await intersect()
   view.unmount()
   await act(async () => pending.resolve(response({ games: rows(1, 20), nextCursor: null }, status)))
   expect(screen.queryByRole('article')).not.toBeInTheDocument()
@@ -98,7 +105,7 @@ test.each([401, 403])('append authorization failure %s removes private rows befo
   api.next(`/api/groups/${group.id}`, () => deferred().promise)
   show()
   await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
-  act(() => intersect())
+  await intersect()
   await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
   expect(screen.queryByText(end)).not.toBeInTheDocument()
 })
```

## #306 Vitest diagnostics

Instrumented `window refocus preserves the loaded %s view` test. With
`DELAY_IMMEDIATE=gate` it parks the passive-effect task of the commit that
renders the ManaBox link until the test focuses the link (or 600 ms pass).
`DIAG_FIX=1` adds the candidate test correction: wait for the initial heading
focus before taking the focus baseline.

```diff
diff --git a/frontend/src/GameDetailsPage.test.tsx b/frontend/src/GameDetailsPage.test.tsx
index 505c671..f1fafa0 100644
--- a/frontend/src/GameDetailsPage.test.tsx
+++ b/frontend/src/GameDetailsPage.test.tsx
@@ -696,8 +696,28 @@ test('a real Companion reveals only its saved name beside the first of two Comma
 test.each(['details', 'delete', 'victory', 'companion'])('window refocus preserves the loaded %s view and focus without another read', async mode => {
   const api = setup(), game = linkedGame()
   game.participants[0].deck.companion = { ...game.participants[0].deck.commanders[0], name: 'Saved Companion' }
+  // EXPERIMENT ONLY (#306): park the Scheduler task that follows the commit rendering the ManaBox link (the passive
+  // effects, including the heading focus). Release it when the test focuses the link (so it runs at the test's next
+  // macrotask yield) or, at the latest, 600 ms after the commit (a late but finite effect flush).
+  const gate = (globalThis as unknown as { __immediateGate?: { hold: boolean; release: () => void } }).__immediateGate
+  const focusLog: string[] = []
+  const describe = (node: Element | null) => node ? `${node.tagName.toLowerCase()}"${(node.textContent ?? '').slice(0, 24)}"` : 'null'
+  const onFocus = (event: Event) => focusLog.push(`${performance.now().toFixed(1)} focusin ${describe(event.target as Element)}`)
+  document.addEventListener('focusin', onFocus)
+  if (gate && mode === 'details') {
+    const armed = new MutationObserver(() => {
+      if (!document.querySelector('a[href*="manabox"]')) return
+      armed.disconnect(); gate.hold = true; focusLog.push(`${performance.now().toFixed(1)} link committed; passive effects parked`)
+      const release = (why: string) => { if (!gate.hold) return; focusLog.push(`${performance.now().toFixed(1)} parked host callbacks released (${why})`); gate.release() }
+      setTimeout(() => release('600 ms elapsed'), 600)
+      document.addEventListener('focusin', event => { if ((event.target as Element).matches('a[href*="manabox"]')) release('ManaBox link focused') })
+    })
+    armed.observe(document.body, { childList: true, subtree: true })
+  }
   api.state.history = [game]; show()
   const link = await screen.findByRole('link', { name: /Deck 1:.*ManaBox/ })
+  focusLog.push(`${performance.now().toFixed(1)} findByRole(link) resolved; active=${describe(document.activeElement)}`)
+  if (process.env.DIAG_FIX) await waitFor(() => expect(screen.getByRole('heading', { name: 'Spieldetails' })).toHaveFocus())
   const list = screen.getByRole('list', { name: 'Teilnehmende und Decks' })
   expect(within(list).getAllByRole('group', { name: 'Gespeicherte Kartenillustrationen' })).toHaveLength(4)
   let dialog: HTMLElement | null = null
@@ -716,6 +736,9 @@ test.each(['details', 'delete', 'victory', 'companion'])('window refocus preserv
   api.next(groupPath, () => { throw new Error('offline') })
   fireEvent(window, new Event('focus'))
   await act(async () => { await Promise.resolve() })
+  focusLog.push(`${performance.now().toFixed(1)} assertion; baseline=${describe(focused)} active=${describe(document.activeElement)}`)
+  document.removeEventListener('focusin', onFocus)
+  if (mode === 'details') (await import('node:fs')).appendFileSync(process.env.DIAG_OUT ?? '/dev/null', focusLog.join('\n') + '\n---\n')
   expect(document.activeElement).toBe(focused)
   expect(list.isConnected).toBe(true)
   expect(link.isConnected).toBe(true)
```

## #306 candidate application correction (initial focus in a layout effect)

```diff
diff --git a/frontend/src/GameDetailsPage.tsx b/frontend/src/GameDetailsPage.tsx
index f46a556..1dea383 100644
--- a/frontend/src/GameDetailsPage.tsx
+++ b/frontend/src/GameDetailsPage.tsx
@@ -84,7 +84,7 @@ export default function GameDetailsPage({ currentUser, onUnauthorized, onNotice,
     // including a retired 401 and CSRF preparation before a DELETE is sent.
     return () => { controller.abort(); request.current?.abort() }
   }, [groupId, gameId, load])
-  useEffect(() => { if (state.status === 'ready') heading.current?.focus() }, [state])
+  useLayoutEffect(() => { if (state.status === 'ready') heading.current?.focus() }, [state])
 
   function retry() {
     request.current?.abort()
```

## Invitation finding — candidate application correction

Same change for `InvitationPage.tsx` (exercised for the failure observed in
the full-suite baseline).

```diff
diff --git a/frontend/src/InvitationPage.tsx b/frontend/src/InvitationPage.tsx
index 7b97bc2..7a3ea6f 100644
--- a/frontend/src/InvitationPage.tsx
+++ b/frontend/src/InvitationPage.tsx
@@ -1,4 +1,4 @@
-import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
+import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
 import { retryDelay, useRetryWindow } from './retryWindow'
 import { Link, useNavigate } from 'react-router'
 import { Box, Button, Card, CircularProgress, IconButton, Typography } from '@mui/material'
@@ -94,7 +94,7 @@ export default function InvitationPage({ segment, user, checking, notice, onUnau
 
   const shownState = join.status === 'member' ? 'member' : preview.status
   // Announce exceptional outcomes by moving focus to their heading; the ordinary preview keeps the reading order.
-  useEffect(() => { if (shownState !== 'loading' && shownState !== 'ready') heading.current?.focus() }, [shownState])
+  useLayoutEffect(() => { if (shownState !== 'loading' && shownState !== 'ready') heading.current?.focus() }, [shownState])
 
   async function confirmJoin() {
     if (!code || !user || joining.current) return
```

## #315 candidate application correction (background expiry check does not disable controls)

Exercised only for the focus behavior. It leaves open what a user action
should do while a background check is in flight (`pending` still blocks a
second request); that needs a design decision before implementation.

```diff
diff --git a/frontend/src/ProfileClaimDialog.tsx b/frontend/src/ProfileClaimDialog.tsx
index e48bf92..780bf8a 100644
--- a/frontend/src/ProfileClaimDialog.tsx
+++ b/frontend/src/ProfileClaimDialog.tsx
@@ -91,11 +91,12 @@ export default function ProfileClaimDialog({ groupId, profile, onClose, onUnauth
   const sharing = useLinkSharing(code ? claimUrl(code) : null, 'Profilübernahme')
 
   /** Runs one request in this dialog's lifetime; late results after unmount are ignored. */
-  const run = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> => {
+  const run = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>, background = false): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> => {
     const signal = life.current?.signal
     if (!signal || signal.aborted || pending.current) return null
     pending.current = true
-    setBusy(true)
+    // A background, read-only check must not disable controls: a disabled control cannot keep keyboard focus.
+    if (!background) setBusy(true)
     try {
       return { ok: true, value: await operation(signal) }
     } catch (error) {
@@ -149,7 +150,7 @@ export default function ProfileClaimDialog({ groupId, profile, onClose, onUnauth
   const round = expiryRound !== null && expiryRound.at === expiresAt ? expiryRound.round : 0
   const checkExpiry = useCallback(async (at: string) => {
     const again = () => setExpiryRound(current => ({ at, round: (current?.at === at ? current.round : 0) + 1 }))
-    const result = await run(signal => getProfileInvitation(groupId, profile.userId, signal))
+    const result = await run(signal => getProfileInvitation(groupId, profile.userId, signal), true)
     // Another request is in flight: look again later instead of asserting anything now.
     if (!result) { again(); return }
     if (result.ok) {
```

## #320 candidate application correction (publish the signed-out state with the navigation)

```diff
diff --git a/frontend/src/App.tsx b/frontend/src/App.tsx
index f9d7e08..04fc753 100644
--- a/frontend/src/App.tsx
+++ b/frontend/src/App.tsx
@@ -1,4 +1,4 @@
-import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
+import { useCallback, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
 import {
   login,
   logout,
@@ -79,7 +79,8 @@ export default function App() {
   const invitation = inviteSegment(location.pathname)
   const claim = claimSegment(location.pathname)
   const inviteAuth = invitation === null && claim === null ? null : inviteAuthIntent(location.state)
-  useEffect(() => {
+  // Layout effect: the field takes focus in the commit that shows the form, never after input has begun.
+  useLayoutEffect(() => {
     if (!inviteAuth || sessionStatus !== 'signed-out') return
     document.getElementById(inviteAuth === 'login' ? 'auth-login-email' : 'auth-register-email')?.focus()
   }, [inviteAuth, sessionStatus, location.key])
@@ -216,10 +217,14 @@ export default function App() {
     try {
       await logout()
       if (version !== sessionVersionRef.current) return
-      setCurrentUser(null)
-      setSessionStatus('signed-out')
-      setSessionNotice({ kind: 'success', message: 'Logged out.' })
-      void navigate(claimReturn ?? '/', { replace: true, state: claimReturn ? { [inviteAuthKey]: 'login' } : null })
+      // The router commits a navigation as a transition. Publish the signed-out state in the same transition, so
+      // the sign-in form never renders with the previous location (stale post-login destination, late focus).
+      startTransition(() => {
+        setCurrentUser(null)
+        setSessionStatus('signed-out')
+        setSessionNotice({ kind: 'success', message: 'Logged out.' })
+        void navigate(claimReturn ?? '/', { replace: true, state: claimReturn ? { [inviteAuthKey]: 'login' } : null })
+      })
     } catch {
       try {
         const user = await restoreSession()
```

## #320 rejected application attempt (`flushSync` navigation)

Kept because it failed: under the same induced conditions it still produced
the misdirected password and the stale destination.

```diff
diff --git a/frontend/src/App.tsx b/frontend/src/App.tsx
index f9d7e08..7551b9d 100644
--- a/frontend/src/App.tsx
+++ b/frontend/src/App.tsx
@@ -1,4 +1,4 @@
-import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
+import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
 import {
   login,
   logout,
@@ -79,7 +79,8 @@ export default function App() {
   const invitation = inviteSegment(location.pathname)
   const claim = claimSegment(location.pathname)
   const inviteAuth = invitation === null && claim === null ? null : inviteAuthIntent(location.state)
-  useEffect(() => {
+  // Layout effect: the field takes focus in the commit that shows the form, never after input has begun.
+  useLayoutEffect(() => {
     if (!inviteAuth || sessionStatus !== 'signed-out') return
     document.getElementById(inviteAuth === 'login' ? 'auth-login-email' : 'auth-register-email')?.focus()
   }, [inviteAuth, sessionStatus, location.key])
@@ -216,10 +217,12 @@ export default function App() {
     try {
       await logout()
       if (version !== sessionVersionRef.current) return
+      // Commit the return location before the sign-in form becomes interactive, so the form never renders with
+      // the previous location (stale post-login destination) and its focus is not applied after typing has begun.
+      void navigate(claimReturn ?? '/', { replace: true, state: claimReturn ? { [inviteAuthKey]: 'login' } : null, flushSync: true })
       setCurrentUser(null)
       setSessionStatus('signed-out')
       setSessionNotice({ kind: 'success', message: 'Logged out.' })
-      void navigate(claimReturn ?? '/', { replace: true, state: claimReturn ? { [inviteAuthKey]: 'login' } : null })
     } catch {
       try {
         const user = await restoreSession()
```
