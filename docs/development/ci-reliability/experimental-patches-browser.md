# CI reliability investigation — experimental patches (browser diagnostics)

Companion to the [CI reliability investigation](../ci-reliability-investigation.md).
Vitest diagnostics and application candidates are in
[experimental patches](experimental-patches.md).

**None of these changes is applied to the repository.** They were used only in
a disposable worktree at `88966b7cdb9ce3cade955cd0f2ab36298f9514f1` and are
kept as text so that every experiment can be repeated. Files named `*.diag.*`
or `diag-*`, the instrumented copy of `GameDetailsPage.test.tsx` and
`src/test/delayImmediate.ts` are diagnostics and must never be committed as
source. “Candidate” diffs are proposals for a separately authorized
implementation, not finished or reviewed changes.

To reuse a diff: create a worktree at the baseline commit, save the block to
a file and run `git apply <file>` from the repository root.

Each spec copies the fixtures of the spec it investigates, so it runs without
touching the original. Environment variables select the variant; the
commands are listed in the main report, section E.3.

## #298 — `frontend/e2e/diag-298.pw.ts`

`DIAG_MODE=probe` records per-image state, `original` runs the helper from
`e748ed9e4530b2f3240619ecdc8cc2c333f74f03`, `merged` runs the helper on `main`.

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

## #306 — `frontend/e2e/diag-306.pw.ts`

Scroll and focus timeline of `game-details.pw.ts`. `DIAG_MODE`: `natural`,
`probe`, `induce` (baseline read in the same task as `focus()`), `corrected`
(candidate: let the focus scroll settle before the baseline).

```diff
diff --git a/frontend/e2e/diag-306.pw.ts b/frontend/e2e/diag-306.pw.ts
new file mode 100644
index 0000000..761129b
--- /dev/null
+++ b/frontend/e2e/diag-306.pw.ts
@@ -0,0 +1,182 @@
+import { expect, test } from '@playwright/test'
+import { mkdir } from 'node:fs/promises'
+import { appendFileSync } from 'node:fs'
+const MODE = process.env.DIAG_MODE ?? 'natural'
+const out = (line: string) => appendFileSync(process.env.DIAG_OUT ?? '/dev/null', line + '\n')
+
+const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
+const card = (name: string, position = 1) => ({ name, position, oracleId: id(400 + position), selectionRef: { scryfallCardId: id(300 + position) }, scryfallCardId: id(300 + position),
+  canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: [], effectiveColorIdentity: [],
+  artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null, pairing: { roles: [], partnerWith: [], variants: [] } })
+
+for (const width of [320, 1280]) for (const mode of ['normal', 'alternate', 'draw', 'readonly']) {
+  test(`diag306 ${mode} details at ${width}px`, async ({ page, browserName }, info) => {
+    await page.setViewportSize({ width, height: 900 })
+    const directory = process.env.MTG_SCREENSHOTS ?? info.outputPath('screenshots')
+    await mkdir(directory, { recursive: true })
+    const group = { id: id(10), name: 'Friday Night Commander', role: mode === 'readonly' ? 'MEMBER' : 'ADMIN', members: [1, 2, 3, 4].map(n => ({ userId: id(n), username: `Player ${n}`, role: 'MEMBER' })) }
+    const game = { id: id(20), groupId: group.id, creatorId: id(2), recordedAt: '2026-11-01T08:14:00Z', playedOn: mode === 'draw' ? null : '2026-10-31',
+      result: mode === 'draw' ? 'DRAW' : 'WIN', winnerUserId: mode === 'draw' ? null : id(4), alternateWinCon: mode === 'alternate',
+      participants: [3, 1, 4, 2].map(n => ({ userId: id(n), username: n === 2 ? 'An existing player with a particularly long display name' : `Player ${n}`,
+        startPosition: n, placement: mode === 'draw' || n === 3 ? null : n === 4 ? 1 : 2, stillInGame: mode === 'alternate' && n === 3 ? null : mode === 'draw' || n === 4,
+        deckId: id(100 + n), deck: { id: id(100 + n), name: n === 4 ? 'Partner control with a long saved deck name' : `Saved deck ${n}`, colorIdentity: [], archived: n === 3,
+          manaBoxUrl: n === 2 ? 'https://evil.test/deck' : n === 4 ? 'https://manabox.app/decks/synthetic-123' : null,
+          commanders: n === 4 ? [card('Tymna the Weaver'), card('Kraum, Ludevic’s Opus', 2)] : [card('A saved Commander name')],
+          companion: n === 4 ? card('Jegantha, the Wellspring') : null } })),
+    }
+    let privateReads = 0
+    await page.route('**/api/**', route => {
+      const pathname = new URL(route.request().url()).pathname
+      if (pathname === `/api/groups/${group.id}` || pathname.endsWith(`/games/${game.id}`)) privateReads++
+      const json = pathname === '/api/me' ? { id: id(1), username: 'Demo viewer' }
+        : pathname === `/api/groups/${group.id}` ? group : pathname.endsWith(`/games/${game.id}`) ? game : []
+      return route.fulfill({ json })
+    })
+    await page.goto(`/playgroups/${group.id}/games/${game.id}`)
+    await expect(page.getByRole('heading', { name: 'Spieldetails' })).toBeVisible()
+    const list = page.getByRole('list', { name: 'Teilnehmende und Decks' })
+    await expect(list.getByRole('heading')).toHaveText(['Player 1', 'An existing player with a particularly long display name', 'Player 3', 'Player 4'])
+    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
+    const edit = page.getByRole('button', { name: 'Spiel bearbeiten' }), remove = page.getByRole('button', { name: 'Spiel löschen' })
+    if (mode === 'readonly') { await expect(edit).toHaveCount(0); await expect(remove).toHaveCount(0) }
+    else {
+      const a = (await edit.boundingBox())!, b = (await remove.boundingBox())!
+      expect(a.y).toBe(b.y)
+      expect(a.x + a.width).toBeLessThanOrEqual(b.x)
+    }
+    await expect(list.getByRole('link', { name: /ManaBox/ })).toHaveCount(1)
+    const firstArt = (await list.getByRole('button', { name: 'Karte anzeigen: Tymna the Weaver', exact: true }).boundingBox())!
+    const secondArt = (await list.getByRole('button', { name: 'Karte anzeigen: Kraum, Ludevic’s Opus', exact: true }).boundingBox())!
+    const companionArt = (await list.getByRole('button', { name: 'Karte anzeigen: Jegantha, the Wellspring', exact: true }).boundingBox())!
+    expect(firstArt.width).toBe(secondArt.width)
+    expect(firstArt.height).toBe(secondArt.height)
+    expect(firstArt.y).toBe(secondArt.y)
+    expect(firstArt.x + firstArt.width).toBeLessThanOrEqual(secondArt.x)
+    expect(companionArt.y).toBeGreaterThan(firstArt.y)
+    expect(companionArt.height).toBeLessThan(firstArt.height)
+
+    const ys: string[] = []
+    const at = async (label: string) => { ys.push(`${label}=${await page.evaluate(() => `${scrollY}/max${document.documentElement.scrollHeight - innerHeight}/active:${document.activeElement?.tagName}:${(document.activeElement?.textContent ?? '').slice(0, 14)}/overflow:${document.body.style.overflow || '-'}`)}`) }
+    const refocus = async () => {
+      const before = await page.evaluate(() => ({ y: scrollY }))
+      const reads = privateReads
+      await page.evaluate(() => {
+        const active = document.activeElement
+        const y = scrollY
+        window.dispatchEvent(new FocusEvent('focus'))
+        if (document.activeElement !== active || scrollY !== y) throw new Error('Window focus changed focus or scroll')
+      })
+      await expect(page.getByRole('heading', { name: 'Spieldetails', includeHidden: true })).toBeAttached()
+      expect(privateReads).toBe(reads)
+      expect(await page.evaluate(() => scrollY)).toBe(before.y)
+    }
+    if (mode === 'draw') {
+      await expect(page.getByText('Spieldatum unbekannt')).toBeVisible()
+      await expect(list.getByText(/^Platz \d/)).toHaveCount(0)
+      await expect(page.getByText('Unentschieden', { exact: true })).toHaveCount(1)
+    } else {
+      const label = mode === 'alternate' ? 'Alternative Siegbedingung' : 'Normaler Sieg'
+      const winner = list.getByRole('button', { name: label })
+      await at('start'); await winner.focus(); await at('winner.focus'); await page.keyboard.press('Enter')
+      await expect(page.getByRole('dialog', { name: label })).toBeVisible(); await at('victory-open')
+      await refocus()
+      await expect(page.getByRole('dialog', { name: label })).toBeVisible()
+      await page.keyboard.press('Escape')
+      await expect(winner).toBeFocused(); await at('victory-closed')
+    }
+    const companion = page.getByRole('button', { name: 'Companion anzeigen' })
+    await companion.tap(); await at('companion.tap')
+    await expect(page.getByRole('dialog', { name: 'Companion anzeigen' })).toHaveText(/Jegantha, the Wellspring/); await at('companion-open')
+    await refocus()
+    await expect(page.getByRole('dialog', { name: 'Companion anzeigen' })).toBeVisible()
+    if (mode === 'alternate') await page.screenshot({ path: `${directory}/details-companion-refocus-${width}.png`, fullPage: true })
+    await page.keyboard.press('Escape'); await at('companion-escape')
+    await expect(page.getByRole('dialog', { name: 'Companion anzeigen' })).toHaveCount(0); await at('companion-gone')
+    const manaBox = list.getByRole('link', { name: /ManaBox/ })
+    const tag = `${MODE} ${browserName} ${mode} ${width}px`
+    const y0 = await page.evaluate(() => scrollY)
+    if (MODE === 'probe') {
+      // When does the focus-induced scroll become observable relative to focus()?
+      const probe = await manaBox.evaluate(async (link: HTMLElement, y0) => {
+        const frame = () => new Promise(done => requestAnimationFrame(done))
+        const events: string[] = []
+        const started = performance.now()
+        addEventListener('scroll', () => events.push(`scroll@${(performance.now() - started).toFixed(1)}ms y=${scrollY}`))
+        link.focus()
+        const sync = scrollY
+        await Promise.resolve(); const microtask = scrollY
+        await new Promise(done => setTimeout(done, 0)); const timeout0 = scrollY
+        await frame(); const frame1 = scrollY
+        await frame(); const frame2 = scrollY
+        await new Promise(done => setTimeout(done, 300)); const settled = scrollY
+        return { y0, sync, microtask, timeout0, frame1, frame2, settled, events, behavior: getComputedStyle(document.documentElement).scrollBehavior }
+      }, y0)
+      out(`${tag} ${JSON.stringify(probe)}`)
+      return
+    }
+    if (MODE === 'induce') {
+      // Controlled ordering: take the baseline in the same task as focus(), i.e. before any deferred focus scroll.
+      const before = await manaBox.evaluate((link: HTMLElement) => { link.focus(); return scrollY })
+      await expect(page.getByRole('heading', { name: 'Spieldetails', includeHidden: true })).toBeAttached()
+      const after = await page.evaluate(() => scrollY)
+      out(`${tag} y0=${y0} baseline-in-focus-task=${before} after=${after}`)
+      expect(after).toBe(before)
+      return
+    }
+    await manaBox.focus(); await at('manaBox.focus')
+    if (MODE === 'corrected') {
+      // Candidate correction: let the focus-induced scroll settle (two consecutive frames with an unchanged
+      // position and the link inside the viewport) before recording the baseline for the refocus invariant.
+      await manaBox.evaluate(async (link: HTMLElement) => {
+        const frame = () => new Promise(done => requestAnimationFrame(done))
+        for (let stable = 0, last = NaN; stable < 2;) {
+          await frame()
+          const box = link.getBoundingClientRect(), visible = box.top >= 0 && box.bottom <= innerHeight
+          stable = visible && scrollY === last ? stable + 1 : 0
+          last = scrollY
+        }
+      })
+    }
+    const baseline = await page.evaluate(() => scrollY)
+    await refocus()
+    await at('after-refocus')
+    out(`${tag} baseline=${baseline} ${ys.join(' | ')}`)
+    await expect(manaBox).toBeFocused()
+    if (mode === 'normal') {
+      await page.context().route('https://manabox.app/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Synthetic ManaBox tab</title>' }))
+      await manaBox.scrollIntoViewIfNeeded()
+      const reads = privateReads
+      const opened = page.waitForEvent('popup')
+      await manaBox.click()
+      const tab = await opened
+      const y = await page.evaluate(() => scrollY)
+      await tab.waitForLoadState('domcontentloaded')
+      await tab.close()
+      await page.bringToFront()
+      await expect(manaBox).toBeFocused()
+      expect(await page.evaluate(() => scrollY)).toBe(y)
+      expect(privateReads).toBe(reads)
+    }
+    await page.screenshot({ path: `${directory}/details-${mode}-${width}.png`, fullPage: true })
+    if (mode === 'alternate') {
+      await edit.click()
+      const editor = page.getByRole('form', { name: 'Spiel bearbeiten' })
+      await expect(editor).toBeVisible()
+      // The unknown alternate survival status stays unknown instead of being inferred.
+      await expect(editor.getByRole('switch', { name: 'Alternative Siegbedingung' })).toBeChecked()
+      await expect(editor.getByRole('combobox', { name: 'Ergebnis für Player 3' })).toHaveValue('')
+      await expect(editor.getByRole('img', { name: 'Player 4: Sieger des Spiels, Platz 1' })).toBeVisible()
+      await page.screenshot({ path: `${directory}/details-edit-handoff-${width}.png`, fullPage: true })
+    }
+    if (mode === 'normal') {
+      await remove.click()
+      const confirmation = page.getByRole('dialog', { name: 'Spiel endgültig löschen?' })
+      await expect(confirmation.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
+      await refocus()
+      await expect(confirmation).toBeVisible()
+      await page.screenshot({ path: `${directory}/details-confirm-refocus-${width}.png`, fullPage: true })
+      await page.getByRole('button', { name: 'Abbrechen' }).click()
+      await expect(page.getByRole('dialog')).toHaveCount(0)
+    }
+  })
+}
```

