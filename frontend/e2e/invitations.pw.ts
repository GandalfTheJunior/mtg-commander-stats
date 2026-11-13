import { expect, test, type Page, type TestInfo } from '@playwright/test'
import jsQRModule from 'jsqr'

// jsqr is CommonJS; its typings describe only the default export it also provides at runtime.
const jsQR = (jsQRModule as unknown as { default: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).default

// #200 single-use invitations with synthetic, non-sensitive API responses.
const id = (value: number) => `cccccccc-cccc-4ccc-8ccc-${String(value).padStart(12, '0')}`
const groupId = id(100)
const base = `/api/groups/${groupId}`
const code = 'AbCdEfGhIjKlMnOpQrSt_-'
const groupName = 'Friday Commander'
const owner = { id: id(1), username: 'Gandalf' }
const guest = { id: id(2), username: 'Frodo' }
type Options = { user?: typeof owner | null; preview?: number; join?: number; create?: number; previewRetryAfter?: string }

async function mockApi(page: Page, options: Options = {}) {
  const state = { user: options.user === undefined ? owner : options.user, joins: 0, creates: 0, previews: [] as Record<string, string>[] }
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/api/me') await route.fulfill(state.user ? { json: state.user } : { status: 401, json: {} })
    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
    else if (path === '/api/session' && method === 'POST') { state.user = guest; await route.fulfill({ json: guest }) }
    else if (path === '/api/users' && method === 'POST') await route.fulfill({ status: 201, json: guest })
    else if (path === `/api/invitations/${code}`) {
      state.previews.push(await request.allHeaders())
      const status = options.preview ?? 200
      await route.fulfill(status === 200 ? { json: { groupName }, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
        : { status, json: {}, headers: options.previewRetryAfter ? { 'Retry-After': options.previewRetryAfter } : {} })
    } else if (path === '/api/groups/join') {
      state.joins++
      await new Promise(resolve => setTimeout(resolve, 150))
      const status = options.join ?? 200
      await route.fulfill(status === 200 ? { json: { id: groupId, name: groupName, role: 'MEMBER' } } : { status, json: {} })
    } else if (path === `${base}/invitations` && method === 'POST') {
      state.creates++
      await new Promise(resolve => setTimeout(resolve, 150))
      const status = options.create ?? 201
      await route.fulfill(status === 201 ? { status, json: { code, expiresAt: '2026-11-13T18:40:00Z' } } : { status, json: {} })
    } else if (path === base) await route.fulfill({ json: { id: groupId, name: groupName, role: 'MEMBER',
      members: [{ userId: owner.id, username: owner.username, role: 'OWNER' }, { userId: guest.id, username: guest.username, role: 'MEMBER' }] } })
    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
    else if (path === `${base}/games/history`) await route.fulfill({ json: { games: [], nextCursor: null } })
    else if (path === `${base}/statistics`) await route.fulfill({ json: { players: [], decks: [],
      startPositions: [2, 3, 4, 5, 6].map(n => ({ playerCount: n, seats: Array.from({ length: n }, (_, i) => ({ startPosition: i + 1, games: 0, wins: 0, winRatePercent: null })) })),
      manaColors: ['W', 'U', 'B', 'R', 'G', 'C'].map(color => ({ color, games: 0, wins: 0, winRatePercent: null })) } })
    else await route.fulfill({ json: [] })
  })
  return state
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
  const fullPage = await page.getByRole('dialog').count() === 0
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}.png`, fullPage })
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
const withoutShare = (page: Page) => page.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true })
  Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true })
})
const withShare = (page: Page) => page.addInitScript(() => {
  const shared: unknown[] = []
  Object.defineProperty(window, '__shared', { value: shared })
  Object.defineProperty(Navigator.prototype, 'share', { value: (data: unknown) => { shared.push(data); return Promise.resolve() }, configurable: true })
  Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true })
})

/** Rasterize the rendered QR SVG in the page and decode its pixels like a camera would. */
async function decodeQr(page: Page) {
  const image = await page.getByRole('img', { name: 'QR-Code mit dem Einladungslink' }).evaluate(async svg => {
    const markup = new XMLSerializer().serializeToString(svg)
    const source = new Image()
    source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
    await source.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 400
    const context = canvas.getContext('2d')!
    context.drawImage(source, 0, 0, 400, 400)
    return Array.from(context.getImageData(0, 0, 400, 400).data)
  })
  return jsQR(Uint8ClampedArray.from(image), 400, 400)?.data
}

for (const width of [320, 375, 390, 1280]) {
  test(`invitation dialog, QR and share/copy at ${width}px`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    await withShare(page)
    const api = await mockApi(page)
    await page.goto(`/playgroups/${groupId}/members`)
    const trigger = page.getByRole('button', { name: /Spieler einladen/ })
    // A rapid double activation must still create only one invitation.
    await trigger.evaluate((button: HTMLElement) => { button.click(); button.click() })
    const dialog = page.getByRole('dialog', { name: 'Spieler einladen' })
    await expect(dialog.getByText('Einladung erstellt')).toBeVisible()
    expect(api.creates).toBe(1)
    await expect(dialog.getByText('Einmalig verwendbar')).toBeVisible()
    await expect(dialog.getByText(/^Gültig bis \d\d\.\d\d\., \d\d:\d\d Uhr$/)).toBeVisible()
    const share = dialog.getByRole('button', { name: 'Link teilen' })
    const copy = dialog.getByRole('button', { name: 'Link kopieren' })
    for (const control of [share, copy, dialog.getByRole('button', { name: 'QR-Code anzeigen' }), dialog.getByRole('button', { name: 'Schließen' })])
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `invite-01a-dialog-${width}`)

    await dialog.getByRole('button', { name: 'QR-Code anzeigen' }).click()
    const qr = dialog.getByRole('img', { name: 'QR-Code mit dem Einladungslink' })
    await expect(qr).toBeVisible()
    const box = (await qr.boundingBox())!
    expect(Math.abs(box.width - box.height)).toBeLessThan(1)
    expect(box.width).toBeGreaterThanOrEqual(200)
    const expected = new URL(`/invite/${code}`, baseURL).href
    expect(await decodeQr(page)).toBe(expected)
    // The dialog scrolls instead of cropping the code or its actions on short phones.
    await share.scrollIntoViewIfNeeded()
    await expect(share).toBeInViewport()
    await expect(copy).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await qr.scrollIntoViewIfNeeded()
    await shot(page, info, `invite-01b-qr-${width}`)
    await share.click()
    expect(await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([{ title: 'Playgroup-Einladung', url: expected }])
    await dialog.getByRole('button', { name: 'QR-Code ausblenden' }).click()
    await expect(qr).toHaveCount(0)
    expect(api.creates).toBe(1)
  })
}

test('without native share, copying is primary and works or falls back truthfully', async ({ page, browserName, baseURL }, info) => {
  await withoutShare(page)
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  else await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }))
  await mockApi(page)
  await page.goto(`/playgroups/${groupId}/members`)
  await page.getByRole('button', { name: /Spieler einladen/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Spieler einladen' })
  await expect(dialog.getByRole('button', { name: 'Link teilen' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Link kopieren' }).click()
  const expected = new URL(`/invite/${code}`, baseURL).href
  if (browserName === 'chromium') {
    await expect(dialog.getByText('Link kopiert')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected)
  } else {
    await expect(dialog.getByRole('textbox', { name: 'Einladungslink' })).toHaveValue(expected)
    await expect(dialog.getByText('Link kopiert')).toHaveCount(0)
  }
  await shot(page, info, `invite-01c-copy-${browserName}`)
})

test('closing and reopening issues a new invitation; keyboard operation works', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/playgroups/${groupId}/members`)
  await page.getByRole('button', { name: /Spieler einladen/ }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Spieler einladen' })
  await expect(dialog.getByText('Einladung erstellt')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Spieler einladen/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByText('Einladung erstellt')).toBeVisible()
  expect(api.creates).toBe(2)
})

