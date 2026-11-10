import { expect, test, type Page } from '@playwright/test'

const id = (value: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(value).padStart(12, '0')}`
const groups = Array.from({ length: 20 }, (_, index) => ({
  id: id(index), name: index < 2 ? 'Alpha' : `Playgroup ${String(index).padStart(2, '0')} mit langem Namen`, role: 'MEMBER',
}))
const empty = 'Du bist noch keiner Playgroup beigetreten. Erstelle eine eigene Playgroup oder öffne einen Einladungslink.'

async function setup(page: Page, list = groups) {
  let writes = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    let status = 200
    if (path === '/api/me') body = { id: id(99), username: 'Demo' }
    else if (path === '/api/csrf') body = { headerName: 'X-CSRF-TOKEN', token: 'demo' }
    else if (path === '/api/groups' && route.request().method() === 'POST') {
      writes++
      body = { id: id(100), name: route.request().postDataJSON().name, role: 'OWNER' }
      status = 201
    } else if (path === '/api/groups') body = list
    else if (path.startsWith('/api/groups/')) body = { id: path.split('/')[3], name: 'Alpha', role: 'OWNER', members: [{ userId: id(99), username: 'Demo', role: 'OWNER' }] }
    else body = []
    await route.fulfill({ status, json: body })
  })
  await page.goto('/playgroups')
  return () => writes
}

const wireframeGroups = [
  { id: 'a71c9e2f-1111-4111-8111-111111111111', name: 'Friday Commander', role: 'MEMBER' },
  { id: 'b82d4f1a-2222-4222-8222-222222222222', name: 'Friday Commander', role: 'MEMBER' },
  ...['Mittwochsrunde', 'Sunday Commander', 'Tabletop Crew', 'Wednesday Wizards'].map((name, index) => ({ id: id(index), name, role: 'MEMBER' })),
]

for (const width of [320, 390, 1280]) {
  test(`approved wireframe layout in all three states at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await setup(page, wireframeGroups)
    const section = page.getByRole('region', { name: 'Playgroups', exact: true })
    const heading = section.getByRole('heading', { name: 'Meine Playgroups' })
    const plus = section.getByRole('button', { name: 'Playgroup erstellen', exact: true })
    const headingBox = (await heading.boundingBox())!
    const plusBox = (await plus.boundingBox())!
    expect(headingBox.x + headingBox.width).toBeLessThan(plusBox.x)
    expect(Math.abs(headingBox.y + headingBox.height / 2 - plusBox.y - plusBox.height / 2)).toBeLessThan(1)
    expect(headingBox.height).toBeLessThan(44)
    const cards = section.getByRole('listitem')
    await expect(cards).toHaveCount(6)
    let previousBottom = 0
    for (const card of await cards.all()) {
      const cardBox = (await card.boundingBox())!
      const overview = (await card.getByRole('button').boundingBox())!
      const match = (await card.getByRole('link').boundingBox())!
      await expect(card.getByText('›', { exact: true })).toBeVisible()
      expect(cardBox.y).toBeGreaterThanOrEqual(previousBottom)
      expect(match.y).toBeGreaterThanOrEqual(overview.y + overview.height)
      expect(cardBox.x + cardBox.width - match.x - match.width).toBeCloseTo(16, 0)
      previousBottom = cardBox.y + cardBox.height
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`wireframe-collection-${width}.png`) })
    await plus.click()
    const dialog = page.getByRole('dialog')
    const input = dialog.getByRole('textbox', { name: 'Name der Playgroup' })
    await expect(input).toBeFocused()
    const label = (await dialog.locator('label').boundingBox())!
    const inputBox = (await input.boundingBox())!
    const cancel = (await dialog.getByRole('button', { name: 'Abbrechen' }).boundingBox())!
    const create = (await dialog.getByRole('button', { name: 'Erstellen', exact: true }).boundingBox())!
    const dialogBox = (await dialog.boundingBox())!
    expect(label.y + label.height).toBeLessThan(inputBox.y)
    expect(cancel.y).toBeGreaterThan(inputBox.y + inputBox.height)
    expect(cancel.x + cancel.width).toBeLessThan(create.x)
    expect(cancel.y).toBeCloseTo(create.y, 0)
    expect(cancel.height).toBeLessThan(60)
    expect(create.height).toBeLessThan(60)
    expect(dialogBox.x).toBeGreaterThanOrEqual(16)
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width - 16)
    await page.screenshot({ path: info.outputPath(`wireframe-dialog-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.route('**/api/groups', route => route.fulfill({ json: [] }))
    await page.reload()
    await expect(page.getByText(empty, { exact: true })).toBeVisible()
    await expect(plus).toBeVisible()
    await expect(section.getByRole('listitem')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`wireframe-empty-${width}.png`) })
  })
}

for (const width of [320, 1280]) {
  test(`collection, keyboard dialog and scoped navigation at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    const writes = await setup(page)
    const list = page.getByRole('list', { name: 'Deine Playgroups' })
    await expect(list.getByRole('listitem')).toHaveCount(20)
    expect(await list.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))).toEqual(groups.map(group => group.name))
    await expect(page.getByText(`ID: ${id(0).replaceAll('-', '')}`, { exact: true })).toBeVisible()
    await expect(page.getByText(`ID: ${id(1).replaceAll('-', '')}`, { exact: true })).toBeVisible()
    await expect(page.getByText('Mitglied', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`collection-${width}.png`) })
    const plus = page.getByRole('button', { name: 'Playgroup erstellen', exact: true })
    const box = await plus.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await plus.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Playgroup erstellen' })
    const name = dialog.getByRole('textbox', { name: 'Name der Playgroup' })
    await expect(name).toBeFocused()
    await expect(dialog.getByRole('textbox')).toHaveCount(1)
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Erstellen', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(name).toBeFocused()
    await page.screenshot({ path: info.outputPath(`dialog-${width}.png`) })
    await name.fill('   \u0085\u001c')
    await dialog.getByRole('button', { name: 'Erstellen', exact: true }).click()
    await expect(dialog.getByText('Bitte gib einen Namen für die Playgroup ein.')).toBeVisible()
    expect(writes()).toBe(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(plus).toBeFocused()
    await list.getByRole('listitem').first().getByRole('link', { name: /Spiel erfassen/ }).click()
    await expect(page).toHaveURL(`/playgroups/${id(0)}/games/new`)
    await page.goto('/playgroups')
    await page.getByRole('list', { name: 'Deine Playgroups' }).getByRole('button', { name: 'Alpha', exact: true }).nth(1).click()
    await expect(page).toHaveURL(`/playgroups/${id(1)}`)
    await page.goto('/playgroups')
    await page.getByRole('button', { name: 'Playgroup erstellen', exact: true }).click()
    await name.fill('Alpha')
    await dialog.getByRole('button', { name: 'Erstellen', exact: true }).click()
    await expect(page).toHaveURL(`/playgroups/${id(100)}`)
    expect(writes()).toBe(1)
  })
}

