import { expect, test } from '@playwright/test'

test('gallery controls, responsive geometry, original artwork and motion lifecycle', async ({ page }, info) => {
  const external: string[] = []
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:5173')) external.push(req.url()) })
  await page.goto('/dev/lounge.html')
  await page.getByRole('button', { name: 'Die Ruhmeshalle', exact: true }).click()
  const hall = page.locator('.hall')
  await expect(hall).toHaveAttribute('data-animated', 'true')
  for (const width of [320, 375, 390, 1280]) {
    await page.setViewportSize({ width, height: 950 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.getByRole('img')).toHaveCount(6)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const geometry = await page.locator('.hall-art').evaluateAll(images => images.map(image => {
      const rect = image.getBoundingClientRect(), style = getComputedStyle(image)
      return { width: rect.width, ratio: image.clientWidth / image.clientHeight, filter: style.filter }
    }))
    for (const image of geometry) { expect(image.width).toBeGreaterThan(150); expect(image.ratio).toBeCloseTo(12/7, 1); expect(image.filter).toBe('none') }
    const screenshot = await page.screenshot({ path: info.outputPath(`hall-${width}.png`), fullPage: true })
    await info.attach(`hall-${width}`, { body: screenshot, contentType: 'image/png' })
  }
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
  const levels = await hall.evaluate(async el => {
    const values: number[] = []
    for (let i=0; i<20; i++) { await new Promise(r => setTimeout(r, 100)); values.push(parseFloat((el as HTMLElement).style.getPropertyValue('--warm-a'))) }
    return values
  })
  expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(.001)
  await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
  await expect(hall).toHaveCount(0)
  expect(external).toEqual([])
})