test('creation failure dialog offers retry and close only', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const api = await mockApi(page, { create: 500 })
  await page.goto(`/playgroups/${groupId}/members`)
  await page.getByRole('button', { name: /Spieler einladen/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Spieler einladen' })
  await expect(dialog.getByText('Einladung konnte nicht erstellt werden')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Link|QR/ })).toHaveCount(0)
  await shot(page, info, 'invite-04d-create-failed-320')
  await dialog.getByRole('button', { name: 'Erneut versuchen' }).click()
  await expect(dialog.getByText('Einladung konnte nicht erstellt werden')).toBeVisible()
  expect(api.creates).toBe(2)
  await dialog.getByRole('button', { name: 'Schließen' }).last().click()
  await expect(dialog).toHaveCount(0)
})

for (const width of [320, 390, 1280]) {
  test(`signed-out preview, registration, required login and explicit join at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const api = await mockApi(page, { user: null })
    const document = await page.goto(`/invite/${code}`)
    expect(document!.headers()['cache-control']).toBe('no-store')
    expect(document!.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    expect(api.previews.every(headers => !('referer' in headers) && !('cookie' in headers))).toBe(true)
    await expect(page.getByText('Du bist nicht angemeldet.')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `invite-02a-signed-out-${width}`)
    await page.reload()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await page.getByRole('button', { name: 'Registrieren' }).click()
    await expect(page.locator('#auth-register-email')).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`/invite/${code}$`))
    await shot(page, info, `invite-03b-auth-${width}`)
    // An interrupted registration survives a reload on the same invitation.
    await page.reload()
    const register = page.locator('section', { has: page.getByRole('heading', { name: 'Create an account' }) })
    await register.getByLabel('Email').fill('frodo@example.test')
    await register.getByLabel('Username').fill('Frodo')
    await register.getByLabel('Password').fill('correct horse battery')
    await register.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Account created for Frodo. Sign in separately to continue.')).toBeVisible()
    const login = page.locator('section', { has: page.getByRole('heading', { name: 'Sign in' }) })
    await login.getByLabel('Email').fill('frodo@example.test')
    await login.getByLabel('Password').fill('correct horse battery')
    await login.getByRole('button', { name: 'Sign in' }).click()

    const join = page.getByRole('button', { name: 'Playgroup beitreten' })
    await expect(join).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/invite/${code}$`))
    expect(api.joins).toBe(0)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `invite-02b-signed-in-${width}`)
    await join.dblclick()
    await expect(page).toHaveURL(new RegExp(`/playgroups/${groupId}$`))
    await expect(page.getByText('Du bist der Playgroup beigetreten.')).toBeVisible()
    expect(api.joins).toBe(1)
    await shot(page, info, `invite-05-joined-${width}`)
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Overview', selected: true })).toBeVisible()
    await expect(page.getByText('Du bist der Playgroup beigetreten.')).toHaveCount(0)
  })
}

