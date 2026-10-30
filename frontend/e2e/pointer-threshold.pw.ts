import { test, expect } from '@playwright/test'

for (const width of [320, 375, 390, 1280]) {
  for (const light of [true, false]) {
    test(`symmetric pointer entry and reversal at ${width}px, light ${light}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1800 })
      await page.goto('/dev/lounge.html')
      if (!light) await page.getByRole('switch', { name: 'Kaminlicht' }).click()
      // Clicking the ambience control can scroll a narrow page. Restore the
      // viewport before measuring original targets, away from edge scrolling.
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      const cards = page.locator('.table-cards > li')
      // Unequal content heights are real browser layout, measured before reflow.
      const targets = await cards.evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }
      }))
      const grip = page.getByRole('button', { name: 'Orin ziehen' })
      const b = (await grip.boundingBox())!
      const x = b.x + 20
      await page.mouse.move(x, b.y + (light ? 8 : b.height - 8))
      await page.mouse.down()
      const shift = (i: number) => cards.nth(i).evaluate(n => new DOMMatrixReadOnly(getComputedStyle(n).transform).m42)
      const down = targets[2].top + targets[2].height * .05
      await page.mouse.move(x, Math.ceil(down) - 1)
      expect(await shift(2)).toBe(0)
      await page.mouse.move(x, Math.ceil(down))
      await expect.poll(() => shift(2)).toBeLessThan(0)
      await page.mouse.move(x, Math.ceil(down) - 3)
      await expect.poll(() => shift(2)).toBeLessThan(0)
      await page.mouse.move(x, Math.floor(down) - 7)
      await expect.poll(() => shift(2)).toBe(0)
      const up = targets[0].bottom - targets[0].height * .05
      await page.mouse.move(x, Math.ceil(up) + 1)
      expect(await shift(0)).toBe(0)
      await page.mouse.move(x, Math.floor(up))
      await expect.poll(() => shift(0)).toBeGreaterThan(0)
      await page.mouse.move(x, Math.floor(up) + 3)
      await expect.poll(() => shift(0)).toBeGreaterThan(0)
      await page.mouse.move(x, Math.ceil(up) + 7)
      await expect.poll(() => shift(0)).toBe(0)
      // Jump through several slots, reverse and return before committing.
      await page.mouse.move(x, targets[3].bottom - 10)
      await expect.poll(() => shift(3)).toBeLessThan(0)
      await expect(page.locator('.table-cards h3')).toHaveText(['Mira', 'Orin', 'Lumi', 'Fenn'])
      await page.mouse.move(x, Math.floor(up))
      await expect.poll(() => shift(0)).toBeGreaterThan(0)
      await page.screenshot({ path: info.outputPath('upward-preview.png') })
      await page.mouse.move(x, targets[3].bottom - 10)
      await expect.poll(() => shift(3)).toBeLessThan(0)
      await page.screenshot({ path: info.outputPath('downward-preview.png') })
      await page.mouse.up()
      await expect(page.locator('.table-cards h3')).toHaveText(['Mira', 'Lumi', 'Fenn', 'Orin'])
      await expect(page.locator('.drag-overlay')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('committed.png') })
    })
  }
}
