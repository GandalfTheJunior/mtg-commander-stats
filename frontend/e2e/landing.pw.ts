import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import type { Page, TestInfo } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }
type Sample = { kind: string; time: number; overlay: Box | null; target: Box | null; settling: boolean; scroll: number; cards: Record<string, Box> }
declare global {
  interface Window { activePointerId: number; landingTrace: Sample[]; draggedName: string; sampleLanding: (kind: string) => void }
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    window.landingTrace = []; window.draggedName = 'Mira'
    const box = (node: Element | null): Box | null => {
      if (!node) return null
      const r = node.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    window.sampleLanding = kind => {
      const target = [...document.querySelectorAll('.table-cards > li')].find(n => n.querySelector('h3')?.textContent === window.draggedName)
      window.landingTrace.push({ kind, time: performance.now(), overlay: box(document.querySelector('.drag-overlay')),
        target: box(target ?? null), settling: !!document.querySelector('.settling-overlay'), scroll: scrollY,
        cards: Object.fromEntries([...document.querySelectorAll('.table-cards > li')].map(n => [n.querySelector('h3')!.textContent!, box(n)!])) })
    }
    const original = Element.prototype.animate
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains('drag-overlay')) window.sampleLanding('animation-start')
      const animation = original.call(this, frames, options)
      if (this.classList.contains('drag-overlay')) animation.addEventListener('finish', () => window.sampleLanding('animation-finish'))
      return animation
    }
    document.addEventListener('pointerdown', e => { window.activePointerId = e.pointerId }, true)
    let recording = false
    document.addEventListener('pointerup', () => {
      if (!document.querySelector('.drag-overlay') || document.querySelector('.settling-overlay')) return
      window.sampleLanding('release'); recording = true
    }, true)
    const frame = () => {
      if (recording) {
        window.sampleLanding('frame')
        if (!document.querySelector('.drag-overlay')) recording = false
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  await page.goto('/dev/lounge.html')
  await page.getByRole('switch', { name: 'Kaminlicht' }).click()
  await page.getByRole('switch', { name: 'Glühwürmchen' }).click()
}

async function begin(page: Page, name: string) {
  await page.evaluate(name => { window.draggedName = name; window.landingTrace = [] }, name)
  const grip = page.getByRole('button', { name: `${name} ziehen` })
  await grip.scrollIntoViewIfNeeded()
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + 20, g.y + 20); await page.mouse.down()
  return { grip, x: g.x + 100 }
}

async function evidence(page: Page, info: TestInfo, expected: string[]) {
  // Observe inside the browser without repeated locator/trace DOM snapshots in
  // the 260ms motion window. Those snapshots stalled cold WebKit for 202ms in CI.
  const rows = await page.evaluate(() => new Promise<Sample[]>(resolve => {
    const frame = () => {
      if (document.querySelector('.drag-overlay')) { requestAnimationFrame(frame); return }
      window.sampleLanding('handoff'); resolve(window.landingTrace)
    }
    requestAnimationFrame(frame)
  }))
  await expect(page.locator('.drag-overlay')).toHaveCount(0)
  await expect(page.locator('.insertion')).toHaveCount(0)
  await expect(page.locator('.table-cards h3')).toHaveText(expected)
  const tracePath = info.outputPath('frame-position-trace.json')
  await writeFile(tracePath, JSON.stringify(rows, null, 2))
  await info.attach('frame-position-trace', { path: tracePath, contentType: 'application/json' })
  const release = rows.find(r => r.kind === 'release')!, start = rows.find(r => r.kind === 'animation-start')!
  expect(release?.overlay).not.toBeNull(); expect(start?.overlay).not.toBeNull()
  expect(Math.hypot(start.overlay!.x - release.overlay!.x, start.overlay!.y - release.overlay!.y)).toBeLessThan(.6)
  const dragged = await page.evaluate(() => window.draggedName)
  for (const [name, before] of Object.entries(release.cards)) {
    if (name === dragged) continue
    expect(Math.hypot(start.cards[name].x - before.x, start.cards[name].y - before.y)).toBeLessThan(.6)
  }
  const frames = rows.filter(r => (r.kind === 'frame' || r.kind === 'animation-finish') && r.time >= release.time && r.overlay && r.settling)
  expect(frames.length).toBeGreaterThan(2)
  const target = rows.at(-1)!.target!
  const distance = (r: Box) => Math.hypot(r.x - target.x, r.y - target.y)
  const travel = distance(release.overlay!)
  expect(travel).toBeGreaterThan(15)
  expect(frames.some(r => distance(r.overlay!) > 2 && distance(r.overlay!) < travel - 2)).toBe(true)
  expect(distance(frames.at(-1)!.overlay!)).toBeLessThan(2)
  return rows
}

