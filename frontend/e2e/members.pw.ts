import { expect, test, type Page, type TestInfo } from '@playwright/test'

// #198 Members directory with synthetic, non-sensitive API responses.
const id = (value: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(value).padStart(12, '0')}`
const groupId = id(100)
const base = `/api/groups/${groupId}`
type Member = { userId: string; username: string; role: 'OWNER' | 'ADMIN' | 'MEMBER'; quickProfile?: boolean }
const owner: Member = { userId: id(1), username: 'Gandalf', role: 'OWNER' }
const admin: Member = { userId: id(2), username: 'Saruman', role: 'ADMIN' }
const roster: Member[] = [owner, admin,
  { userId: id(3), username: 'Aragorn', role: 'MEMBER' },
  { userId: id(4), username: 'Bilbo', role: 'MEMBER' },
  { userId: id(5), username: 'Flinker Waschbär', role: 'MEMBER', quickProfile: true },
  { userId: id(6), username: 'Frodo', role: 'MEMBER' }]
const longRoster: Member[] = [owner, admin, ...Array.from({ length: 22 }, (_, i): Member =>
  ({ userId: id(10 + i), username: `Spieler mit einem recht langen Anzeigenamen ${String(i + 1).padStart(2, '0')}`, role: 'MEMBER' }))]
const transfer = { id: id(70), groupId, requesterId: owner.userId, requesterUsername: owner.username, targetUserId: admin.userId,
  targetUsername: admin.username, state: 'PENDING', createdAt: '2026-11-01T10:00:00Z', resolvedAt: null }

async function mockApi(page: Page, viewer: Member, members: Member[], pending: typeof transfer | null = null) {
  const role = viewer.role
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/me') await route.fulfill({ json: { id: viewer.userId, username: viewer.username } })
    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
    else if (path === base) await route.fulfill({ json: { id: groupId, name: 'Commander-Runde', role, members } })
    else if (path === `${base}/ownership-transfer`) await route.fulfill(pending ? { json: pending } : { status: 404, json: {} })
    else if (path === `${base}/ownership-transfer/notices`) await route.fulfill({ json: [] })
    else if (path === `${base}/quick-profiles` && request.method() === 'POST')
      await route.fulfill({ status: 201, json: { userId: id(9), username: 'Hairy Zombie', role: 'MEMBER', quickProfile: true } })
    else await route.fulfill({ json: [] })
  })
}
async function shot(page: Page, info: TestInfo, name: string) {
  // Overlays are captured in the viewport after their transitions, so the fixed bottom bar stays in place.
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
  const fullPage = await page.getByRole('dialog').or(page.getByRole('menu')).count() === 0
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}.png`, fullPage })
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