test('successful empty response and retryable errors stay distinct', async ({ page }, info) => {
  await setup(page, [])
  await expect(page.getByText(empty, { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('empty.png') })
  await page.route('**/api/groups', route => route.fulfill({ status: 503, json: {} }))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Playgroups aktualisieren' })).toBeVisible()
  await expect(page.getByText(empty, { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('error.png') })
  await page.route('**/api/groups', route => route.fulfill({ json: [] }))
  await page.getByRole('button', { name: 'Playgroups aktualisieren' }).click()
  await expect(page.getByText(empty, { exact: true })).toBeVisible()
})

test('creation errors preserve names and pending submissions cannot be repeated or dismissed', async ({ page }, info) => {
  await setup(page, [groups[0]])
  let finish!: () => void
  let attempts = 0
  await page.route('**/api/groups', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    attempts++
    if (attempts === 1) return route.fulfill({ status: 400, json: {} })
    await new Promise<void>(resolve => { finish = resolve })
    await route.fulfill({ status: 201, json: { ...groups[0], id: id(100), role: 'OWNER' } })
  })
  await page.getByRole('button', { name: 'Playgroup erstellen', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const name = dialog.getByRole('textbox')
  await name.fill('Alpha')
  const submit = dialog.getByRole('button', { name: 'Erstellen', exact: true })
  await submit.click()
  await expect(dialog.getByRole('alert')).toContainText('Der Name wurde nicht akzeptiert.')
  await expect(name).toHaveValue('Alpha')
  await page.screenshot({ path: info.outputPath('create-error.png') })
  await submit.click()
  await expect(submit).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeDisabled()
  await expect(dialog.getByRole('status')).toContainText('Playgroup wird erstellt…')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: info.outputPath('pending.png') })
  expect(attempts).toBe(2)
  finish()
  await expect(page).toHaveURL(`/playgroups/${id(100)}`)
})

test('loading does not display the successful empty message', async ({ page }, info) => {
  await setup(page, [])
  let finish!: () => void
  await page.route('**/api/groups', async route => {
    await new Promise<void>(resolve => { finish = resolve })
    await route.fulfill({ json: [] })
  })
  await page.reload()
  await expect(page.getByRole('region', { name: 'Playgroups', exact: true }).getByRole('status')).toContainText('Playgroups werden geladen…')
  await expect(page.getByText(empty, { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('loading.png') })
  finish()
  await expect(page.getByText(empty, { exact: true })).toBeVisible()
})
