import { test, expect } from '@playwright/test'

for (const mode of ['optimized', 'static']) {
  test(`${mode}: static relief, light lifecycle and unchanged wax controls`, async ({ page }, info) => {
    await page.goto(`/dev/lounge.html?firelight=${mode}`)
    await page.getByRole('switch', { name: 'Glühwürmchen' }).uncheck()
    await expect(page.locator('.lounge')).toHaveAttribute('data-light-mode', mode)
    const state = () => page.evaluate(() => ({
      room: document.querySelector('.lounge')!.getAttribute('style'),
      edge: getComputedStyle(document.querySelector('.stone-fire-edge')!).opacity,
      shadow: getComputedStyle(document.querySelector('.table-cards > li')!).boxShadow,
      promotion: getComputedStyle(document.querySelector('.room-light i')!).willChange,
      light: (document.querySelector('.room-light i') as HTMLElement).style.opacity,
    }))
    const before = await state()
    expect(before.promotion).toBe(mode === 'optimized' ? 'opacity' : 'auto')
    if (mode === 'optimized') await expect.poll(async () => (await state()).light).not.toBe(before.light)
    else await page.waitForTimeout(150)
    const after = await state()
    expect(after.room).toBe(before.room)
    expect(after.edge).toBe(before.edge)
    expect(after.shadow).toBe(before.shadow)
    if (mode === 'static') expect(after.light).toBe(before.light)
    await page.getByRole('button', { name: 'mira nach unten' }).click()
    await expect(page.locator('.table-cards h3')).toHaveText(['Orin', 'Mira', 'Lumi', 'Fenn'])
    await expect(page.getByRole('switch', { name: 'Wachssiegel-Design' })).toBeChecked()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.lounge')).toHaveAttribute('data-reduced', 'true')
    const reduced = await state()
    expect(reduced.promotion).toBe('auto')
    await page.waitForTimeout(150)
    expect(await state()).toEqual(reduced)
    await page.getByRole('switch', { name: 'Kaminlicht', exact: true }).uncheck()
    await expect(page.locator('.room-light')).toBeHidden()
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByRole('switch', { name: 'Kaminlicht', exact: true }).check()
      await page.screenshot({ path: info.outputPath(`${mode}-${width}.png`), fullPage: true })
    }
  })
}
