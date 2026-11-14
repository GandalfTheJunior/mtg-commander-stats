# CI reliability investigation — experimental patches

Companion to the [CI reliability investigation](../ci-reliability-investigation.md).

**None of these changes is applied to the repository.** They were used only in
a disposable worktree at `88966b7cdb9ce3cade955cd0f2ab36298f9514f1` and are
kept here as text so that every experiment can be repeated. Files named
`*.diag.*` or `diag-*` and `src/test/delayImmediate.ts` are diagnostics and
must never be committed as source. “Candidate correction” diffs are proposals
for a separately authorized implementation, not finished changes.

To reuse a diff: create a worktree at the baseline commit, save the block to
a file and run `git apply <file>` from the repository root.

## #312 diagnostics

- `frontend/vite.config.ts`: loads the experimental setup file only when
  `DELAY_IMMEDIATE` is set, so runs without the variable are unchanged.
- `frontend/src/test/delayImmediate.ts`: replaces `setImmediate` before React
  loads. `trace` only records host callbacks; a number delays every callback
  by that many milliseconds; `targeted` delays only after a test arms it.
- `frontend/src/GamesHistory.diag.test.tsx`: the `41` case with a timeline of
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
diff --git a/frontend/src/test/delayImmediate.ts b/frontend/src/test/delayImmediate.ts
new file mode 100644
index 0000000..16293e2
--- /dev/null
+++ b/frontend/src/test/delayImmediate.ts
@@ -0,0 +1,14 @@
+// EXPERIMENT ONLY (#312) — never committed. Models an event loop in which the check phase (setImmediate, the React
+// Scheduler host callback under Node) is serviced later than a 0 ms timer (the drain at the end of RTL's waitFor).
+// DELAY_IMMEDIATE=trace keeps the real setImmediate and only records when each host callback runs.
+const mode = process.env.DELAY_IMMEDIATE!
+const real = globalThis.setImmediate
+const trace: string[] = ((globalThis as Record<string, unknown>).__immediateTrace = [])
+let sequence = 0
+globalThis.setImmediate = ((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
+  const id = ++sequence
+  const run = () => { const started = performance.now(); callback(...args); trace.push(`${started.toFixed(2)} immediate#${id} ran ${(performance.now() - started).toFixed(2)}ms`) }
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

## #298 diagnostics

`frontend/e2e/diag-298.pw.ts` copies the fixtures of `member-decks.pw.ts` and
stops at the long-list step. `DIAG_MODE=probe` records per-image state,
`original` runs the helper from `e748ed9e4530b2f3240619ecdc8cc2c333f74f03`,
`merged` runs the helper that is on `main`.

```diff
diff --git a/frontend/e2e/diag-298.pw.ts b/frontend/e2e/diag-298.pw.ts
new file mode 100644
index 0000000..2dd2583
--- /dev/null
+++ b/frontend/e2e/diag-298.pw.ts
@@ -0,0 +1,109 @@
+import { expect, test, type Page, type TestInfo } from '@playwright/test'
+
+// #199 read-only member decks with synthetic, non-sensitive API responses and generated artwork.
+const id = (value: number) => `cccccccc-cccc-4ccc-8ccc-${String(value).padStart(12, '0')}`
+const groupId = id(100)
+const base = `/api/groups/${groupId}`
+type Member = { userId: string; username: string; role: 'OWNER' | 'ADMIN' | 'MEMBER'; quickProfile?: boolean }
+const viewer: Member = { userId: id(1), username: 'Gandalf', role: 'OWNER' }
+const frodo: Member = { userId: id(4), username: 'Frodo', role: 'MEMBER' }
+const quick: Member = { userId: id(5), username: 'Flinker Waschbär', role: 'MEMBER', quickProfile: true }
+const roster: Member[] = [viewer, { userId: id(2), username: 'Saruman', role: 'ADMIN' }, { userId: id(3), username: 'Aragorn', role: 'MEMBER' }, quick, frodo]
+
+let oracle = 400
+const art = (name: string) => `https://cards.scryfall.io/art_crop/front/synthetic/${encodeURIComponent(name)}.svg`
+const card = (name: string, colors: string[], position = 1) => {
+  const printing = id(oracle + 200)
+  return { name, position, oracleId: id(oracle++), selectionRef: { scryfallCardId: printing }, scryfallCardId: printing,
+    canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: colors, effectiveColorIdentity: colors,
+    artworkFaceIndex: null, artCropUrl: art(name), illustrationId: null, artist: 'Synthetic artist', scryfallUri: null,
+    pairing: { roles: [], partnerWith: [], variants: [] },
+    cardFaces: [{ faceIndex: null, name, typeLine: 'Legendary Creature — Synthetic', oracleText: 'Synthetic rules text for screenshots.', imageUrl: null }] }
+}
+const companion = (name: string, colors: string[]) => {
+  const { position: _position, pairing: _pairing, canBeSoleCommander: _sole, requiresChosenColor: _requires, chosenColor: _chosen, effectiveColorIdentity: _effective, ...rest } = card(name, colors)
+  void [_position, _pairing, _sole, _requires, _chosen, _effective]
+  return rest
+}
+const dragons = { id: id(201), name: 'Drachenpakt', colorIdentity: ['W', 'U', 'B', 'R', 'G'], companion: null,
+  commanders: [card('The Ur-Dragon', ['W', 'U', 'B', 'R', 'G'])], manaBoxUrl: 'https://manabox.app/decks/Synthetic-Dragons_1' }
+const elves = { id: id(202), name: 'Elfenrat', colorIdentity: ['B', 'G'], companion: null, commanders: [card('Lathril, Blade of the Elves', ['B', 'G'])] }
+const partners = { id: id(203), name: 'Partnerkombo', colorIdentity: ['W', 'U', 'B', 'G'], companion: null,
+  commanders: [card('Tymna the Weaver', ['W', 'B']), card('Thrasios, Triton Hero', ['U', 'G'], 2)] }
+const superfriends = { id: id(204), name: 'Superfriends', colorIdentity: ['W', 'U', 'B', 'G'],
+  commanders: [card("Atraxa, Praetors' Voice", ['W', 'U', 'B', 'G'])], companion: companion('Lurrus of the Dream-Den', ['W', 'B']) }
+const extra = Array.from({ length: 6 }, (_, index) => ({ id: id(210 + index), name: `Testdeck mit langem Namen ${index + 1}`, colorIdentity: ['R'], companion: null,
+  commanders: [card(`Synthetic Commander with a Long Name ${index + 1}`, ['R'])] }))
+const short = [dragons, partners, superfriends]
+const long = [dragons, elves, partners, superfriends, ...extra]
+
+type DeckReply = unknown[] | { status: number }
+async function mockApi(page: Page, decks: Record<string, DeckReply>, members = roster) {
+  await page.route('https://cards.scryfall.io/**', async route => {
+    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!.replace(/\.svg$/, ''))
+    let hash = 0
+    for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 360
+    await route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220" viewBox="0 0 300 220">
+      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hash},45%,55%)"/><stop offset="1" stop-color="hsl(${(hash + 60) % 360},40%,25%)"/></linearGradient></defs>
+      <rect width="300" height="220" fill="url(#g)"/><circle cx="210" cy="70" r="38" fill="hsl(${(hash + 180) % 360},50%,75%)" opacity=".7"/>
+      <path d="M0 180 L80 110 L150 160 L220 90 L300 150 L300 220 L0 220Z" fill="rgba(0,0,0,.35)"/></svg>` })
+  })
+  await page.route('**/api/**', async route => {
+    const path = new URL(route.request().url()).pathname
+    const deckEntry = Object.entries(decks).find(([memberId]) => path === `${base}/members/${memberId}/decks`)
+    if (path === '/api/me') await route.fulfill({ json: { id: viewer.userId, username: viewer.username } })
+    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
+    else if (path === '/api/groups') await route.fulfill({ json: [{ id: id(101), name: 'Freitagsrunde', role: 'MEMBER' }, { id: id(102), name: 'Spielabend', role: 'ADMIN' }] })
+    else if (path === base) await route.fulfill({ json: { id: groupId, name: 'Commander-Runde', role: viewer.role, members } })
+    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
+    else if (deckEntry) {
+      const reply = deckEntry[1]
+      await route.fulfill(Array.isArray(reply) ? { json: reply } : { status: reply.status, json: {} })
+    } else await route.fulfill({ json: [] })
+  })
+}
+
+// DIAGNOSTIC ONLY (#298) — never committed.
+const original = (page: Page) => page.evaluate(() => Promise.all([...document.images].map(image => image.complete ? undefined : image.decode().catch(() => undefined))))
+const merged = (page: Page) => page.evaluate(() => Promise.all([...document.images].filter(image => {
+  const box = image.getBoundingClientRect()
+  return !image.complete && box.bottom > 0 && box.top < innerHeight && box.width > 0
+}).map(image => Promise.race([
+  new Promise(done => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }) }),
+  new Promise(done => setTimeout(done, 5000)),
+]))))
+for (const width of [320, 390, 1280]) {
+  test(`diag298 long list at ${width}px`, async ({ page, browserName }, info) => {
+    test.setTimeout(Number(process.env.DIAG_TIMEOUT ?? 30000))
+    const requested: string[] = []
+    page.on('request', request => { if (request.url().includes('scryfall')) requested.push(decodeURIComponent(request.url().split('/').pop()!)) })
+    await page.setViewportSize({ width, height: 844 })
+    await mockApi(page, { [id(3)]: long })
+    await page.goto(`/playgroups/${groupId}/members/${id(3)}/decks`)
+    await expect(page.getByRole('list', { name: 'Decks von Aragorn' }).getByRole('listitem')).toHaveCount(long.length)
+    const region = page.getByTestId('member-decks-region')
+    await region.evaluate(element => { element.scrollTop = 260 })
+    await region.evaluate(element => { element.scrollTop = 0 })
+    const mode = process.env.DIAG_MODE ?? 'probe'
+    if (mode === 'probe') {
+      const probe = await page.evaluate(() => Promise.all([...document.images].map(async image => {
+        const box = image.getBoundingClientRect(), region = document.querySelector('[data-testid="member-decks-region"]')!.getBoundingClientRect()
+        const before = { complete: image.complete, naturalWidth: image.naturalWidth }
+        const started = performance.now()
+        const outcome = image.complete ? 'already-complete' : await Promise.race([
+          image.decode().then(() => 'decode-resolved', error => 'decode-rejected:' + (error as Error).name),
+          new Promise<string>(done => setTimeout(() => done('decode-STILL-PENDING-after-3000ms'), 3000))])
+        return { alt: image.alt.replace('Illustration für ', ''), loading: image.loading, top: Math.round(box.top), bottom: Math.round(box.bottom),
+          inViewport: box.bottom > 0 && box.top < innerHeight, insideRegionClip: box.top < region.bottom && box.bottom > region.top,
+          before, outcome, ms: Math.round(performance.now() - started), after: { complete: image.complete, naturalWidth: image.naturalWidth } }
+      })))
+      const lines = probe.map(row => JSON.stringify(row)).join('\n')
+      ;(await import('node:fs')).appendFileSync(process.env.DIAG_OUT ?? '/dev/null', `## ${browserName} ${width}px innerHeight=844\n${lines}\nrequested artwork: ${JSON.stringify(requested)}\n`)
+    } else {
+      const started = Date.now()
+      await (mode === 'original' ? original(page) : merged(page))
+      ;(await import('node:fs')).appendFileSync(process.env.DIAG_OUT ?? '/dev/null', `${mode} ${browserName} ${width}px helper settled after ${Date.now() - started}ms\n`)
+    }
+    await page.screenshot({ path: info.outputPath(`diag298-${width}.png`) })
+  })
+}
```
