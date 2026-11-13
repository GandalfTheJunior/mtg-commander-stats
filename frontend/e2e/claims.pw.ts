import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import jsQRModule from 'jsqr'

// jsqr is CommonJS; its typings describe only the default export it also provides at runtime.
const jsQR = (jsQRModule as unknown as { default: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null }).default

// #247 quick-profile claim invitations with synthetic, non-sensitive API responses.
const id = (value: number) => `dddddddd-dddd-4ddd-8ddd-${String(value).padStart(12, '0')}`
const groupId = id(100)
const profileId = id(5)
const base = `/api/groups/${groupId}`
const invitationPath = `${base}/quick-profiles/${profileId}/invitation`
const code = 'Qr5tUvWxYz0123456789_-'
const groupName = 'Friday Commander'
const profileName = 'Hairy Zombie'
const owner = { id: id(1), username: 'Gandalf' }
const guest = { id: id(2), username: 'Frodo' }
type Options = {
  user?: typeof owner | null; role?: 'OWNER' | 'ADMIN' | 'MEMBER'; active?: boolean
  create?: number | 'abort'; preview?: number; accept?: number | 'abort'; retryAfter?: string
}

async function mockApi(page: Page, options: Options = {}) {
  const state = {
    user: options.user === undefined ? owner : options.user, active: options.active ?? false, expiresAt: '2026-11-13T18:45:00Z',
    previewStatus: options.preview ?? 200, creates: 0, revokes: 0, accepts: 0, previews: [] as Record<string, string>[], tokenUrls: [] as string[],
    acceptedFor: [] as (string | undefined)[],
  }
  // Any request carrying the token is recorded to prove it never leaves the application's own API.
  // Context-wide, so several tabs share one simulated server session (cross-tab scenarios).
  page.context().on('request', request => { if (request.url().includes(code) && !new URL(request.url()).pathname.startsWith('/claim/')) state.tokenUrls.push(request.url()) })
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const status = (value: number | 'abort' | undefined, fallback: number) => value ?? fallback
    if (path === '/api/me') await route.fulfill(state.user ? { json: state.user } : { status: 401, json: {} })
    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
    else if (path === '/api/session' && method === 'POST') { state.user = guest; await route.fulfill({ json: guest }) }
    else if (path === '/api/session' && method === 'DELETE') { state.user = null; await route.fulfill({ status: 204 }) }
    else if (path === '/api/users' && method === 'POST') await route.fulfill({ status: 201, json: guest })
    else if (path === invitationPath && method === 'GET') await route.fulfill({ json: { active: state.active, expiresAt: state.active ? state.expiresAt : null } })
    else if (path === invitationPath && method === 'POST') {
      state.creates++
      await new Promise(resolve => setTimeout(resolve, 150))
      const result = status(options.create, 201)
      if (result === 'abort') { state.active = true; await route.abort('connectionreset') }
      else if (result === 201) { state.active = true; await route.fulfill({ status: 201, json: { code, expiresAt: state.expiresAt } }) }
      else await route.fulfill({ status: result, json: {} })
    } else if (path === invitationPath && method === 'DELETE') { state.revokes++; state.active = false; await route.fulfill({ status: 204 }) }
    else if (path === `/api/profile-invitations/${code}`) {
      state.previews.push(await request.allHeaders())
      const result = state.previewStatus
      await route.fulfill(result === 200 ? { json: { groupName, profileName }, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
        : { status: result, json: {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
    } else if (path === `/api/profile-invitations/${code}/accept`) {
      state.accepts++
      const expected = (request.postDataJSON() as { expectedAccountId?: string } | null)?.expectedAccountId
      state.acceptedFor.push(expected)
      await new Promise(resolve => setTimeout(resolve, 150))
      // Like the backend (#247): only the confirmed account may claim.
      if (!state.user) { await route.fulfill({ status: 401, json: {} }); return }
      if (expected !== state.user.id) { await route.fulfill({ status: 409, json: { status: 409, code: 'PROFILE_CLAIM_ACCOUNT_MISMATCH' } }); return }
      const result = state.accepts === 1 ? status(options.accept, 204) : 204
      if (result === 'abort') await route.abort('connectionreset')
      else await route.fulfill(result === 204 ? { status: 204 }
        : { status: result, json: result === 409 ? { status: 409, code: 'PROFILE_CLAIM_SAME_GAME' } : {}, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} })
    } else if (path === base) await route.fulfill({ json: { id: groupId, name: groupName, role: options.role ?? 'OWNER', members: [
      { userId: owner.id, username: owner.username, role: 'OWNER' },
      { userId: id(3), username: 'Aragorn', role: 'MEMBER' },
      { userId: profileId, username: profileName, role: 'MEMBER', quickProfile: true },
    ] } })
    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
    else if (path === '/api/groups') await route.fulfill({ json: state.accepts ? [{ id: groupId, name: groupName, role: 'MEMBER' }] : [] })
    else await route.fulfill({ json: [] })
  })
  return state
}

async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
  const fullPage = await page.getByRole('dialog').count() === 0
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage })
  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}-${info.project.name}.png`, fullPage })
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
const withShare = (page: Page) => page.addInitScript(() => {
  const shared: unknown[] = []
  Object.defineProperty(window, '__shared', { value: shared })
  Object.defineProperty(Navigator.prototype, 'share', { value: (data: unknown) => { shared.push(data); return Promise.resolve() }, configurable: true })
  Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true })
})
async function touchTargets(controls: Locator[]) {
  for (const control of controls) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
}
/** The dialog stays inside the viewport and no content overflows it; text inputs scroll their own value by design. */
async function fitsWidth(page: Page, dialog: Locator) {
  const box = (await dialog.boundingBox())!
  const width = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(await dialog.evaluate(element => [...element.querySelectorAll(':not(input)')].filter(child => !(child.scrollWidth <= child.clientWidth + 1 || getComputedStyle(child).overflowX !== 'visible')).map(child => `${child.tagName}.${child.className} ${child.scrollWidth}/${child.clientWidth}`))).toEqual([])
  expect(await noHorizontalOverflow(page)).toBe(true)
}

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

async function openIssuer(page: Page) {
  await page.goto(`/playgroups/${groupId}/members`)
  await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
  await page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }).click()
  return page.getByRole('dialog', { name: 'Profilübernahme einladen' })
}

// ---------------------------------------------------------------- wireframes 01–03: issuer

for (const width of [320, 375, 390, 1280]) {
  test(`01–03 status, created link, QR and confirmations at ${width}px`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    await withShare(page)
    const api = await mockApi(page)
    const dialog = await openIssuer(page)
    expect(page.url()).toMatch(/\/members$/)
    await expect(dialog.getByText('Keine aktive Einladung')).toBeVisible()
    const create = dialog.getByRole('button', { name: 'Einladung erstellen' })
    await touchTargets([create, dialog.getByRole('button', { name: 'Schließen' }).last()])
    await fitsWidth(page, dialog)
    await shot(page, info, `claim-01a-no-invitation-${width}`)

    // A rapid double activation still issues exactly one POST.
    await create.evaluate((button: HTMLElement) => { button.click(); button.click() })
    await expect(dialog.getByText('Neue Einladung erstellt')).toBeVisible()
    expect(api.creates).toBe(1)
    const expected = new URL(`/claim/${code}`, baseURL).href
    await expect(dialog.getByRole('textbox', { name: 'Einladungslink' })).toHaveValue(expected)
    expect(await dialog.getByRole('textbox', { name: 'Einladungslink' }).evaluate(input => getComputedStyle(input).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    await expect(dialog.getByText(/^Gültig bis \d\d\.\d\d\., \d\d:\d\d Uhr$/)).toBeVisible()
    const share = dialog.getByRole('button', { name: 'Teilen' })
    const copy = dialog.getByRole('button', { name: 'Link kopieren' })
    const toggle = dialog.getByRole('button', { name: 'QR-Code anzeigen' })
    await touchTargets([share, copy, toggle])
    await fitsWidth(page, dialog)
    await shot(page, info, `claim-02a-link-created-${width}`)

    await toggle.click()
    const qr = dialog.getByRole('img', { name: 'QR-Code mit dem Einladungslink' })
    await expect(qr).toBeVisible()
    const box = (await qr.boundingBox())!
    expect(Math.abs(box.width - box.height)).toBeLessThan(1)
    expect(box.width).toBeGreaterThanOrEqual(200)
    expect(await decodeQr(page)).toBe(expected)
    await share.click()
    expect(await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([{ title: 'Profilübernahme', url: expected }])
    await qr.scrollIntoViewIfNeeded()
    await fitsWidth(page, dialog)
    await shot(page, info, `claim-02b-qr-open-${width}`)

    // Close, reopen: only the status remains; the code is gone for good.
    await dialog.getByRole('button', { name: 'Schließen' }).last().click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Aktionen für ${profileName}` })).toBeFocused()
    await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
    await page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' }).click()
    await expect(dialog.getByText('Aktive Einladung')).toBeVisible()
    await expect(dialog.getByText('Der bestehende Link kann nicht erneut angezeigt werden.')).toBeVisible()
    expect(await page.content()).not.toContain(code)
    await touchTargets([dialog.getByRole('button', { name: 'Neue Einladung erstellen' }), dialog.getByRole('button', { name: 'Einladung widerrufen' })])
    await fitsWidth(page, dialog)
    await shot(page, info, `claim-01b-active-${width}`)

    await dialog.getByRole('button', { name: 'Neue Einladung erstellen' }).click()
    const replace = page.getByRole('dialog', { name: 'Einladung ersetzen?' })
    await expect(replace.getByText(profileName)).toBeVisible()
    await fitsWidth(page, replace)
    await shot(page, info, `claim-03a-replace-${width}`)
    await page.keyboard.press('Escape')
    await expect(replace).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Neue Einladung erstellen' })).toBeFocused()

    await dialog.getByRole('button', { name: 'Einladung widerrufen' }).click()
    const revoke = page.getByRole('dialog', { name: 'Einladung widerrufen?' })
    await expect(revoke.getByText('Das Schnellprofil, seine Decks und seine Spiele bleiben unverändert.')).toBeVisible()
    await fitsWidth(page, revoke)
    await shot(page, info, `claim-03b-revoke-${width}`)
    await revoke.getByRole('button', { name: 'Einladung widerrufen' }).click()
    await expect(dialog.getByText('Keine aktive Einladung')).toBeVisible()
    expect(api.creates).toBe(1)
    expect(api.revokes).toBe(1)
    expect(api.tokenUrls).toEqual([])
  })
}