test.beforeEach(async ({ page }) => instrument(page))

test('upward edge release survives fractional bounds and glides to the first slot', async ({ page }, info) => {
  const { x } = await begin(page, 'Fenn')
  const travel = Math.max(0, 20 - (await page.locator('.table-cards').boundingBox())!.y)
  // At y=20 the edge ramp requests 480*(60/80)^2 = 270px/s. Allow
  // two travel periods plus 2s for cold WebKit rendering/poll overhead. This
  // budget is only for reaching the edge, never for relaxing landing continuity.
  const scrollTimeout = 2000 + 2 * Math.ceil(travel / 270 * 1000)
  await page.mouse.move(x, 20)
  await expect.poll(async () => (await page.locator('.table-cards').boundingBox())!.y, { timeout: scrollTimeout }).toBeGreaterThan(18)
  await expect(page.locator('.overlay-label')).toHaveText('Hier einfügen')
  await page.mouse.up()
  await evidence(page, info, ['Fenn', 'Mira', 'Orin', 'Lumi'])
})

test('downward edge release keeps one continuous overlay through commit', async ({ page }, info) => {
  const { x } = await begin(page, 'Mira')
  await page.mouse.move(x, 580)
  await expect.poll(async () => { const r = (await page.locator('.table-cards').boundingBox())!; return r.y + r.height }).toBeLessThan(582)
  await page.mouse.up()
  await evidence(page, info, ['Orin', 'Lumi', 'Fenn', 'Mira'])
})

test('terminal pointer coordinates cannot teleport the last displayed overlay', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1500 })
  const { grip, x } = await begin(page, 'Mira')
  const list = (await page.locator('.table-cards').boundingBox())!
  await page.mouse.move(x, list.y + list.height - 30)
  // Reproduce a final-coordinate change without another rendered move. Real
  // browser layout/WAAPI are untouched; only this terminal input is synthesized.
  await grip.dispatchEvent('pointerup', { pointerId: await page.evaluate(() => window.activePointerId), clientX: x + 60, clientY: list.y + list.height - 30, button: 0 })
  const rows = await evidence(page, info, ['Orin', 'Lumi', 'Fenn', 'Mira'])
  const release = rows.find(r => r.kind === 'release')!, last = rows.at(-1)!
  // Release before live preview has finished: surrounding cards must interpolate
  // across the keyed DOM reorder, not just the dragged overlay.
  const moving = Object.keys(release.cards).filter(name => name !== 'Mira' && Math.abs(release.cards[name].y - last.cards[name].y) > 5)
  expect(moving.length).toBeGreaterThan(0)
  for (const name of moving) expect(rows.some(r => r.kind === 'frame' && r.settling &&
    Math.abs(r.cards[name].y - release.cards[name].y) > 1 && Math.abs(r.cards[name].y - last.cards[name].y) > 1)).toBe(true)
  await page.mouse.up()
})

test('post-release scroll and stale capture cancellation do not reveal the card early', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1100 })
  const { grip, x } = await begin(page, 'Mira')
  const r = (await page.locator('.table-cards').boundingBox())!
  await page.mouse.move(x, Math.min(1000, r.y + r.height - 30))
  await page.mouse.up()
  await expect(page.locator('.settling-overlay')).toHaveCount(1)
  await grip.dispatchEvent('pointercancel', { pointerId: 1 })
  const beforeScroll = await page.evaluate(() => scrollY)
  await page.evaluate(() => scrollBy(0, -40))
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(beforeScroll)
  await expect(page.locator('.settling-overlay')).toHaveCount(1)
  await expect(page.locator('.drag-overlay')).toHaveCount(0)
  const rows = await page.evaluate(() => window.landingTrace)
  const tracePath = info.outputPath('retarget-position-trace.json')
  await writeFile(tracePath, JSON.stringify(rows, null, 2))
  await info.attach('retarget-position-trace', { path: tracePath, contentType: 'application/json' })
  expect(rows.filter(r => r.kind === 'animation-start').length).toBeGreaterThan(1)
  await expect(page.locator('.insertion')).toHaveCount(0)
})

