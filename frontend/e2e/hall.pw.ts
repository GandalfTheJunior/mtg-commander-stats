import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/lounge.html')
  await page.getByRole('button', { name: 'Die Ruhmeshalle', exact: true }).click()
})

for (const width of [320, 375, 390, 1280]) {
  test(`landscape portraits and no overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 })
    await expect(page.getByRole('img')).toHaveCount(6)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const geometry = await page.locator('.hall-art').evaluateAll(images => images.map(image => {
      const rect = image.getBoundingClientRect(), style = getComputedStyle(image)
      return { width: rect.width, ratio: image.clientWidth / image.clientHeight, filter: style.filter }
    }))
    for (const image of geometry) { expect(image.width).toBeGreaterThan(150); expect(image.ratio).toBeCloseTo(12/7, 1); expect(image.filter).toBe('none') }
    const screenshot = await page.screenshot({ path: info.outputPath(`hall-${width}.png`), fullPage: true })
    await info.attach(`hall-${width}`, { body: screenshot, contentType: 'image/png' })
  })
}

test('independent controls, sparse wall, keyboard focus and motion lifecycle', async ({ page }, info) => {
  const external: string[] = []
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:5173')) external.push(req.url()) })
  await page.reload()
  await page.getByRole('button', { name: 'Die Ruhmeshalle', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 950 })
  const hall = page.locator('.hall')
  await expect(hall).toHaveAttribute('data-animated', 'true')
  const mira = page.getByRole('combobox', { name: 'Schmuck für Mira' })
  await mira.focus()
  await expect(mira).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: 'Schmuck für Fenn' })).toBeFocused()
  await mira.selectOption('crown')
  await expect(page.getByRole('combobox', { name: 'Schmuck für Fenn' })).toHaveValue('banner')
  await expect(page.locator('.hall-honor--crown')).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Demowand' }).selectOption('sparse')
  await expect(page.getByText(/Freier Platz/)).toHaveCount(3)
  await expect(page.getByRole('img')).toHaveCount(3)
  await page.screenshot({ path: info.outputPath('hall-sparse.png'), fullPage: true })
  await page.getByRole('button', { name: 'Kaminlicht aus' }).click()
  await expect(hall).toHaveAttribute('data-animated', 'false')
  await page.screenshot({ path: info.outputPath('hall-light-off.png'), fullPage: true })
  await page.getByRole('button', { name: 'Kaminlicht ein' }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('status')).toContainText('statisch')
  await expect(hall).toHaveAttribute('data-animated', 'false')
  expect(await hall.evaluate(el => (el as HTMLElement).style.getPropertyValue('--warm-a'))).toBe('')
  await page.screenshot({ path: info.outputPath('hall-reduced.png'), fullPage: true })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(hall).toHaveAttribute('data-animated', 'true')
  // #268: Firelight advances its random signal by at most 64ms per rendered frame.
  // Headless WebKit paints this hall at ~2fps, so a fixed wall-clock window covers
  // too little signal time for any amplitude bound. Observe the light paints and
  // browser frames themselves; Firelight.test.tsx asserts amplitude with a seed.
  const light = await hall.evaluate(el => new Promise<{ levels: number[]; frames: number; maxGap: number; ms: number; visibility: string }>(resolve => {
    const room = el as HTMLElement, levels: number[] = [], start = performance.now()
    let frames = 0, last = start, maxGap = 0, done = false
    const finish = () => {
      if (done) return
      done = true; observer.disconnect(); clearTimeout(deadline)
      resolve({ levels, frames, maxGap: Math.round(maxGap), ms: Math.round(performance.now() - start), visibility: document.visibilityState })
    }
    const observer = new MutationObserver(() => {
      const level = parseFloat(room.style.getPropertyValue('--warm-a'))
      if (level !== levels.at(-1)) levels.push(level)
      if (levels.length >= 6) finish()
    })
    observer.observe(room, { attributes: true, attributeFilter: ['style'] })
    // Bound only the wait for paints. CI-image WebKit took 2.3-2.7s for six (#268).
    const deadline = setTimeout(finish, 10_000)
    const frame = (now: number) => { frames++; maxGap = Math.max(maxGap, now - last); last = now; if (!done) requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
  }))
  const diagnostics = JSON.stringify(light)
  info.annotations.push({ type: 'firelight-paints', description: diagnostics })
  // 24 frames span >=200ms even at 120Hz, enough for six 30Hz paints: fewer levels
  // then mean the fire loop stopped; fewer frames mean the browser stalled.
  const cause = light.frames >= 24 ? 'fire light stopped changing while the browser kept rendering' : 'browser rendered too few frames for six light paints'
  expect(light.levels, `${cause}: ${diagnostics}`).toHaveLength(6)
  // Strong light is .34 ± .125 (soft-compressed); NaN or out-of-range writes are defects.
  for (const level of light.levels) { expect(level, diagnostics).toBeGreaterThan(.215); expect(level, diagnostics).toBeLessThan(.465) }
  await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
  await expect(hall).toHaveCount(0)
  expect(external).toEqual([])
})