test('an ADMIN manages claims, a MEMBER never sees the entry; row navigation stays separate', async ({ page }) => {
  await mockApi(page, { role: 'MEMBER' })
  await page.goto(`/playgroups/${groupId}/members`)
  await page.getByRole('button', { name: `Aktionen für ${profileName}` }).click()
  await expect(page.getByRole('menuitem', { name: 'Deck erstellen' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Zur Profilübernahme einladen' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: new RegExp(`^${profileName}`) }).click()
  await expect(page).toHaveURL(new RegExp(`/members/${profileId}/decks$`))
})

test('a device clock past the expiry never hides an active invitation or skips the replace confirmation', async ({ page }) => {
  // PR #309 review (P3): the device clock is one hour past the invitation's expiry; the server still reports it active.
  await page.clock.install({ time: new Date('2026-11-13T19:45:00Z') })
  const api = await mockApi(page, { active: true })
  const dialog = await openIssuer(page)
  await expect(dialog.getByText('Aktive Einladung')).toBeVisible()
  await page.clock.runFor(1_000)
  await expect(dialog.getByText('Aktive Einladung')).toBeVisible()
  await expect(dialog.getByText(/abgelaufen|nicht mehr aktiv/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Einladung erstellen', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Neue Einladung erstellen' }).click()
  await expect(page.getByRole('dialog', { name: 'Einladung ersetzen?' })).toBeVisible()
  expect(api.creates).toBe(0)
})

test('an ambiguous creation shows no link and recovers only through a status check', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await mockApi(page, { active: true, create: 'abort' })
  const dialog = await openIssuer(page)
  await dialog.getByRole('button', { name: 'Neue Einladung erstellen' }).click()
  await page.getByRole('dialog', { name: 'Einladung ersetzen?' }).getByRole('button', { name: 'Neuen Link erstellen' }).click()
  await expect(dialog.getByText('Erstellung nicht bestätigt')).toBeVisible()
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await shot(page, info, 'claim-ambiguous-create-390')
  await dialog.getByRole('button', { name: 'Status prüfen' }).click()
  await expect(dialog.getByText('Aktive Einladung')).toBeVisible()
  expect(api.creates).toBe(1)
})

// ---------------------------------------------------------------- wireframes 04–05: public preview and confirmation

for (const width of [320, 375, 390, 1280]) {
  test(`04–05 signed-out preview, registration, login return, confirmation and success at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    const api = await mockApi(page, { user: null })
    const document = await page.goto(`/claim/${code}`)
    expect(document!.headers()['cache-control']).toBe('no-store')
    expect(document!.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await expect(page.getByText(profileName)).toBeVisible()
    expect(api.previews.every(headers => !('referer' in headers) && !('cookie' in headers))).toBe(true)
    await touchTargets([page.getByRole('button', { name: 'Anmelden' }), page.getByRole('button', { name: 'Registrieren' })])
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `claim-04a-signed-out-${width}`)
    await page.reload()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await page.getByRole('button', { name: 'Registrieren' }).click()
    await expect(page.locator('#auth-register-email')).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`/claim/${code}$`))
    await expect(page.getByRole('heading', { name: 'Profilübernahme' })).toBeVisible()
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

    const start = page.getByRole('button', { name: 'Profil übernehmen' })
    await expect(start).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/claim/${code}$`))
    await expect(page.getByText(guest.username, { exact: true })).toBeVisible()
    expect(api.accepts).toBe(0)
    await touchTargets([start, page.getByRole('link', { name: 'Nicht übernehmen' }), page.getByRole('button', { name: 'Anderes Konto verwenden' })])
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `claim-04b-signed-in-${width}`)

    await start.click()
    const confirm = page.getByRole('dialog', { name: 'Schnellprofil übernehmen?' })
    await expect(confirm.getByText(`Playgroup: ${groupName}`)).toBeVisible()
    await fitsWidth(page, confirm)
    await touchTargets([confirm.getByRole('button', { name: 'Jetzt übernehmen' }), confirm.getByRole('button', { name: 'Abbrechen' })])
    await shot(page, info, `claim-05-confirmation-${width}`)
    expect(api.accepts).toBe(0)
    await confirm.getByRole('button', { name: 'Jetzt übernehmen' }).dblclick()
    await expect(page).toHaveURL(/\/playgroups$/)
    await expect(page.getByText('Schnellprofil erfolgreich übernommen.')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Profilübernahme' })).toHaveCount(0)
    await expect(page.getByText(groupName, { exact: true })).toBeVisible()
    expect(api.accepts).toBe(1)
    await shot(page, info, `claim-success-playgroups-${width}`)
    expect(api.tokenUrls.every(url => new URL(url).pathname.startsWith('/api/profile-invitations/'))).toBe(true)
  })
}