test('unchanged insertion preserves confirmation; reduced motion has no landing', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Auswahl bestätigen' }).click()
  const { x } = await begin(page, 'Mira'), r = (await page.locator('.table-cards').boundingBox())!
  await page.mouse.move(x, r.y + 30)
  await page.mouse.up()
  await evidence(page, info, ['Mira', 'Orin', 'Lumi', 'Fenn'])
  await expect(page.getByRole('button', { name: 'Spiel starten' })).toBeEnabled()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.lounge')).toHaveAttribute('data-reduced', 'true')
  const next = await begin(page, 'Mira')
  await page.mouse.move(next.x, 580)
  await expect.poll(async () => { const b = (await page.locator('.table-cards').boundingBox())!; return b.y + b.height }).toBeLessThan(582)
  await page.mouse.up()
  await expect(page.locator('.drag-overlay')).toHaveCount(0)
  await expect(page.locator('.table-cards h3')).toHaveText(['Orin', 'Lumi', 'Fenn', 'Mira'])
})


test('Chromium native touch release glides after viewport edge scrolling', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'CDP continuous touch input is Chromium-only; WebKit mouse/layout cases still run.')
  const { grip } = await begin(page, 'Mira')
  await page.mouse.up() // End the mouse preparation; start a native touch gesture.
  const g = (await grip.boundingBox())!, cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x + 20, y: g.y + 20 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + 100, y: 580 }] })
  await expect.poll(async () => { const r = (await page.locator('.table-cards').boundingBox())!; return r.y + r.height }).toBeLessThan(582)
  await page.evaluate(() => { window.landingTrace = [] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await evidence(page, info, ['Orin', 'Lumi', 'Fenn', 'Mira'])
  await cdp.detach()
})

test('a second drag during landing cleans the first effects and lands without ghosts', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1500 })
  const first = await begin(page, 'Mira'), r = (await page.locator('.table-cards').boundingBox())!
  await page.mouse.move(first.x, r.y + r.height - 30)
  await page.mouse.up()
  await expect(page.locator('.settling-overlay')).toHaveCount(1)
  const next = await begin(page, 'Mira')
  await expect(page.locator('.settling-overlay')).toHaveCount(0)
  await page.mouse.move(next.x, r.y + 40)
  await page.mouse.up()
  await evidence(page, info, ['Mira', 'Orin', 'Lumi', 'Fenn'])
})

test('outside drops and Escape roll back; native keyboard retains focus at the boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 })
  await begin(page, 'Mira')
  const r = (await page.locator('.table-cards').boundingBox())!
  await page.mouse.move(2, r.y + r.height - 30)
  await expect(page.locator('.overlay-label')).toHaveText('Außerhalb · Abbrechen')
  await page.mouse.up()
  await expect(page.locator('.drag-overlay')).toHaveCount(0)
  const next = await begin(page, 'Mira')
  await page.mouse.move(next.x, r.y + r.height - 30)
  await page.keyboard.press('Escape'); await page.mouse.up()
  await expect(page.locator('.drag-overlay')).toHaveCount(0)
  await expect(page.locator('.table-cards h3')).toHaveText(['Mira', 'Orin', 'Lumi', 'Fenn'])
  const up = page.getByRole('button', { name: 'orin nach oben' })
  await up.focus(); await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'orin nach unten' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'orin nach unten' })).toBeFocused()
  await expect(page.locator('.table-cards h3')).toHaveText(['Mira', 'Orin', 'Lumi', 'Fenn'])
})

test('a stalled browser frame does not consume the visible landing', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1500 })
  const { x } = await begin(page, 'Mira'), r = (await page.locator('.table-cards').boundingBox())!
  await page.mouse.move(x, r.y + r.height - 30)
  await page.mouse.up()
  // Reproduce the observed mobile rendering gap without changing animation
  // timing in the harness. The application's clock must handle the real stall.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => {
    const end = performance.now() + 180
    while (performance.now() < end) { /* Deliberate main-thread stall. */ }
    resolve()
  })))
  await evidence(page, info, ['Orin', 'Lumi', 'Fenn', 'Mira'])
})