for (const width of [320, 375, 390, 1280]) {
  test(`Members directory layout, menus and dialogs at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await mockApi(page, owner, roster)
    await page.goto(`/playgroups/${groupId}/members`)
    const list = page.getByRole('list', { name: 'Aktive Mitglieder' })
    await expect(list.getByRole('listitem')).toHaveCount(6)
    const invite = (await page.getByRole('button', { name: /Spieler einladen/ }).boundingBox())!
    const create = (await page.getByRole('button', { name: /Schnellprofil erstellen/ }).boundingBox())!
    expect(Math.abs(invite.y - create.y)).toBeLessThan(1)
    expect(invite.width).toBeGreaterThan(create.width)
    expect(create.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('searchbox')).toHaveCount(0)
    const trigger = page.getByRole('button', { name: 'Aktionen für Saruman' })
    const box = (await trigger.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `members-01-directory-${width}`)

    await trigger.click()
    await expect(page.getByRole('menuitem')).toHaveText(['Zum Mitglied zurückstufen', 'Eigentümerschaft übertragen'])
    await expect(page).toHaveURL(new RegExp(`/playgroups/${groupId}/members$`))
    await shot(page, info, `members-02a-admin-menu-${width}`)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.getByRole('button', { name: 'Aktionen für Flinker Waschbär' }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['Schnellprofil umbenennen', 'Deck erstellen', 'Schnellprofil löschen'])
    await shot(page, info, `members-02c-quick-profile-menu-${width}`)
    await page.getByRole('menuitem', { name: 'Schnellprofil löschen' }).click()
    await expect(page.getByRole('dialog', { name: 'Schnellprofil löschen?' })).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `members-03c-delete-dialog-${width}`)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Aktionen für Frodo' }).click()
    await page.getByRole('menuitem', { name: 'Zum Admin ernennen' }).click()
    await expect(page.getByRole('dialog', { name: 'Zum Admin ernennen?' })).toBeVisible()
    await shot(page, info, `members-03a-promote-dialog-${width}`)
    await page.getByRole('button', { name: 'Abbrechen' }).click()

    await page.getByRole('button', { name: /Schnellprofil erstellen/ }).click()
    await expect(page.getByRole('dialog', { name: 'Schnellprofil erstellt' })).toContainText('„Hairy Zombie“')
    await shot(page, info, `members-04a-created-${width}`)
    await page.getByRole('button', { name: 'Namen ändern' }).click()
    const field = page.getByRole('textbox', { name: 'Profilname' })
    await expect(field).toHaveAttribute('placeholder', 'Hairy Zombie')
    await shot(page, info, `members-04b-rename-before-focus-${width}`)
    await field.focus()
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled()
    await shot(page, info, `members-04c-rename-focused-${width}`)
    await page.getByRole('button', { name: 'Abbrechen' }).click()

    await page.getByRole('button', { name: 'Nur Schnellprofile' }).click()
    await expect(page.getByRole('list', { name: 'Aktive Mitglieder' }).getByRole('listitem')).toHaveCount(1)
  })
}

test('long rosters reveal a sticky search and Back restores filter, search and scroll', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, owner, longRoster)
  await page.goto(`/playgroups/${groupId}/members`)
  const search = page.getByRole('searchbox', { name: 'Mitglieder suchen' })
  await expect(search).toBeVisible()
  const list = page.getByRole('list', { name: 'Aktive Mitglieder' })
  // Long names wrap to at most two lines.
  const nameHeight = await list.getByRole('listitem').nth(3).locator('span').first().evaluate(element => element.getBoundingClientRect().height)
  const lineHeight = await list.getByRole('listitem').nth(3).locator('span').first().evaluate(element => parseFloat(getComputedStyle(element).lineHeight))
  expect(nameHeight).toBeLessThanOrEqual(lineHeight * 2 + 1)
  expect(await noHorizontalOverflow(page)).toBe(true)
  await page.getByRole('button', { name: 'Nur registrierte Nutzer' }).click()
  await search.fill('Anzeigenamen')
  await list.evaluate(element => { element.scrollTop = 400 })
  const scrolled = await list.evaluate(element => element.scrollTop)
  expect(scrolled).toBeGreaterThan(0)
  await shot(page, info, 'members-long-roster-search-390')
  const target = list.getByRole('listitem').nth(12)
  const memberId = await target.getAttribute('data-member')
  // Clicking scrolls the row into view first; the offset at activation is what Back must restore.
  await target.scrollIntoViewIfNeeded()
  const atClick = await list.evaluate(element => element.scrollTop)
  expect(atClick).toBeGreaterThan(0)
  await target.getByRole('button').first().click()
  await expect(page).toHaveURL(new RegExp(`/members/${memberId}/decks$`))
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Nur registrierte Nutzer' })).toHaveAttribute('aria-pressed', 'true')
  await expect(search).toHaveValue('Anzeigenamen')
  await expect.poll(async () => Math.abs(await list.evaluate(element => element.scrollTop) - atClick)).toBeLessThanOrEqual(1)
  await search.fill('Darth Vader')
  await expect(page.getByText('Keine Mitglieder gefunden')).toBeVisible()
  await shot(page, info, 'members-07a-no-results-390')
})

for (const width of [320, 390]) test(`ownership transfer: OWNER pending status and recipient banner above the tabs at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await mockApi(page, owner, roster.slice(0, 3), transfer)
  await page.goto(`/playgroups/${groupId}/members`)
  await expect(page.getByText('Angebot an Saruman · Antwort ausstehend')).toBeVisible()
  await shot(page, info, `members-05b-owner-pending-${width}`)

  await page.unrouteAll()
  await mockApi(page, admin, roster.slice(0, 3), transfer)
  await page.goto(`/playgroups/${groupId}/members`)
  const banner = page.getByRole('region', { name: 'Eigentümerübertragung' })
  await expect(banner).toBeVisible()
  expect((await banner.boundingBox())!.y).toBeLessThan((await page.getByRole('tablist').boundingBox())!.y)
  const decline = (await banner.getByRole('button', { name: 'Ablehnen' }).boundingBox())!
  const accept = (await banner.getByRole('button', { name: 'Annehmen' }).boundingBox())!
  expect(Math.abs(decline.width - accept.width)).toBeLessThan(1)
  expect(await noHorizontalOverflow(page)).toBe(true)
  await shot(page, info, `members-06a-recipient-banner-${width}`)
  await banner.getByRole('button', { name: 'Was bedeutet das?' }).click()
  await shot(page, info, `members-06b-info-${width}`)
  await page.getByRole('button', { name: 'Verstanden' }).click()
  await banner.getByRole('button', { name: 'Annehmen' }).click()
  await expect(page.getByRole('dialog', { name: 'Eigentümerschaft übernehmen?' })).toBeVisible()
  await shot(page, info, `members-06c-accept-confirm-${width}`)
  await page.getByRole('button', { name: 'Abbrechen' }).click()
  await page.getByRole('tab', { name: 'Statistics' }).click()
  await expect(banner).toBeVisible()
  await page.getByRole('tab', { name: 'Members' }).click()
  await page.getByRole('button', { name: 'Nur Schnellprofile' }).click()
  await expect(page.getByText('Keine Schnellprofile vorhanden')).toBeVisible()
  await shot(page, info, `members-07b-no-quick-profiles-${width}`)
  await page.getByRole('button', { name: 'Playgroup verlassen' }).click()
  await expect(page.getByRole('dialog', { name: 'Playgroup verlassen?' })).toBeVisible()
  await shot(page, info, `members-07c-leave-${width}`)
})