## #306 — `frontend/e2e/diag-306b.pw.ts`

Measures when a focus-induced scroll becomes observable.

```diff
diff --git a/frontend/e2e/diag-306b.pw.ts b/frontend/e2e/diag-306b.pw.ts
new file mode 100644
index 0000000..4048a2c
--- /dev/null
+++ b/frontend/e2e/diag-306b.pw.ts
@@ -0,0 +1,80 @@
+import { expect, test } from '@playwright/test'
+import { mkdir } from 'node:fs/promises'
+import { appendFileSync } from 'node:fs'
+
+const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
+const card = (name: string, position = 1) => ({ name, position, oracleId: id(400 + position), selectionRef: { scryfallCardId: id(300 + position) }, scryfallCardId: id(300 + position),
+  canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: [], effectiveColorIdentity: [],
+  artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null, pairing: { roles: [], partnerWith: [], variants: [] } })
+
+for (const width of [1280]) for (const mode of ['normal']) {
+  test(`diag306b focus scroll timing at ${width}px`, async ({ page, browserName }, info) => {
+    await page.setViewportSize({ width, height: 900 })
+    const directory = process.env.MTG_SCREENSHOTS ?? info.outputPath('screenshots')
+    await mkdir(directory, { recursive: true })
+    const group = { id: id(10), name: 'Friday Night Commander', role: mode === 'readonly' ? 'MEMBER' : 'ADMIN', members: [1, 2, 3, 4].map(n => ({ userId: id(n), username: `Player ${n}`, role: 'MEMBER' })) }
+    const game = { id: id(20), groupId: group.id, creatorId: id(2), recordedAt: '2026-11-01T08:14:00Z', playedOn: mode === 'draw' ? null : '2026-10-31',
+      result: mode === 'draw' ? 'DRAW' : 'WIN', winnerUserId: mode === 'draw' ? null : id(4), alternateWinCon: mode === 'alternate',
+      participants: [3, 1, 4, 2].map(n => ({ userId: id(n), username: n === 2 ? 'An existing player with a particularly long display name' : `Player ${n}`,
+        startPosition: n, placement: mode === 'draw' || n === 3 ? null : n === 4 ? 1 : 2, stillInGame: mode === 'alternate' && n === 3 ? null : mode === 'draw' || n === 4,
+        deckId: id(100 + n), deck: { id: id(100 + n), name: n === 4 ? 'Partner control with a long saved deck name' : `Saved deck ${n}`, colorIdentity: [], archived: n === 3,
+          manaBoxUrl: n === 2 ? 'https://evil.test/deck' : n === 4 ? 'https://manabox.app/decks/synthetic-123' : null,
+          commanders: n === 4 ? [card('Tymna the Weaver'), card('Kraum, Ludevic’s Opus', 2)] : [card('A saved Commander name')],
+          companion: n === 4 ? card('Jegantha, the Wellspring') : null } })),
+    }
+    let privateReads = 0
+    await page.route('**/api/**', route => {
+      const pathname = new URL(route.request().url()).pathname
+      if (pathname === `/api/groups/${group.id}` || pathname.endsWith(`/games/${game.id}`)) privateReads++
+      const json = pathname === '/api/me' ? { id: id(1), username: 'Demo viewer' }
+        : pathname === `/api/groups/${group.id}` ? group : pathname.endsWith(`/games/${game.id}`) ? game : []
+      return route.fulfill({ json })
+    })
+    await page.goto(`/playgroups/${group.id}/games/${game.id}`)
+    await expect(page.getByRole('heading', { name: 'Spieldetails' })).toBeVisible()
+    const list = page.getByRole('list', { name: 'Teilnehmende und Decks' })
+    await expect(list.getByRole('heading')).toHaveText(['Player 1', 'An existing player with a particularly long display name', 'Player 3', 'Player 4'])
+    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
+    const edit = page.getByRole('button', { name: 'Spiel bearbeiten' }), remove = page.getByRole('button', { name: 'Spiel löschen' })
+    if (mode === 'readonly') { await expect(edit).toHaveCount(0); await expect(remove).toHaveCount(0) }
+    else {
+      const a = (await edit.boundingBox())!, b = (await remove.boundingBox())!
+      expect(a.y).toBe(b.y)
+      expect(a.x + a.width).toBeLessThanOrEqual(b.x)
+    }
+    await expect(list.getByRole('link', { name: /ManaBox/ })).toHaveCount(1)
+    const firstArt = (await list.getByRole('button', { name: 'Karte anzeigen: Tymna the Weaver', exact: true }).boundingBox())!
+    const secondArt = (await list.getByRole('button', { name: 'Karte anzeigen: Kraum, Ludevic’s Opus', exact: true }).boundingBox())!
+    const companionArt = (await list.getByRole('button', { name: 'Karte anzeigen: Jegantha, the Wellspring', exact: true }).boundingBox())!
+    expect(firstArt.width).toBe(secondArt.width)
+    expect(firstArt.height).toBe(secondArt.height)
+    expect(firstArt.y).toBe(secondArt.y)
+    expect(firstArt.x + firstArt.width).toBeLessThanOrEqual(secondArt.x)
+    expect(companionArt.y).toBeGreaterThan(firstArt.y)
+    expect(companionArt.height).toBeLessThan(firstArt.height)
+
+    // DIAGNOSTIC ONLY (#306) — never committed. Is the focus-induced scroll applied inside focus() or later?
+    const geometry = await page.evaluate(() => Object.fromEntries([['winner', 'button[aria-label="Normaler Sieg"]'], ['companion', 'button[aria-label="Companion anzeigen"]'], ['manaBox', 'a[href*="manabox"]']]
+      .map(([name, selector]) => { const box = document.querySelector(selector)?.getBoundingClientRect(); return [name, box ? `${Math.round(box.top + scrollY)}..${Math.round(box.bottom + scrollY)}` : 'missing'] })))
+    const variant = process.env.DIAG_VARIANT ?? 'plain'
+    const result = await list.getByRole('button', { name: 'Normaler Sieg' }).evaluate(async (button: HTMLElement, variant) => {
+      const frame = () => new Promise(done => requestAnimationFrame(done))
+      const started = performance.now(), events: string[] = []
+      addEventListener('scroll', () => events.push(`scroll@${(performance.now() - started).toFixed(1)}ms y=${scrollY}`))
+      const before = scrollY
+      button.focus()
+      const sync = scrollY
+      if (variant === 'lock') document.body.style.overflow = 'hidden'   // what MUI's modal scroll lock does on open
+      await Promise.resolve(); const microtask = scrollY
+      await new Promise(done => setTimeout(done, 0)); const timeout0 = scrollY
+      await frame(); const frame1 = scrollY
+      await frame(); const frame2 = scrollY
+      await new Promise(done => setTimeout(done, 300)); const settled = scrollY
+      if (variant === 'lock') document.body.style.overflow = ''
+      await frame(); await frame()
+      return { before, sync, microtask, timeout0, frame1, frame2, settled, afterUnlock: scrollY, events, max: document.documentElement.scrollHeight - innerHeight, innerHeight }
+    }, variant)
+    appendFileSync(process.env.DIAG_OUT ?? '/dev/null', `${variant} ${browserName} ${width}px geometry(docY)=${JSON.stringify(geometry)} ${JSON.stringify(result)}\n`)
+    void info
+  })
+}
```

