import { test, expect } from '@playwright/test'

for (const width of [320, 375, 390, 1280]) {
  test(`stone relief remains decorative and responds to light at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/dev/lounge.html')
    const wall = page.locator('.stone-wall')
    await expect(wall).toHaveAttribute('aria-hidden', 'true')
    await expect(wall.locator('svg')).toHaveAttribute('focusable', 'false')
    expect(await wall.evaluate(n => getComputedStyle(n).pointerEvents)).toBe('none')
    const sample = () => wall.evaluate(n => ({
      edge: Number(getComputedStyle(n.querySelector('.stone-raised .stone-fire-edge')!).opacity),
      shade: Number(getComputedStyle(n.querySelector('.stone-raised .stone-fire-shadow')!).opacity),
      base: getComputedStyle(n.querySelector('.stone > path:nth-child(3)')!).fill,
      filter: getComputedStyle(n.querySelector('svg')!).filter,
    }))
    const quiet = await sample()
    expect(quiet.edge).toBeCloseTo(.04 + .3 ** 2 * 1.3)
    expect(quiet.shade).toBeCloseTo(.04 + .3 ** 2 * 1.25)
    expect(quiet.filter).toBe('none')
    const joints = page.locator('.stone-joints')
    await expect(joints).toHaveAttribute('aria-hidden', 'true')
    expect(await joints.evaluate(n => getComputedStyle(n).pointerEvents)).toBe('none')
    expect(await joints.locator('path').evaluate(n => getComputedStyle(n).fill)).toBe('rgb(27, 30, 34)')
    // Joints paint above the warm wash; content remains above both layers.
    expect(await joints.evaluate(n => !!(document.querySelector('.room-light')!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
    await page.screenshot({ path: info.outputPath('stone-quiet.png'), fullPage: true })
    await page.getByRole('button', { name: 'Deutlich', exact: true }).click()
    const strong = await sample()
    expect(strong.edge).toBeCloseTo(.04 + .58 ** 2 * 1.3)
    expect(strong.shade).toBeCloseTo(.04 + .58 ** 2 * 1.25)
    await page.screenshot({ path: info.outputPath('stone-strong.png'), fullPage: true })
    // The maximum possible shared signal still has headroom on raised facets.
    await page.locator('.lounge').evaluate(n => (n as HTMLElement).style.setProperty('--card-fire', '.84'))
    const peak = await sample()
    expect(peak.edge).toBeGreaterThan(strong.edge)
    expect(peak.edge).toBeLessThan(1)
    expect(peak.shade).toBeLessThan(1)
    await page.locator('.lounge').evaluate(n => (n as HTMLElement).style.setProperty('--card-fire', '.58'))
    await page.waitForTimeout(150)
    expect(await sample()).toEqual(strong)
    await page.getByRole('switch', { name: 'Kaminlicht' }).click()
    expect(await sample()).toMatchObject({ edge: 0, shade: 0, base: quiet.base })
    await page.screenshot({ path: info.outputPath('stone-off.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    // Decorative geometry cannot intercept controls or enter the tab order.
    await page.getByRole('button', { name: 'mira nach unten' }).click()
    await expect(page.locator('.table-cards h3')).toHaveText(['Orin', 'Mira', 'Lumi', 'Fenn'])
    await page.getByRole('button', { name: /Demo zurücksetzen/ }).click()
    expect(await sample()).toEqual(quiet)
    if (width === 1280) {
      await page.setViewportSize({ width, height: 2000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: info.outputPath('stone-tall.png'), fullPage: true })
    }
  })
}

test('wall highlights and opposite shadows follow the same live flare as cards', async ({ page }, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1280, height: 1050 })
  await page.goto('/dev/lounge.html')
  await page.getByRole('switch', { name: 'Glühwürmchen' }).click()
  await page.getByRole('button', { name: 'Deutlich', exact: true }).click()
  const samples = await page.evaluate(() => new Promise<{ time: number; fire: number; edge: number; shade: number }[]>(resolve => {
    const rows: { time: number; fire: number; edge: number; shade: number }[] = []
    const start = performance.now()
    const sample = () => {
      const fire = Number(getComputedStyle(document.querySelector('.player-card')!).getPropertyValue('--card-fire'))
      rows.push({ time: performance.now() - start, fire,
        edge: Number(getComputedStyle(document.querySelector('.stone-raised .stone-fire-edge')!).opacity),
        shade: Number(getComputedStyle(document.querySelector('.stone-raised .stone-fire-shadow')!).opacity) })
      if (performance.now() - start < 25000) setTimeout(sample, 100)
      else resolve(rows)
    }
    sample()
  }))
  await info.attach('live-stone-flare.json', { body: JSON.stringify(samples), contentType: 'application/json' })
  expect(Math.max(...samples.map(s => s.fire)) - Math.min(...samples.map(s => s.fire))).toBeGreaterThan(.08)
  const range = (key: 'edge' | 'shade' | 'fire') => Math.max(...samples.map(s => s[key])) - Math.min(...samples.map(s => s[key]))
  // Raised relief varies more than the previous .65/.6 linear wall response.
  expect(range('edge')).toBeGreaterThan(range('fire') * .65)
  expect(range('shade')).toBeGreaterThan(range('fire') * .6)
  for (const row of samples) {
    expect(row.edge).toBeCloseTo(.04 + row.fire ** 2 * 1.3, 4)
    expect(row.shade).toBeCloseTo(.04 + row.fire ** 2 * 1.25, 4)
    expect(row.edge).toBeGreaterThan(0)
    expect(row.edge).toBeLessThan(1)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.lounge')).toHaveAttribute('data-reduced', 'true')
  const before = await page.locator('.lounge').getAttribute('style')
  await page.waitForTimeout(200)
  expect(await page.locator('.lounge').getAttribute('style')).toBe(before)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.locator('.lounge').getAttribute('style')).not.toBe(before)
})
