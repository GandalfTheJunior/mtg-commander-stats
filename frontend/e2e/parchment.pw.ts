import { test, expect } from '@playwright/test'

for (const width of [320, 375, 390, 1280]) {
  test(`parchment material, controls and comparison at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 })
    await page.goto('/dev/lounge.html')
    const card = page.locator('.table-cards > li').first()
    const material = () => card.evaluate(n => ({ background: getComputedStyle(n, '::before').backgroundImage, shadow: getComputedStyle(n).boxShadow }))
    await expect(page.getByRole('switch', { name: 'Pergament-Karten' })).toBeChecked()
    const before = await material()
    expect(before.background).toContain('data:image/svg+xml')
    await page.waitForTimeout(350)
    expect(await material()).toEqual(before)
    for (const button of await page.locator('.card-controls button').all()) {
      const b = (await button.boundingBox())!
      expect(b.width).toBeGreaterThanOrEqual(44)
      expect(b.height).toBeGreaterThanOrEqual(44)
    }
    for (const row of await page.locator('.table-cards > li').all()) {
      expect(await row.evaluate(n => {
        const bounds = n.getBoundingClientRect()
        return [...n.querySelectorAll('.card-face, .card-controls, h3, strong, p, button')].every(child => {
          const rect = child.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right
        })
      })).toBe(true)
      for (const text of await row.locator('h3, strong, p').all()) await expect(text).toBeVisible()
    }
    const down = page.getByRole('button', { name: 'mira nach unten' })
    await down.focus()
    expect(await down.evaluate(n => getComputedStyle(n).outlineColor)).toBe('rgb(88, 44, 28)')
    await page.screenshot({ path: info.outputPath(`parchment-${width}.png`), fullPage: true })
    await page.keyboard.press('Enter')
    await expect(down).toBeFocused()
    await expect(page.getByText('Mira: Position 2 von 4.')).toBeAttached()
    await page.getByRole('button', { name: 'Auswahl bestätigen' }).click()
    await page.getByRole('button', { name: 'Spiel starten', exact: true }).click()
    const toggle = page.getByRole('switch', { name: 'Pergament-Karten' })
    await toggle.uncheck()
    await expect(page.locator('.table-cards h3')).toHaveText(['Orin', 'Mira', 'Lumi', 'Fenn'])
    await expect(page.getByText(/Demo-Runde 1 gestartet/)).toBeVisible()
    await page.screenshot({ path: info.outputPath('classic.png'), fullPage: true })
    await toggle.check()
    await page.getByRole('switch', { name: 'Kaminlicht', exact: true }).uncheck()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.screenshot({ path: info.outputPath('parchment-off-reduced.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.getByRole('button', { name: /Demo zurücksetzen/ }).click()
    await expect(toggle).toBeChecked()
  })
}

test('held paper, insertion and invalid drop retain material', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1200 })
  await page.goto('/dev/lounge.html')
  const grip = (await page.getByRole('button', { name: 'Mira ziehen' }).boundingBox())!
  const target = (await page.locator('.table-cards > li').nth(2).boundingBox())!
  await page.mouse.move(grip.x + 20, grip.y + 20)
  await page.mouse.down()
  await page.mouse.move(grip.x + 20, target.y + 20)
  const overlay = page.locator('.drag-overlay')
  const material = await overlay.evaluate(n => getComputedStyle(n, '::before').backgroundImage)
  expect(material).toContain('data:image/svg+xml')
  await expect(page.locator('.insertion')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('held-insertion.png') })
  await page.mouse.move(5, target.y + 20)
  await expect(overlay).toContainText('Außerhalb · Abbrechen')
  await page.screenshot({ path: info.outputPath('invalid.png') })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('.table-cards h3')).toHaveText(['Mira', 'Orin', 'Lumi', 'Fenn'])
})