## #306 — `frontend/e2e/diag-306c.pw.ts`

A copy of `diag-306.pw.ts` with the following differences (`DIAG_WINNER`,
`DIAG_PRE=top|at227`). Create it with
`cp e2e/diag-306.pw.ts e2e/diag-306c.pw.ts` and `patch e2e/diag-306c.pw.ts < file`.

```diff
--- diag-306.pw.ts
+++ diag-306c.pw.ts
@@ -10,7 +10,7 @@
   artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null, pairing: { roles: [], partnerWith: [], variants: [] } })
 
 for (const width of [320, 1280]) for (const mode of ['normal', 'alternate', 'draw', 'readonly']) {
-  test(`diag306 ${mode} details at ${width}px`, async ({ page, browserName }, info) => {
+  test(`diag306c ${mode} details at ${width}px`, async ({ page, browserName }, info) => {
     await page.setViewportSize({ width, height: 900 })
     const directory = process.env.MTG_SCREENSHOTS ?? info.outputPath('screenshots')
     await mkdir(directory, { recursive: true })
@@ -77,7 +77,13 @@
     } else {
       const label = mode === 'alternate' ? 'Alternative Siegbedingung' : 'Normaler Sieg'
       const winner = list.getByRole('button', { name: label })
-      await at('start'); await winner.focus(); await at('winner.focus'); await page.keyboard.press('Enter')
+      await at('start')
+      if (process.env.DIAG_WINNER === 'atomic') {
+        // Controlled ordering: the activation that opens the dialog arrives in the same task as focus(), i.e. before
+        // WebKit has performed the deferred scroll that reveals the focused winner button.
+        await winner.evaluate((button: HTMLElement) => { button.focus(); button.click() })
+        await at('winner.focus+activate')
+      } else { await winner.focus(); await at('winner.focus'); await page.keyboard.press('Enter') }
       await expect(page.getByRole('dialog', { name: label })).toBeVisible(); await at('victory-open')
       await refocus()
       await expect(page.getByRole('dialog', { name: label })).toBeVisible()
@@ -85,6 +91,9 @@
       await expect(winner).toBeFocused(); await at('victory-closed')
     }
     const companion = page.getByRole('button', { name: 'Companion anzeigen' })
+    // Controlled precondition: the page is still at the top when the Companion button is tapped, as it is when
+    // the deferred scroll for the previously focused winner button was never applied.
+    if (process.env.DIAG_PRE === 'top') { await page.evaluate(() => scrollTo(0, 0)); await at('forced-top') }
     await companion.tap(); await at('companion.tap')
     await expect(page.getByRole('dialog', { name: 'Companion anzeigen' })).toHaveText(/Jegantha, the Wellspring/); await at('companion-open')
     await refocus()
@@ -94,6 +103,9 @@
     await expect(page.getByRole('dialog', { name: 'Companion anzeigen' })).toHaveCount(0); await at('companion-gone')
     const manaBox = list.getByRole('link', { name: /ManaBox/ })
     const tag = `${MODE} ${browserName} ${mode} ${width}px`
+    // Controlled precondition: the scroll offset that the failed CI run reported as its baseline (227 = the minimal
+    // offset that reveals the Companion button; the ManaBox link below it is still outside the viewport).
+    if (process.env.DIAG_PRE === 'at227') await page.evaluate(() => scrollTo(0, 227))
     const y0 = await page.evaluate(() => scrollY)
     if (MODE === 'probe') {
       // When does the focus-induced scroll become observable relative to focus()?
```

## #315 — `frontend/e2e/diag-315.pw.ts`

The `01–03` issuer scenario with a focus/keyboard log. `DIAG_ALIGN=<ms>`
aligns the Escape close with the dialog's expiry re-check,
`DIAG_STATUS_DELAY=<ms>` adds latency to the status GET, `DIAG_EXPIRY=future`
is the candidate fixture correction, `DIAG_VARIANT=unfocused-open` was
prepared but not used for a reported result.