test('Nicht übernehmen, browser Back and reload never accept; keyboard reaches the choices', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/claim/${code}`)
  const start = page.getByRole('button', { name: 'Profil übernehmen' })
  await expect(start).toBeVisible()
  await start.focus()
  await page.keyboard.press('Enter')
  const confirm = page.getByRole('dialog', { name: 'Schnellprofil übernehmen?' })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(start).toBeFocused()
  await page.getByRole('link', { name: 'Nicht übernehmen' }).click()
  await expect(page).toHaveURL(/\/playgroups$/)
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Profil übernehmen' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Profil übernehmen' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/playgroups$/)
  expect(api.accepts).toBe(0)
})

test('Bob/Carol: a sign-in switch in another tab before Jetzt übernehmen sends no accept', async ({ page }, info) => {
  // PR #309 security review, reproduced with two real tabs of one browser profile.
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await mockApi(page)
  await page.goto(`/claim/${code}`)
  await page.getByRole('button', { name: 'Profil übernehmen' }).click()
  const confirm = page.getByRole('dialog', { name: 'Schnellprofil übernehmen?' })
  await expect(confirm.getByText(owner.username, { exact: true })).toBeVisible()

  const other = await page.context().newPage()
  await other.goto(`/claim/${code}`)
  await other.getByRole('button', { name: 'Anderes Konto verwenden' }).click()
  const login = other.locator('section', { has: other.getByRole('heading', { name: 'Sign in' }) })
  await login.getByLabel('Email').fill('frodo@example.test')
  await login.getByLabel('Password').fill('correct horse battery')
  await login.getByRole('button', { name: 'Sign in' }).click()
  await expect(other.getByText(guest.username, { exact: true })).toBeVisible()

  await page.bringToFront()
  await confirm.getByRole('button', { name: 'Jetzt übernehmen' }).click()
  await expect(page.getByText('Das angemeldete Konto hat sich geändert. Es wurde nichts übernommen. Prüfe das Konto und bestätige erneut.')).toBeVisible()
  await expect(page.getByText(guest.username, { exact: true })).toBeVisible()
  await expect(page.getByText(owner.username, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/claim/${code}$`))
  expect(api.accepts).toBe(0)
  expect(await noHorizontalOverflow(page)).toBe(true)
  await shot(page, info, 'claim-account-changed-390')

  // The new account confirms for itself; the request names that account.
  await page.getByRole('button', { name: 'Profil übernehmen' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Jetzt übernehmen' }).click()
  await expect(page.getByText('Schnellprofil erfolgreich übernommen.')).toBeVisible()
  expect(api.acceptedFor).toEqual([guest.id])
})

