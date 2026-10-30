// Opt-in only: never part of the regular test/CI suite. Run from frontend.
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium, webkit } = require('@playwright/test')
const [mode = 'optimized', secondsArg = '10', engine = 'chromium', output = '/tmp/firelight.json'] = process.argv.slice(2)
const seconds = Number(secondsArg)
if (!['off', 'baseline', 'optimized', 'static'].includes(mode) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw Error('mode off|baseline|optimized|static, seconds >0 and <=300')
if (!['chromium', 'webkit'].includes(engine)) throw Error('engine chromium|webkit')
const browser = await ({ chromium, webkit }[engine]).launch(engine === 'chromium' ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  const errors = [], navigations = [], sockets = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('crash', () => errors.push('page crash'))
  page.on('framenavigated', f => { if (f === page.mainFrame()) navigations.push(f.url()) })
  page.on('websocket', ws => ws.on('framereceived', e => { if (/full-reload|error|update/.test(String(e.payload))) sockets.push(String(e.payload).slice(0, 500)) }))
  const refresh = await page.evaluate(() => new Promise(resolve => { const intervals = []; let last; const tick = now => { if (last !== undefined) intervals.push(now - last); last = now; if (intervals.length < 60) requestAnimationFrame(tick); else resolve(intervals) }; requestAnimationFrame(tick) }))
  await page.goto(`http://127.0.0.1:5173/dev/lounge.html?firelight=${mode === 'off' ? 'optimized' : mode}`)
  await page.getByRole('switch', { name: 'Glühwürmchen' }).uncheck()
  if (mode === 'off') await page.getByRole('switch', { name: 'Kaminlicht', exact: true }).uncheck()
  await page.waitForTimeout(1000)
  const cdp = engine === 'chromium' ? await page.context().newCDPSession(page) : null
  if (cdp) await cdp.send('Performance.enable')
  const before = cdp ? await cdp.send('Performance.getMetrics') : null
  await page.evaluate(async duration => {
    window.fireBenchmark = { frames: [], active: false, finished: false, drags: 0, start: performance.now() }
    const b = window.fireBenchmark
    let raf = 0, last, pressed = false
    document.addEventListener('pointerdown', () => { pressed = true })
    const tick = now => { if (last !== undefined && b.frames.length < 60000) b.frames.push(now - last); last = now; raf = requestAnimationFrame(tick) }
    document.addEventListener('pointermove', () => { if (pressed && !b.active && !b.finished && document.querySelector('.drag-overlay')) { b.active = true; last = undefined; raf = requestAnimationFrame(tick); b.drags++ } })
    const stop = () => { pressed = false; b.active = false; last = undefined; cancelAnimationFrame(raf) }
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
    setTimeout(() => { stop(); b.finished = true; b.elapsedMs = performance.now() - b.start }, duration)
  }, seconds * 1000)
  const deadline = Date.now() + seconds * 1000
  let reverse = false
  while (Date.now() < deadline) {
    const grips = page.locator('.table-cards .grip')
    const source = await grips.nth(reverse ? 3 : 0).boundingBox()
    const target = await page.locator('.table-cards > li').nth(reverse ? 0 : 3).boundingBox()
    if (!source || !target) throw Error('Missing drag geometry')
    const x = source.x + 20, y = source.y + 20
    await page.mouse.move(x, y); await page.mouse.down()
    for (let step = 1; step <= 15 && Date.now() < deadline; step++) {
      await page.mouse.move(x, y + ((reverse ? target.y + 10 : target.y + target.height - 10) - y) * step / 15)
      await page.waitForTimeout(Math.min(16, Math.max(0, deadline - Date.now())))
    }
    await page.mouse.up()
    if (Date.now() < deadline) await page.waitForTimeout(Math.min(300, deadline - Date.now()))
    reverse = !reverse
  }
  await page.waitForFunction(() => window.fireBenchmark.finished)
  const raw = await page.evaluate(() => window.fireBenchmark)
  const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null
  const refreshMs = percentile(refresh, .5)
  const after = cdp ? await cdp.send('Performance.getMetrics') : null
  const metrics = {}
  if (before && after) for (const key of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'RecalcStyleCount', 'LayoutCount', 'JSHeapUsedSize']) {
    const a = after.metrics.find(m => m.name === key)?.value, b = before.metrics.find(m => m.name === key)?.value
    metrics[key] = key === 'JSHeapUsedSize' ? a : a - b
  }
  const result = { mode, engine, browser: browser.version(), viewport: '1280x1200', requestedSeconds: seconds, elapsedMs: raw.elapsedMs, drags: raw.drags, samples: raw.frames.length, refreshMs, p50: percentile(raw.frames, .5), p95: percentile(raw.frames, .95), p99: percentile(raw.frames, .99), overTwoRefresh: raw.frames.filter(n => n > refreshMs * 2 + .1).length, over50: raw.frames.filter(n => n > 50).length, unexpectedNavigations: navigations.slice(1), errors, hmr: sockets, metrics }
  result.stutterRate = raw.frames.length ? result.overTwoRefresh / raw.frames.length : null
  await writeFile(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
  if (errors.length || result.unexpectedNavigations.length || !raw.drags || !raw.frames.length) process.exitCode = 1
} finally { await browser.close() }
