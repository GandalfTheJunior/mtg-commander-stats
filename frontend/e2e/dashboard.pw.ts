import { expect, test } from '@playwright/test'

const id = (value: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(value).padStart(12, '0')}`
const groups = ['Playgroup A', 'Playgroup B', 'Playgroup C', 'Playgroup D'].map((name, index) => ({ id: id(index), name, role: 'MEMBER' }))
const empty = 'Du bist noch keiner Playgroup beigetreten. Erstelle eine eigene Playgroup oder öffne einen Einladungslink.'

for (const width of [320, 390, 1280]) {
  test(`Dashboard wireframe, states and distinct destinations at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    let list = groups
    let failure = false
    const calls: string[] = []
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      calls.push(path)
      if (path === '/api/me') await route.fulfill({ json: { id: id(99), username: 'Demo' } })
      else if (path === '/api/groups') await route.fulfill({ status: failure ? 503 : 200, json: failure ? {} : list })
      else if (path === `/api/groups/${id(1)}`) await route.fulfill({ json: { ...groups[1], members: [{ userId: id(99), username: 'Demo', role: 'MEMBER' }] } })
      else await route.fulfill({ json: [] })
    })
    await page.goto('/dashboard')
    const section = page.getByRole('region', { name: 'Dashboard', exact: true })
    const cards = section.getByRole('listitem')
    const all = section.getByRole('link', { name: 'Alle Playgroups anzeigen' })
    const plus = section.getByRole('link', { name: 'Playgroup erstellen' })
    await expect(cards).toHaveCount(3)
    const heading = (await section.getByRole('heading', { name: 'Meine Playgroups' }).boundingBox())!
    const shortcut = (await all.boundingBox())!
    expect(shortcut.x).toBeGreaterThanOrEqual(heading.x + heading.width)
    expect(Math.abs(heading.y + heading.height / 2 - shortcut.y - shortcut.height / 2)).toBeLessThan(1)
    let bottom = 0
    for (const card of await cards.all()) {
      const box = (await card.boundingBox())!
      const overview = card.getByRole('button')
      const record = card.getByRole('link')
      expect(await overview.locator('a, button').count()).toBe(0)
      expect((await record.boundingBox())!.y).toBeGreaterThanOrEqual((await overview.boundingBox())!.y + (await overview.boundingBox())!.height)
      expect(box.y).toBeGreaterThanOrEqual(bottom)
      bottom = box.y + box.height
    }
    const plusBox = (await plus.boundingBox())!
    expect(plusBox.y).toBeGreaterThanOrEqual(bottom)
    expect(plusBox.x).toBeCloseTo((await cards.first().boundingBox())!.x, 0)
    expect(plusBox.width).toBeGreaterThanOrEqual(44)
    expect(plusBox.height).toBeGreaterThanOrEqual(44)
    await plus.focus()
    expect(await plus.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect([...new Set(calls)]).toEqual(['/api/me', '/api/groups'])
    await page.screenshot({ path: info.outputPath(`dashboard-${width}.png`), fullPage: true })
    if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/dashboard-${width}.png`, fullPage: true })
    await all.click()
    await expect(page.getByRole('listitem')).toHaveCount(4)
    await page.goBack()
    await plus.click()
    await expect(page.getByRole('dialog', { name: 'Playgroup erstellen' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Name der Playgroup' })).toBeFocused()
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Playgroup erstellen' })).toBeFocused()
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.goto('/dashboard')
    await cards.nth(1).getByRole('button').click()
    await expect(page).toHaveURL(new RegExp(`/playgroups/${id(1)}$`))
    await expect(page.getByRole('tab', { name: 'Overview', selected: true })).toBeVisible()
    await page.goBack()
    await cards.nth(1).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/playgroups/${id(1)}/games/new$`))
    await expect(page.getByRole('heading', { name: 'Spiel erfassen', exact: true })).toBeVisible()
    list = groups.slice(0, 3)
    await page.goto('/dashboard')
    await expect(cards).toHaveCount(3)
    await expect(all).toHaveCount(0)
    list = []
    await page.reload()
    await expect(section.getByText(empty, { exact: true })).toBeVisible()
    await expect(plus).toBeVisible()
    await expect(cards).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`dashboard-empty-${width}.png`), fullPage: true })
    if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/dashboard-empty-${width}.png`, fullPage: true })
    failure = true
    await page.reload()
    await expect(section.getByRole('alert')).toBeVisible()
    await expect(section.getByText(empty)).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const errorText = section.getByText('Playgroups konnten nicht geladen werden.', { exact: true })
    expect(await errorText.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`dashboard-error-${width}.png`), fullPage: true })
    if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/dashboard-error-${width}.png`, fullPage: true })
    failure = false; list = groups
    await section.getByRole('button', { name: 'Playgroups erneut laden' }).click()
    await expect(cards).toHaveCount(3)
  })
}