test('Anderes Konto verwenden returns to the same link for another account', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto(`/claim/${code}`)
  await expect(page.getByText(owner.username, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Anderes Konto verwenden' }).click()
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Sign in' }) })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/claim/${code}$`))
  const login = page.locator('section', { has: page.getByRole('heading', { name: 'Sign in' }) })
  await login.getByLabel('Email').fill('frodo@example.test')
  await login.getByLabel('Password').fill('correct horse battery')
  await login.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(guest.username, { exact: true })).toBeVisible()
  await expect(page.getByText(owner.username, { exact: true })).toHaveCount(0)
  expect(api.accepts).toBe(0)
})

// ---------------------------------------------------------------- wireframes 06–07: errors

const states: [string, Options, string][] = [
  ['06a-same-game-409', { accept: 409 }, 'Übernahme noch nicht möglich'],
  ['06b-ambiguous-accept', { accept: 'abort' }, 'Übernahme konnte nicht bestätigt werden'],
  ['07a-unavailable-400', { preview: 400 }, 'Einladung nicht verfügbar'],
  ['07b-transient', { preview: 503 }, 'Einladung konnte nicht geladen werden'],
  ['07c-rate-limit-429', { preview: 429, retryAfter: '60' }, 'Bitte später erneut versuchen'],
  ['07c-accept-rate-limit-429', { accept: 429, retryAfter: '60' }, 'Bitte später erneut versuchen'],
]
for (const [name, options, heading] of states) {
  for (const width of [320, 1280]) {
    test(`${name} state at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const api = await mockApi(page, options)
      await page.goto(`/claim/${code}`)
      if (options.accept) {
        await page.getByRole('button', { name: 'Profil übernehmen' }).click()
        await page.getByRole('dialog').getByRole('button', { name: 'Jetzt übernehmen' }).click()
      }
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(page.getByRole('heading', { name: heading })).toBeFocused()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      if (name !== '06a-same-game-409') await expect(page.getByText(groupName)).toHaveCount(0)
      if (name.startsWith('07c')) await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeDisabled()
      expect(await noHorizontalOverflow(page)).toBe(true)
      await shot(page, info, `claim-${name}-${width}`)
      if (name === '06a-same-game-409' || name === '06b-ambiguous-accept') {
        // Recovery is a read-only preview GET; a new accept needs a new confirmation.
        const previews = api.previews.length
        await page.getByRole('button', { name: name.startsWith('06a') ? 'Erneut prüfen' : 'Einladung erneut prüfen' }).click()
        await expect(page.getByRole('button', { name: 'Profil übernehmen' })).toBeVisible()
        expect(api.previews.length).toBe(previews + 1)
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
      if (name === '07b-transient') {
        api.previewStatus = 200
        await page.getByRole('button', { name: 'Erneut versuchen' }).click()
        await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
      }
      expect(api.accepts).toBe(options.accept ? 1 : 0)
    })
  }
}