```diff
diff --git a/frontend/e2e/diag-315.pw.ts b/frontend/e2e/diag-315.pw.ts
new file mode 100644
index 0000000..4b3fe7b
--- /dev/null
+++ b/frontend/e2e/diag-315.pw.ts
@@ -0,0 +1,265 @@
+import { appendFileSync } from 'node:fs'
+import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
+import jsQRModule from 'jsqr'
+
+// jsqr is CommonJS; its typings describe only the default export it also provides at runtime.
+const jsQR = (jsQRModule as unknown as { default: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).default
+
+// #247 quick-profile claim invitations with synthetic, non-sensitive API responses.
+const id = (value: number) => `dddddddd-dddd-4ddd-8ddd-${String(value).padStart(12, '0')}`
+const groupId = id(100)
+const profileId = id(5)
+const base = `/api/groups/${groupId}`
+const invitationPath = `${base}/quick-profiles/${profileId}/invitation`
+const code = 'Qr5tUvWxYz0123456789_-'
+const groupName = 'Friday Commander'
+const profileName = 'Hairy Zombie'
+const owner = { id: id(1), username: 'Gandalf' }
+const guest = { id: id(2), username: 'Frodo' }
+type Options = {
+  user?: typeof owner | null; role?: 'OWNER' | 'ADMIN' | 'MEMBER'; active?: boolean
+  create?: number | 'abort'; preview?: number; accept?: number | 'abort'; retryAfter?: string
+}
+
+async function mockApi(page: Page, options: Options = {}) {
+  const state = {
+    user: options.user === undefined ? owner : options.user, active: options.active ?? false, expiresAt: '2026-11-13T18:45:00Z',
+    previewStatus: options.preview ?? 200, creates: 0, revokes: 0, accepts: 0, previews: [] as Record<string, string>[], tokenUrls: [] as string[],
+    acceptedFor: [] as (string | undefined)[],
+  }
+  // Any request carrying the token is recorded to prove it never leaves the application's own API.
+  // Context-wide, so several tabs share one simulated server session (cross-tab scenarios).
+  page.context().on('request', request => { if (request.url().includes(code) && !new URL(request.url()).pathname.startsWith('/claim/')) state.tokenUrls.push(request.url()) })
+  await page.context().route('**/api/**', async route => {
+    const request = route.request()
+    const path = new URL(request.url()).pathname
+    const method = request.method()
+    const status = (value: number | 'abort' | undefined, fallback: number) => value ?? fallback
+    if (path === '/api/me') await route.fulfill(state.user ? { json: state.user } : { status: 401, json: {} })
+    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
+    else if (path === '/api/session' && method === 'POST') { state.user = guest; await route.fulfill({ json: guest }) }
+    else if (path === '/api/session' && method === 'DELETE') { state.user = null; await route.fulfill({ status: 204 }) }
+    else if (path === '/api/users' && method === 'POST') await route.fulfill({ status: 201, json: guest })
+    else if (path === invitationPath && method === 'GET') {
+      await new Promise(resolve => setTimeout(resolve, Number(process.env.DIAG_STATUS_DELAY ?? 0)))
+      await route.fulfill({ json: { active: state.active, expiresAt: state.active ? state.expiresAt : null } })
+    }
+    else if (path === invitationPath && method === 'POST') {
+      state.creates++
+      await new Promise(resolve => setTimeout(resolve, 150))
+      const result = status(options.create, 201)
+      if (result === 'abort') { state.active = true; await route.abort('connectionreset') }
+      else if (result === 201) { state.active = true; await route.fulfill({ status: 201, json: { code, expiresAt: state.expiresAt } }) }
+      else await route.fulfill({ status: result, json: {} })
+    } else if (path === invitationPath && method === 'DELETE') { state.revokes++; state.active = false; await route.fulfill({ status: 204 }) }
+    else if (path === `/api/profile-invitations/${code}`) {
+      state.previews.push(await request.allHeaders())
+      const result = state.previewStatus
+      await route.fulfill(result === 200 ? { json: { groupName, profileName }, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
+        : { status: result, json: {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
+    } else if (path === `/api/profile-invitations/${code}/accept`) {
+      state.accepts++
+      const expected = (request.postDataJSON() as { expectedAccountId?: string } | null)?.expectedAccountId
+      state.acceptedFor.push(expected)
+      await new Promise(resolve => setTimeout(resolve, 150))
+      // Like the backend (#247): only the confirmed account may claim.
+      if (!state.user) { await route.fulfill({ status: 401, json: {} }); return }
+      if (expected !== state.user.id) { await route.fulfill({ status: 409, json: { status: 409, code: 'PROFILE_CLAIM_ACCOUNT_MISMATCH' } }); return }
+      const result = state.accepts === 1 ? status(options.accept, 204) : 204
+      if (result === 'abort') await route.abort('connectionreset')
+      else await route.fulfill(result === 204 ? { status: 204 }
+        : { status: result, json: result === 409 ? { status: 409, code: 'PROFILE_CLAIM_SAME_GAME' } : {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
+    } else if (path === base) await route.fulfill({ json: { id: groupId, name: groupName, role: options.role ?? 'OWNER', members: [
+      { userId: owner.id, username: owner.username, role: 'OWNER' },
+      { userId: id(3), username: 'Aragorn', role: 'MEMBER' },
+      { userId: profileId, username: profileName, role: 'MEMBER', quickProfile: true },
+    ] } })
+    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
+    else if (path === '/api/groups') await route.fulfill({ json: state.accepts ? [{ id: groupId, name: groupName, role: 'MEMBER' }] : [] })
+    else await route.fulfill({ json: [] })
+  })
+  return state
+}
+
+async function shot(page: Page, info: TestInfo, name: string) {
+  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
+  const fullPage = await page.getByRole('dialog').count() === 0
+  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
+  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}-${info.project.name}.png`, fullPage })
+}
+const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
+const withShare = (page: Page) => page.addInitScript(() => {
+  const shared: unknown[] = []
+  Object.defineProperty(window, '__shared', { value: shared })
+  Object.defineProperty(Navigator.prototype, 'share', { value: (data: unknown) => { shared.push(data); return Promise.resolve() }, configurable: true })
+  Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true })
+})
+async function touchTargets(controls: Locator[]) {
+  for (const control of controls) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
+}
+/** The dialog stays inside the viewport and no content overflows it; text inputs scroll their own value by design. */
+async function fitsWidth(page: Page, dialog: Locator) {
+  const box = (await dialog.boundingBox())!
+  const width = page.viewportSize()!.width
+  expect(box.x).toBeGreaterThanOrEqual(0)
+  expect(box.x + box.width).toBeLessThanOrEqual(width)
+  expect(await dialog.evaluate(element => [...element.querySelectorAll(':not(input)')].filter(child => !(child.scrollWidth <= child.clientWidth + 1 || getComputedStyle(child).overflowX !== 'visible')).map(child => `${child.tagName}.${child.className} ${child.scrollWidth}/${child.clientWidth}`))).toEqual([])
+  expect(await noHorizontalOverflow(page)).toBe(true)
+}
+
+/** Rasterize the rendered QR SVG in the page and decode its pixels like a camera would. */
+async function decodeQr(page: Page) {
+  const image = await page.getByRole('img', { name: 'QR-Code mit dem Einladungslink' }).evaluate(async svg => {
+    const markup = new XMLSerializer().serializeToString(svg)
+    const source = new Image()
+    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
+    await source.decode()
+    const canvas = document.createElement('canvas')
+    canvas.width = canvas.height = 400
+    const context = canvas.getContext('2d')!
+    context.drawImage(source, 0, 0, 400, 400)
+    return Array.from(context.getImageData(0, 0, 400, 400).data)
+  })
+  return jsQR(Uint8ClampedArray.from(image), 400, 400)?.data
+}
+
+async function openIssuer(page: Page) {
+  await page.goto(`/playgroups/${groupId}/members`)
+  await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
+  await page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }).click()
+  return page.getByRole('dialog', { name: 'Profilübernahme einladen' })
+}
+
+// ---------------------------------------------------------------- wireframes 01–03: issuer
+
+for (const width of (process.env.DIAG_WIDTHS ?? '1280').split(',').map(Number)) {
+  test(`diag315 01–03 at ${width}px`, async ({ page, baseURL, browserName }, info) => {
+    // DIAGNOSTIC ONLY (#315) — never committed. Records every focus transition and the state around the nested close.
+    await page.addInitScript(() => {
+      const name = (node: EventTarget | null) => {
+        if (!(node instanceof Element)) return String(node)
+        const label = node.getAttribute('aria-label') ?? node.getAttribute('aria-labelledby') ?? (node.textContent ?? '').trim().slice(0, 28)
+        return `${node.tagName.toLowerCase()}${node.getAttribute('role') ? `[role=${node.getAttribute('role')}]` : ''}${node.className && String(node.className).includes('MuiDialog-container') ? '.MuiDialog-container' : ''}"${label}"`
+      }
+      const log: string[] = []
+      const started = performance.now()
+      const record = (text: string) => log.push(`${(performance.now() - started).toFixed(0)}ms ${text}`)
+      Object.assign(window, { __focusLog: log, __name: name, __record: record })
+      for (const type of ['focusin', 'focusout'] as const) document.addEventListener(type, event => {
+        record(`${type} target=${name(event.target)} related=${name((event as FocusEvent).relatedTarget)} hasFocus=${document.hasFocus()}`)
+        const target = event.target as HTMLElement
+        if (type !== 'focusout' || (event as FocusEvent).relatedTarget) return
+        // A focused element lost focus to nothing: capture why it could no longer hold focus.
+        const chain: string[] = []
+        for (let node: HTMLElement | null = target; node; node = node.parentElement) {
+          const style = getComputedStyle(node)
+          const flags = [node.getAttribute('aria-hidden') === 'true' && 'aria-hidden', node.hasAttribute('inert') && 'inert', style.visibility !== 'visible' && `visibility:${style.visibility}`,
+            style.display === 'none' && 'display:none', Number(style.opacity) < 1 && `opacity:${style.opacity}`].filter(Boolean)
+          if (flags.length) chain.push(`${name(node).slice(0, 40)}{${flags.join(',')}}`)
+        }
+        record(`  BLUR-TO-NOTHING connected=${target.isConnected} disabled=${(target as HTMLButtonElement).disabled} ancestors=[${chain.join(' > ')}] stack=${(new Error().stack ?? '').split('\n').slice(1, 6).map(line => line.trim().slice(0, 70)).join(' <- ')}`)
+      }, true)
+      for (const type of ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'transitionend'] as const) document.addEventListener(type, event =>
+        record(`${type}${event instanceof KeyboardEvent ? `(${event.key})` : ''} target=${name(event.target)} active=${name(document.activeElement)}`), true)
+    })
+    const mark = (label: string) => page.evaluate(label => {
+      const w = window as unknown as { __record: (text: string) => void; __name: (node: EventTarget | null) => string }
+      w.__record(`MARK ${label}: active=${w.__name(document.activeElement)} hasFocus=${document.hasFocus()} dialogs=${document.querySelectorAll('[role=dialog]').length}`)
+    }, label)
+    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
+    await withShare(page)
+    const api = await mockApi(page)
+    // Candidate test correction: an expiry relative to the real clock, so no expiry re-check runs during the test.
+    if (process.env.DIAG_EXPIRY === 'future' || process.env.DIAG_ALIGN) api.expiresAt = new Date(Date.now() + 45 * 60_000).toISOString()
+    const dialog = await openIssuer(page)
+    expect(page.url()).toMatch(/\/members$/)
+    await expect(dialog.getByText('Keine aktive Einladung')).toBeVisible()
+    const create = dialog.getByRole('button', { name: 'Einladung erstellen' })
+    await touchTargets([create, dialog.getByRole('button', { name: 'Schließen' }).last()])
+    await fitsWidth(page, dialog)
+    await shot(page, info, `claim-01a-no-invitation-${width}`)
+
+    // A rapid double activation still issues exactly one POST.
+    await create.evaluate((button: HTMLElement) => { button.click(); button.click() })
+    await expect(dialog.getByText('Neue Einladung erstellt')).toBeVisible()
+    expect(api.creates).toBe(1)
+    const expected = new URL(`/claim/${code}`, baseURL).href
+    await expect(dialog.getByRole('textbox', { name: 'Einladungslink' })).toHaveValue(expected)
+    expect(await dialog.getByRole('textbox', { name: 'Einladungslink' }).evaluate(input => getComputedStyle(input).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
+    await expect(dialog.getByText(/^Gültig bis \d\d\.\d\d\., \d\d:\d\d Uhr$/)).toBeVisible()
+    const share = dialog.getByRole('button', { name: 'Teilen' })
+    const copy = dialog.getByRole('button', { name: 'Link kopieren' })
+    const toggle = dialog.getByRole('button', { name: 'QR-Code anzeigen' })
+    await touchTargets([share, copy, toggle])
+    await fitsWidth(page, dialog)
+    await shot(page, info, `claim-02a-link-created-${width}`)
+
+    await toggle.click()
+    const qr = dialog.getByRole('img', { name: 'QR-Code mit dem Einladungslink' })
+    await expect(qr).toBeVisible()
+    const box = (await qr.boundingBox())!
+    expect(Math.abs(box.width - box.height)).toBeLessThan(1)
+    expect(box.width).toBeGreaterThanOrEqual(200)
+    expect(await decodeQr(page)).toBe(expected)
+    await share.click()
+    expect(await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([{ title: 'Profilübernahme', url: expected }])
+    await qr.scrollIntoViewIfNeeded()
+    await fitsWidth(page, dialog)
+    await shot(page, info, `claim-02b-qr-open-${width}`)
+
+    // Close, reopen: only the status remains; the code is gone for good.
+    await dialog.getByRole('button', { name: 'Schließen' }).last().click()
+    await expect(dialog).toHaveCount(0)
+    await expect(page.getByRole('button', { name: `Aktionen für ${profileName}` })).toBeFocused()
+    // Controlled timing: the reopened dialog learns an expiry a few seconds ahead, so its first expiry re-check
+    // fires at a known instant; Escape is then pressed DIAG_ALIGN ms before that instant.
+    if (process.env.DIAG_ALIGN) api.expiresAt = new Date(Date.now() + 9000).toISOString()
+    await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
+    await page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }).click()
+    await expect(dialog.getByText('Aktive Einladung')).toBeVisible()
+    await expect(dialog.getByText('Der bestehende Link kann nicht erneut angezeigt werden.')).toBeVisible()
+    expect(await page.content()).not.toContain(code)
+    await touchTargets([dialog.getByRole('button', { name: 'Neue Einladung erstellen' }), dialog.getByRole('button', { name: 'Einladung widerrufen' })])
+    await fitsWidth(page, dialog)
+    await shot(page, info, `claim-01b-active-${width}`)
+
+    await page.evaluate(() => { (window as unknown as { __focusLog: string[] }).__focusLog.length = 0 })
+    const variant = process.env.DIAG_VARIANT ?? 'natural'
+    await mark('before click')
+    const trigger = dialog.getByRole('button', { name: 'Neue Einladung erstellen' })
+    if (variant === 'unfocused-open') {
+      // Controlled intervention: activate the trigger without it holding focus (what a click does where
+      // buttons are not mouse-focusable): focus sits on the parent dialog container when the nested trap opens.
+      await trigger.evaluate((button: HTMLElement) => { (button.closest('[role=dialog]') as HTMLElement).focus(); button.click() })
+    } else await trigger.click()
+    const replace = page.getByRole('dialog', { name: 'Einladung ersetzen?' })
+    await expect(replace.getByText(profileName)).toBeVisible()
+    await mark('nested visible')
+    await fitsWidth(page, replace)
+    await shot(page, info, `claim-03a-replace-${width}`)
+    await mark('after shot, before Escape')
+    if (process.env.DIAG_ALIGN) await page.waitForFunction(([at, lead]) => Date.now() >= at - lead, [Date.parse(api.expiresAt), Number(process.env.DIAG_ALIGN)])
+    await page.keyboard.press('Escape')
+    await mark('after Escape')
+    await expect(replace).toHaveCount(0)
+    await mark('nested gone')
+    const focused = await trigger.evaluate(button => button === document.activeElement)
+    await page.waitForTimeout(400)
+    await mark('400ms later')
+    const log = await page.evaluate(() => (window as unknown as { __focusLog: string[] }).__focusLog)
+    appendFileSync(process.env.DIAG_OUT ?? '/dev/null', `## ${variant} ${browserName} ${width}px focusedAtCheck=${focused}\n${log.join('\n')}\n`)
+    if (variant === 'natural') { await expect(replace).toHaveCount(0); await expect(trigger).toBeFocused() }
+    if (process.env.DIAG_SHORT) return
+
+    await dialog.getByRole('button', { name: 'Einladung widerrufen' }).click()
+    const revoke = page.getByRole('dialog', { name: 'Einladung widerrufen?' })
+    await expect(revoke.getByText('Das Schnellprofil, seine Decks und seine Spiele bleiben unverändert.')).toBeVisible()
+    await fitsWidth(page, revoke)
+    await shot(page, info, `claim-03b-revoke-${width}`)
+    await revoke.getByRole('button', { name: 'Einladung widerrufen' }).click()
+    await expect(dialog.getByText('Keine aktive Einladung')).toBeVisible()
+    expect(api.creates).toBe(1)
+    expect(api.revokes).toBe(1)
+    expect(api.tokenUrls).toEqual([])
+  })
+}
```

## #315 — `frontend/e2e/diag-315b.pw.ts`

Observes a focused button while the dialog performs expiry re-checks.

```diff
diff --git a/frontend/e2e/diag-315b.pw.ts b/frontend/e2e/diag-315b.pw.ts
new file mode 100644
index 0000000..a0f66fb
--- /dev/null
+++ b/frontend/e2e/diag-315b.pw.ts
@@ -0,0 +1,159 @@
+import { appendFileSync } from 'node:fs'
+import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
+import jsQRModule from 'jsqr'
+
+// jsqr is CommonJS; its typings describe only the default export it also provides at runtime.
+const jsQR = (jsQRModule as unknown as { default: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).default
+
+// #247 quick-profile claim invitations with synthetic, non-sensitive API responses.
+const id = (value: number) => `dddddddd-dddd-4ddd-8ddd-${String(value).padStart(12, '0')}`
+const groupId = id(100)
+const profileId = id(5)
+const base = `/api/groups/${groupId}`
+const invitationPath = `${base}/quick-profiles/${profileId}/invitation`
+const code = 'Qr5tUvWxYz0123456789_-'
+const groupName = 'Friday Commander'
+const profileName = 'Hairy Zombie'
+const owner = { id: id(1), username: 'Gandalf' }
+const guest = { id: id(2), username: 'Frodo' }
+type Options = {
+  user?: typeof owner | null; role?: 'OWNER' | 'ADMIN' | 'MEMBER'; active?: boolean
+  create?: number | 'abort'; preview?: number; accept?: number | 'abort'; retryAfter?: string
+}
+
+async function mockApi(page: Page, options: Options = {}) {
+  const state = {
+    user: options.user === undefined ? owner : options.user, active: options.active ?? false, expiresAt: '2026-11-13T18:45:00Z',
+    previewStatus: options.preview ?? 200, creates: 0, revokes: 0, accepts: 0, previews: [] as Record<string, string>[], tokenUrls: [] as string[],
+    acceptedFor: [] as (string | undefined)[],
+  }
+  // Any request carrying the token is recorded to prove it never leaves the application's own API.
+  // Context-wide, so several tabs share one simulated server session (cross-tab scenarios).
+  page.context().on('request', request => { if (request.url().includes(code) && !new URL(request.url()).pathname.startsWith('/claim/')) state.tokenUrls.push(request.url()) })
+  await page.context().route('**/api/**', async route => {
+    const request = route.request()
+    const path = new URL(request.url()).pathname
+    const method = request.method()
+    const status = (value: number | 'abort' | undefined, fallback: number) => value ?? fallback
+    if (path === '/api/me') await route.fulfill(state.user ? { json: state.user } : { status: 401, json: {} })
+    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
+    else if (path === '/api/session' && method === 'POST') { state.user = guest; await route.fulfill({ json: guest }) }
+    else if (path === '/api/session' && method === 'DELETE') { state.user = null; await route.fulfill({ status: 204 }) }
+    else if (path === '/api/users' && method === 'POST') await route.fulfill({ status: 201, json: guest })
+    else if (path === invitationPath && method === 'GET') await route.fulfill({ json: { active: state.active, expiresAt: state.active ? state.expiresAt : null } })
+    else if (path === invitationPath && method === 'POST') {
+      state.creates++
+      await new Promise(resolve => setTimeout(resolve, 150))
+      const result = status(options.create, 201)
+      if (result === 'abort') { state.active = true; await route.abort('connectionreset') }
+      else if (result === 201) { state.active = true; await route.fulfill({ status: 201, json: { code, expiresAt: state.expiresAt } }) }
+      else await route.fulfill({ status: result, json: {} })
+    } else if (path === invitationPath && method === 'DELETE') { state.revokes++; state.active = false; await route.fulfill({ status: 204 }) }
+    else if (path === `/api/profile-invitations/${code}`) {
+      state.previews.push(await request.allHeaders())
+      const result = state.previewStatus
+      await route.fulfill(result === 200 ? { json: { groupName, profileName }, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
+        : { status: result, json: {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
+    } else if (path === `/api/profile-invitations/${code}/accept`) {
+      state.accepts++
+      const expected = (request.postDataJSON() as { expectedAccountId?: string } | null)?.expectedAccountId
+      state.acceptedFor.push(expected)
+      await new Promise(resolve => setTimeout(resolve, 150))
+      // Like the backend (#247): only the confirmed account may claim.
+      if (!state.user) { await route.fulfill({ status: 401, json: {} }); return }
+      if (expected !== state.user.id) { await route.fulfill({ status: 409, json: { status: 409, code: 'PROFILE_CLAIM_ACCOUNT_MISMATCH' } }); return }
+      const result = state.accepts === 1 ? status(options.accept, 204) : 204
+      if (result === 'abort') await route.abort('connectionreset')
+      else await route.fulfill(result === 204 ? { status: 204 }
+        : { status: result, json: result === 409 ? { status: 409, code: 'PROFILE_CLAIM_SAME_GAME' } : {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
+    } else if (path === base) await route.fulfill({ json: { id: groupId, name: groupName, role: options.role ?? 'OWNER', members: [
+      { userId: owner.id, username: owner.username, role: 'OWNER' },
+      { userId: id(3), username: 'Aragorn', role: 'MEMBER' },
+      { userId: profileId, username: profileName, role: 'MEMBER', quickProfile: true },
+    ] } })
+    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
+    else if (path === '/api/groups') await route.fulfill({ json: state.accepts ? [{ id: groupId, name: groupName, role: 'MEMBER' }] : [] })
+    else await route.fulfill({ json: [] })
+  })
+  return state
+}
+
+async function shot(page: Page, info: TestInfo, name: string) {
+  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
+  const fullPage = await page.getByRole('dialog').count() === 0
+  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
+  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}-${info.project.name}.png`, fullPage })
+}
+const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
+const withShare = (page: Page) => page.addInitScript(() => {
+  const shared: unknown[] = []
+  Object.defineProperty(window, '__shared', { value: shared })
+  Object.defineProperty(Navigator.prototype, 'share', { value: (data: unknown) => { shared.push(data); return Promise.resolve() }, configurable: true })
+  Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true })
+})
+async function touchTargets(controls: Locator[]) {
+  for (const control of controls) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
+}
+/** The dialog stays inside the viewport and no content overflows it; text inputs scroll their own value by design. */
+async function fitsWidth(page: Page, dialog: Locator) {
+  const box = (await dialog.boundingBox())!
+  const width = page.viewportSize()!.width
+  expect(box.x).toBeGreaterThanOrEqual(0)
+  expect(box.x + box.width).toBeLessThanOrEqual(width)
+  expect(await dialog.evaluate(element => [...element.querySelectorAll(':not(input)')].filter(child => !(child.scrollWidth <= child.clientWidth + 1 || getComputedStyle(child).overflowX !== 'visible')).map(child => `${child.tagName}.${child.className} ${child.scrollWidth}/${child.clientWidth}`))).toEqual([])
+  expect(await noHorizontalOverflow(page)).toBe(true)
+}
+
+/** Rasterize the rendered QR SVG in the page and decode its pixels like a camera would. */
+async function decodeQr(page: Page) {
+  const image = await page.getByRole('img', { name: 'QR-Code mit dem Einladungslink' }).evaluate(async svg => {
+    const markup = new XMLSerializer().serializeToString(svg)
+    const source = new Image()
+    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
+    await source.decode()
+    const canvas = document.createElement('canvas')
+    canvas.width = canvas.height = 400
+    const context = canvas.getContext('2d')!
+    context.drawImage(source, 0, 0, 400, 400)
+    return Array.from(context.getImageData(0, 0, 400, 400).data)
+  })
+  return jsQR(Uint8ClampedArray.from(image), 400, 400)?.data
+}
+
+async function openIssuer(page: Page) {
+  await page.goto(`/playgroups/${groupId}/members`)
+  await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
+  await page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }).click()
+  return page.getByRole('dialog', { name: 'Profilübernahme einladen' })
+}
+
+// ---------------------------------------------------------------- wireframes 01–03: issuer
+
+
+// DIAGNOSTIC ONLY (#315) — never committed. Does a background expiry re-check take focus from a focused button?
+for (const expiry of ['past', 'future']) test(`diag315b focused button during expiry re-checks (${expiry} expiry)`, async ({ page, browserName }) => {
+  await page.setViewportSize({ width: 1280, height: 844 })
+  const api = await mockApi(page, { active: true })
+  if (expiry === 'future') api.expiresAt = new Date(Date.now() + 45 * 60_000).toISOString()
+  const statusReads: number[] = []
+  const started = Date.now()
+  page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname === invitationPath) statusReads.push(Date.now() - started) })
+  const dialog = await openIssuer(page)
+  const button = dialog.getByRole('button', { name: 'Neue Einladung erstellen' })
+  await expect(button).toBeVisible()
+  await page.evaluate(() => {
+    const log: string[] = [], t0 = performance.now()
+    Object.assign(window, { __log: log })
+    const target = [...document.querySelectorAll('button')].find(node => node.textContent === 'Neue Einladung erstellen')!
+    new MutationObserver(() => log.push(`${(performance.now() - t0).toFixed(0)}ms disabled=${target.disabled} active=${document.activeElement === target ? 'button' : document.activeElement?.className.toString().includes('MuiDialog-container') ? 'dialog container' : document.activeElement?.tagName}`))
+      .observe(target, { attributes: true, attributeFilter: ['disabled'] })
+    document.addEventListener('focusout', event => { if (event.target === target) log.push(`${(performance.now() - t0).toFixed(0)}ms focusout from button, disabled=${target.disabled}`) }, true)
+    target.focus()
+  })
+  await expect(button).toBeFocused()
+  await page.waitForTimeout(4500) // observation window covering the 1 s / 2 s backoff re-checks; diagnostic only
+  const stillFocused = await button.evaluate(node => node === document.activeElement)
+  const active = await page.evaluate(() => `${document.activeElement?.tagName}.${String(document.activeElement?.className).split(' ').filter(name => name.startsWith('MuiDialog')).join('.')}`)
+  const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log)
+  appendFileSync(process.env.DIAG_OUT ?? '/dev/null', `## ${browserName} expiry=${expiry} stillFocused=${stillFocused} active=${active} statusReads@ms=${JSON.stringify(statusReads)}\n  ${log.slice(0, 8).join('\n  ')}\n`)
+})
```

## #320 — `frontend/e2e/diag-320.pw.ts`

`DIAG_VARIANT`: `natural`, `measure`, `induce` (submit when the form first
appears), `induce-after-B`, `induce-steal` (a user who types immediately),
`corrected` (candidate test correction). `DIAG_THROTTLE=<rate>` applies
Chromium CPU throttling to the second tab.

```diff
diff --git a/frontend/e2e/diag-320.pw.ts b/frontend/e2e/diag-320.pw.ts
new file mode 100644
index 0000000..d0b3fa5
--- /dev/null
+++ b/frontend/e2e/diag-320.pw.ts
@@ -0,0 +1,234 @@
+import { appendFileSync } from 'node:fs'
+import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
+import jsQRModule from 'jsqr'
+
+// jsqr is CommonJS; its typings describe only the default export it also provides at runtime.
+const jsQR = (jsQRModule as unknown as { default: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).default
+
+// #247 quick-profile claim invitations with synthetic, non-sensitive API responses.
+const id = (value: number) => `dddddddd-dddd-4ddd-8ddd-${String(value).padStart(12, '0')}`
+const groupId = id(100)
+const profileId = id(5)
+const base = `/api/groups/${groupId}`
+const invitationPath = `${base}/quick-profiles/${profileId}/invitation`
+const code = 'Qr5tUvWxYz0123456789_-'
+const groupName = 'Friday Commander'
+const profileName = 'Hairy Zombie'
+const owner = { id: id(1), username: 'Gandalf' }
+const guest = { id: id(2), username: 'Frodo' }
+type Options = {
+  user?: typeof owner | null; role?: 'OWNER' | 'ADMIN' | 'MEMBER'; active?: boolean
+  create?: number | 'abort'; preview?: number; accept?: number | 'abort'; retryAfter?: string
+}
+
+async function mockApi(page: Page, options: Options = {}) {
+  const state = {
+    user: options.user === undefined ? owner : options.user, active: options.active ?? false, expiresAt: '2026-11-13T18:45:00Z',
+    previewStatus: options.preview ?? 200, creates: 0, revokes: 0, accepts: 0, previews: [] as Record<string, string>[], tokenUrls: [] as string[],
+    acceptedFor: [] as (string | undefined)[],
+  }
+  // Any request carrying the token is recorded to prove it never leaves the application's own API.
+  // Context-wide, so several tabs share one simulated server session (cross-tab scenarios).
+  page.context().on('request', request => { if (request.url().includes(code) && !new URL(request.url()).pathname.startsWith('/claim/')) state.tokenUrls.push(request.url()) })
+  await page.context().route('**/api/**', async route => {
+    const request = route.request()
+    const path = new URL(request.url()).pathname
+    const method = request.method()
+    const status = (value: number | 'abort' | undefined, fallback: number) => value ?? fallback
+    if (path === '/api/me') await route.fulfill(state.user ? { json: state.user } : { status: 401, json: {} })
+    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
+    else if (path === '/api/session' && method === 'POST') { state.user = guest; await route.fulfill({ json: guest }) }
+    else if (path === '/api/session' && method === 'DELETE') { state.user = null; await route.fulfill({ status: 204 }) }
+    else if (path === '/api/users' && method === 'POST') await route.fulfill({ status: 201, json: guest })
+    else if (path === invitationPath && method === 'GET') await route.fulfill({ json: { active: state.active, expiresAt: state.active ? state.expiresAt : null } })
+    else if (path === invitationPath && method === 'POST') {
+      state.creates++
+      await new Promise(resolve => setTimeout(resolve, 150))
+      const result = status(options.create, 201)
+      if (result === 'abort') { state.active = true; await route.abort('connectionreset') }
+      else if (result === 201) { state.active = true; await route.fulfill({ status: 201, json: { code, expiresAt: state.expiresAt } }) }
+      else await route.fulfill({ status: result, json: {} })
+    } else if (path === invitationPath && method === 'DELETE') { state.revokes++; state.active = false; await route.fulfill({ status: 204 }) }
+    else if (path === `/api/profile-invitations/${code}`) {
+      state.previews.push(await request.allHeaders())
+      const result = state.previewStatus
+      await route.fulfill(result === 200 ? { json: { groupName, profileName }, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
+        : { status: result, json: {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
+    } else if (path === `/api/profile-invitations/${code}/accept`) {
+      state.accepts++
+      const expected = (request.postDataJSON() as { expectedAccountId?: string } | null)?.expectedAccountId
+      state.acceptedFor.push(expected)
+      await new Promise(resolve => setTimeout(resolve, 150))
+      // Like the backend (#247): only the confirmed account may claim.
+      if (!state.user) { await route.fulfill({ status: 401, json: {} }); return }
+      if (expected !== state.user.id) { await route.fulfill({ status: 409, json: { status: 409, code: 'PROFILE_CLAIM_ACCOUNT_MISMATCH' } }); return }
+      const result = state.accepts === 1 ? status(options.accept, 204) : 204
+      if (result === 'abort') await route.abort('connectionreset')
+      else await route.fulfill(result === 204 ? { status: 204 }
+        : { status: result, json: result === 409 ? { status: 409, code: 'PROFILE_CLAIM_SAME_GAME' } : {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
+    } else if (path === base) await route.fulfill({ json: { id: groupId, name: groupName, role: options.role ?? 'OWNER', members: [
+      { userId: owner.id, username: owner.username, role: 'OWNER' },
+      { userId: id(3), username: 'Aragorn', role: 'MEMBER' },
+      { userId: profileId, username: profileName, role: 'MEMBER', quickProfile: true },
+    ] } })
+    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
+    else if (path === '/api/groups') await route.fulfill({ json: state.accepts ? [{ id: groupId, name: groupName, role: 'MEMBER' }] : [] })
+    else await route.fulfill({ json: [] })
+  })
+  return state
+}
+
+async function shot(page: Page, info: TestInfo, name: string) {
+  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
+  const fullPage = await page.getByRole('dialog').count() === 0
+  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
+  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}-${info.project.name}.png`, fullPage })
+}
+const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
+const withShare = (page: Page) => page.addInitScript(() => {
+  const shared: unknown[] = []
+  Object.defineProperty(window, '__shared', { value: shared })
+  Object.defineProperty(Navigator.prototype, 'share', { value: (data: unknown) => { shared.push(data); return Promise.resolve() }, configurable: true })
+  Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true })
+})
+async function touchTargets(controls: Locator[]) {
+  for (const control of controls) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
+}
+/** The dialog stays inside the viewport and no content overflows it; text inputs scroll their own value by design. */
+async function fitsWidth(page: Page, dialog: Locator) {
+  const box = (await dialog.boundingBox())!
+  const width = page.viewportSize()!.width
+  expect(box.x).toBeGreaterThanOrEqual(0)
+  expect(box.x + box.width).toBeLessThanOrEqual(width)
+  expect(await dialog.evaluate(element => [...element.querySelectorAll(':not(input)')].filter(child => !(child.scrollWidth <= child.clientWidth + 1 || getComputedStyle(child).overflowX !== 'visible')).map(child => `${child.tagName}.${child.className} ${child.scrollWidth}/${child.clientWidth}`))).toEqual([])
+  expect(await noHorizontalOverflow(page)).toBe(true)
+}
+
+/** Rasterize the rendered QR SVG in the page and decode its pixels like a camera would. */
+async function decodeQr(page: Page) {
+  const image = await page.getByRole('img', { name: 'QR-Code mit dem Einladungslink' }).evaluate(async svg => {
+    const markup = new XMLSerializer().serializeToString(svg)
+    const source = new Image()
+    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
+    await source.decode()
+    const canvas = document.createElement('canvas')
+    canvas.width = canvas.height = 400
+    const context = canvas.getContext('2d')!
+    context.drawImage(source, 0, 0, 400, 400)
+    return Array.from(context.getImageData(0, 0, 400, 400).data)
+  })
+  return jsQR(Uint8ClampedArray.from(image), 400, 400)?.data
+}
+
+async function openIssuer(page: Page) {
+  await page.goto(`/playgroups/${groupId}/members`)
+  await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
+  await page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }).click()
+  return page.getByRole('dialog', { name: 'Profilübernahme einladen' })
+}
+
+// ---------------------------------------------------------------- wireframes 01–03: issuer
+
+
+// DIAGNOSTIC ONLY (#320) — never committed.
+const VARIANT = process.env.DIAG_VARIANT ?? 'natural'
+test(`diag320 cross-tab sign-in (${VARIANT})`, async ({ page, browserName }) => {
+  await page.setViewportSize({ width: 390, height: 844 })
+  const api = await mockApi(page)
+  await page.goto(`/claim/${code}`)
+  await page.getByRole('button', { name: 'Profil übernehmen' }).click()
+  const confirm = page.getByRole('dialog', { name: 'Schnellprofil übernehmen?' })
+  await expect(confirm.getByText(owner.username, { exact: true })).toBeVisible()
+
+  const other = await page.context().newPage()
+  const requests: string[] = []
+  other.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) requests.push(`${request.method()} ${url.pathname}`) })
+  // In-page timeline: A = the sign-in form first appears; B = the claim auth detour focuses the email field
+  // (App's effect that only runs once React has committed the /claim location with its login intent).
+  await other.addInitScript(variant => {
+    const log: string[] = []
+    const started = performance.now()
+    const record = (text: string) => log.push(`${(performance.now() - started).toFixed(1)}ms ${text} url=${location.pathname}`)
+    Object.assign(window, { __log: log })
+    let seen = false
+    let node: HTMLElement | null = null
+    // Who focuses the email field, and which history entries does the router write?
+    const nativeFocus = HTMLElement.prototype.focus
+    HTMLElement.prototype.focus = function (...args) {
+      if (this.id === 'auth-login-email') record(`focus() on email by script: ${(new Error().stack ?? '').split('\n').slice(2, 7).map(line => line.trim().replace(/\?[tv]=[^:)]*/g, '').replace(/https?:\/\/[^/]+\//, '').slice(0, 60)).join(' <- ')}`)
+      return nativeFocus.apply(this, args)
+    }
+    for (const method of ['pushState', 'replaceState'] as const) {
+      const native = history[method]
+      history[method] = function (state, unused, url) { record(`history.${method}(${String(url)}) stateKey=${(state as { key?: string } | null)?.key} usr=${JSON.stringify((state as { usr?: unknown } | null)?.usr)}`); return native.call(this, state, unused, url) }
+    }
+    const describe = (target: EventTarget | null) => target instanceof HTMLElement ? `${target.tagName.toLowerCase()}#${target.id || target.textContent?.slice(0, 12)}` : String(target)
+    for (const type of ['input', 'click', 'submit', 'invalid', 'reset', 'mousedown'] as const) document.addEventListener(type, event =>
+      record(`${type} ${describe(event.target)}${type === 'input' ? ` valueLength=${(event.target as HTMLInputElement).value.length}` : ''}${type === 'click' || type === 'mousedown' ? ` disabled=${(event.target as HTMLButtonElement).disabled} hit=${describe(document.elementFromPoint((event as MouseEvent).clientX, (event as MouseEvent).clientY))}` : ''}`), true)
+    const submit = () => {
+      const email = document.getElementById('auth-login-email') as HTMLInputElement
+      const form = email.form!
+      const set = (input: HTMLInputElement, value: string) => {
+        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
+        input.dispatchEvent(new Event('input', { bubbles: true }))
+      }
+      set(email, 'frodo@example.test')
+      set(form.querySelector('input[type=password]') as HTMLInputElement, 'correct horse battery')
+      record('in-page submit')
+      form.requestSubmit()
+    }
+    new MutationObserver(() => {
+      const email = document.getElementById('auth-login-email')
+      if (email && node && email !== node) record('sign-in form REMOUNTED (new email input element)')
+      node = email ?? node
+      const button = [...document.querySelectorAll('button')].find(candidate => /^Sign(ing)? in/.test(candidate.textContent ?? ''))
+      const state = `${button?.textContent}/disabled=${button?.disabled}`
+      if (state !== (window as unknown as { __button?: string }).__button) { (window as unknown as { __button?: string }).__button = state; record(`sign-in button: ${state}`) }
+      if (!email) { seen = false; return }
+      if (seen) return
+      seen = true
+      record('A: sign-in form appeared')
+      if (variant === 'induce') submit()
+      if (variant === 'induce-steal') {
+        // Controlled ordering: a user who starts typing as soon as the form is visible. The email is entered and
+        // the password field focused immediately; the password is typed 400 ms later into whichever element holds
+        // focus at that moment (what keyboard input or CDP insertText does), then the form is submitted by click.
+        const password = document.getElementById('auth-login-password') as HTMLInputElement
+        email.focus(); document.execCommand('insertText', false, 'frodo@example.test')
+        password.focus()
+        record('user focused the password field')
+        setTimeout(() => {
+          record(`typing the password; focused element is #${document.activeElement?.id}`)
+          document.execCommand('insertText', false, 'correct horse battery')
+          ;[...document.querySelectorAll('button')].find(candidate => candidate.textContent === 'Sign in')!.click()
+        }, 400)
+      }
+    }).observe(document, { childList: true, subtree: true })
+    document.addEventListener('focusin', event => {
+      if ((event.target as Element).id !== 'auth-login-email') return
+      record('B: email field focused by the claim auth detour')
+      if (variant === 'induce-after-B') submit()
+    })
+  }, VARIANT)
+  if (process.env.DIAG_THROTTLE && browserName === 'chromium') {
+    const session = await other.context().newCDPSession(other)
+    await session.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.DIAG_THROTTLE) })
+  }
+  await other.goto(`/claim/${code}`)
+  await other.getByRole('button', { name: 'Anderes Konto verwenden' }).click()
+  const login = other.locator('section', { has: other.getByRole('heading', { name: 'Sign in' }) })
+  const actions = Date.now()
+  if (VARIANT === 'natural' || VARIANT === 'corrected') {
+    if (VARIANT === 'corrected') await expect(login.getByLabel('Email')).toBeFocused()
+    await login.getByLabel('Email').fill('frodo@example.test')
+    await login.getByLabel('Password').fill('correct horse battery')
+    await login.getByRole('button', { name: 'Sign in' }).click()
+  }
+  const actionMs = Date.now() - actions
+  const visible = await other.getByText(guest.username, { exact: true }).waitFor({ state: 'visible', timeout: VARIANT === 'measure' ? 1500 : 5000 }).then(() => true, () => false)
+  const form = await other.evaluate(() => { const email = document.getElementById('auth-login-email') as HTMLInputElement | null; return email ? `emailLength=${email.value.length} passwordLength=${(document.getElementById('auth-login-password') as HTMLInputElement).value.length} valid=${email.form!.checkValidity()} status=${document.querySelector('[role=status]')?.textContent}` : 'no form' })
+  const log = await other.evaluate(() => (window as unknown as { __log: string[] }).__log)
+  const headings = await other.getByRole('heading').allTextContents()
+  appendFileSync(process.env.DIAG_OUT ?? '/dev/null', `## ${VARIANT} ${browserName} throttle=${process.env.DIAG_THROTTLE ?? 1} frodoVisible=${visible} finalUrl=${new URL(other.url()).pathname} actionMs=${actionMs} accepts=${api.accepts} form[${form}]\n  headings=${JSON.stringify(headings)}\n  ${log.join('\n  ')}\n  requests=${requests.join(', ')}\n`)
+  if (VARIANT !== 'measure') expect(visible, `other tab ended on ${other.url()}`).toBe(true)
+})
```
