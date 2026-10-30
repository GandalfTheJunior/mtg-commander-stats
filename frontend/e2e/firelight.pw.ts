import { test, expect } from '@playwright/test'

for (const width of [320, 375, 390, 1280]) {
  test(`card lighting modes, neutral depth and static accessibility at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/dev/lounge.html?firelight=baseline')
    await page.getByRole('switch', { name: 'Pergament-Karten' }).uncheck()
    const card = page.locator('.table-cards > li').first()
    const light = () => card.evaluate(n => {
      const s = getComputedStyle(n)
      return { level: Number(s.getPropertyValue('--card-light')), shadow: s.boxShadow, surface: s.backgroundImage }
    })
    const quiet = await light()
    expect(quiet.level).toBe(.3)
    await page.screenshot({ path: info.outputPath('quiet.png'), fullPage: true })
    await page.getByRole('button', { name: 'Deutlich', exact: true }).click()
    const strong = await light()
    expect(strong.level).toBe(.58)
    expect(strong.shadow).not.toBe(quiet.shadow)
    expect(strong.surface).not.toBe(quiet.surface)
    await page.screenshot({ path: info.outputPath('strong.png'), fullPage: true })
    await page.getByRole('switch', { name: 'Kaminlicht' }).click()
    const off = await light()
    expect(off.level).toBe(0)
    expect(off.shadow).not.toBe('none')
    await page.screenshot({ path: info.outputPath('off.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('switch', { name: 'Kaminlicht' }).click()
    await page.getByRole('button', { name: 'mira nach unten' }).click()
    await expect(page.locator('.table-cards h3')).toHaveText(['Orin', 'Mira', 'Lumi', 'Fenn'])
    await page.getByRole('button', { name: /Demo zurücksetzen/ }).click()
    expect((await light()).level).toBe(.3)
  })
}

test('one live signal lights all cards and a raised overlay through flare and measured landing', async ({ page }, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1280, height: 1050 })
  await page.goto('/dev/lounge.html?firelight=baseline')
  await page.getByRole('switch', { name: 'Pergament-Karten' }).uncheck()
  await page.getByRole('button', { name: 'Deutlich', exact: true }).click()
  const grip = await page.getByRole('button', { name: 'Mira ziehen' }).boundingBox()
  await page.mouse.move(grip!.x + 20, grip!.y + 20)
  await page.mouse.down()
  await page.mouse.move(grip!.x + 50, grip!.y + 30)
  await expect(page.locator('.drag-overlay')).toHaveCount(1)
  const samples = await page.evaluate(() => new Promise<{ fire: number; room: number; shadow: string; same: boolean }[]>(resolve => {
    const rows: { fire: number; room: number; shadow: string; same: boolean }[] = []
    const start = performance.now()
    const sample = () => {
      const overlay = getComputedStyle(document.querySelector('.drag-overlay')!)
      const room = getComputedStyle(document.querySelector('.lounge')!)
      rows.push({ fire: Number(room.getPropertyValue('--card-fire')), room: Number(room.getPropertyValue('--warm-a')),
        shadow: overlay.boxShadow, same: [...document.querySelectorAll('.player-card')].every(n => getComputedStyle(n).getPropertyValue('--card-fire') === room.getPropertyValue('--card-fire')) })
      if (performance.now() - start < 25000) requestAnimationFrame(sample)
      else resolve(rows)
    }
    requestAnimationFrame(sample)
  }))
  expect(samples.every(s => s.same && s.fire > .3 && s.fire < .84)).toBe(true)
  expect(Math.max(...samples.map(s => s.fire)) - Math.min(...samples.map(s => s.fire))).toBeGreaterThan(.08)
  expect(new Set(samples.map(s => s.shadow)).size).toBeGreaterThan(10)
  for (let i = 1; i < samples.length; i++) {
    expect((samples[i].fire - samples[i - 1].fire) * (samples[i].room - samples[i - 1].room)).toBeGreaterThanOrEqual(-.000001)
  }
  await page.screenshot({ path: info.outputPath('raised.png') })
  await page.evaluate(() => {
    const values: number[] = []
    ;(window as Window & { lightLanding?: number[] }).lightLanding = values
    document.addEventListener('pointerup', () => {
      const frame = () => {
        const node = document.querySelector('.drag-overlay')
        if (!node) return
        values.push(Number(getComputedStyle(node).getPropertyValue('--card-lift')))
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }, { once: true })
  })
  await page.mouse.up()
  await expect(page.locator('.drag-overlay')).toHaveCount(0)
  const landing = await page.evaluate(() => (window as Window & { lightLanding?: number[] }).lightLanding!)
  expect(landing.some(n => n > 0 && n < 1)).toBe(true)
  expect(landing.at(-1)).toBeLessThan(.02)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('.lounge').evaluate(n => n.getAttribute('data-reduced'))).toBe('true')
  const before = await page.locator('.lounge').getAttribute('style')
  await page.waitForTimeout(300)
  expect(await page.locator('.lounge').getAttribute('style')).toBe(before)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.locator('.lounge').getAttribute('style')).not.toBe(before)
})