test('keyboard users reach the auth choices and Back leaves the auth detour', async ({ page }) => {
  await mockApi(page, { user: null })
  await page.goto(`/invite/${code}`)
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  const login = page.getByRole('button', { name: 'Anmelden' })
  for (let i = 0; i < 6 && !(await login.evaluate(element => element === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(login).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#auth-login-email')).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible()
})

const states: [string, Options, string, string][] = [
  ['04a-unavailable', { user: null, preview: 400 }, 'Einladung nicht verfügbar', 'Zurück zur Startseite'],
  ['04b-member', { join: 409 }, 'Du bist bereits Mitglied', 'Zu meinen Playgroups'],
  ['04c-load-failed', { user: null, preview: 503 }, 'Einladung konnte nicht geladen werden', 'Erneut versuchen'],
  ['04c-rate-limited', { user: null, preview: 429, previewRetryAfter: '60' }, 'Einladung konnte nicht geladen werden', 'Erneut versuchen'],
]
for (const [name, options, heading, action] of states) {
  test(`${name} state at 320px`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const api = await mockApi(page, options)
    await page.goto(`/invite/${code}`)
    if (options.join) await page.getByRole('button', { name: 'Playgroup beitreten' }).click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    await expect(page.getByRole(action === 'Erneut versuchen' ? 'button' : 'link', { name: action })).toBeVisible()
    if (name !== '04b-member') await expect(page.getByText(groupName)).toHaveCount(0)
    if (name === '04c-rate-limited') await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeDisabled()
    if (name === '04c-load-failed') {
      const before = api.previews.length
      await page.getByRole('button', { name: 'Erneut versuchen' }).click()
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect.poll(() => api.previews.length).toBe(before + 1)
    }
    expect(api.joins).toBe(options.join ? 1 : 0)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `invite-${name}-320`)
  })
}
