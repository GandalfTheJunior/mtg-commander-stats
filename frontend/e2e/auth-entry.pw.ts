import { expect, test, type Page, type TestInfo } from '@playwright/test'

// #277 signed-out entry with synthetic API responses; demo credentials only.
const email = 'frodo@example.test'
const password = 'correct horse battery'
const guest = { id: 'eeeeeeee-eeee-4eee-8eee-000000000002', username: 'Frodo' }
const focusRing = 'rgb(219, 185, 119)'

// Screenshots are delivered to the PO; render them sharply.
test.use({ deviceScaleFactor: 2 })

type Me = 'signed-out' | 'unavailable' | 'held' | 'expired'
async function mockApi(page: Page, me: Me = 'signed-out') {
  const state = { me, writes: [] as string[], release: () => {} }
  const held = new Promise<void>(resolve => { state.release = resolve })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (method !== 'GET') state.writes.push(`${method} ${path}`)
    if (path === '/api/me') {
      if (state.me === 'held') await held
      if (state.me === 'unavailable') return route.fulfill({ status: 503, json: { detail: 'Unavailable' } })
      if (state.me === 'expired') return route.fulfill({ json: guest })
      return route.fulfill({ status: 401, json: {} })
    }
    if (path === '/api/decks' && state.me === 'expired') return route.fulfill({ status: 401, json: {} })
    if (path === '/api/csrf') return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
    if (path === '/api/session' && method === 'POST') return route.fulfill({ status: 401, json: { detail: 'Invalid credentials.' } })
    if (path === '/api/users' && method === 'POST') {
      const body = request.postDataJSON() as { username: string }
      return body.username === 'Taken'
        ? route.fulfill({ status: 409, json: { detail: 'Username is already taken.', errors: [{ field: 'username', code: 'USERNAME_TAKEN' }] } })
        : route.fulfill({ status: 201, json: guest })
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })
  return state
}

async function shot(page: Page, info: TestInfo, name: string) {
  // The session-check spinner animates indefinitely; `animations: 'disabled'` settles everything for capture.
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' })
  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}.png`, fullPage: true, animations: 'disabled' })
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
const entry = (page: Page) => page.getByRole('region', { name: /Willkommen zurück!|Konto erstellen/ })

for (const width of [320, 375, 390, 1280]) {
  test(`sign-in and registration form a single full-width column at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width < 1000 ? 720 : 900 })
    const api = await mockApi(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Willkommen zurück!' })).toBeVisible()
    await expect(page.getByText('Deine Commander-Runden, Decks und Statistiken an einem Ort.')).toBeVisible()
    await expect(page.locator('form')).toHaveCount(1)
    expect(await noHorizontalOverflow(page)).toBe(true)

    const card = (await entry(page).boundingBox())!
    if (width >= 1000) {
      // Desktop keeps the same hierarchy in a centered, width-constrained column.
      expect(card.width).toBeLessThanOrEqual(440)
      expect(Math.abs(card.x - (width - card.x - card.width))).toBeLessThanOrEqual(2)
    } else {
      expect(card.width).toBeGreaterThanOrEqual(width - 32 - 1)
    }
    const field = (await entry(page).getByLabel('E-Mail').locator('xpath=ancestor::div[contains(@class,"MuiTextField-root")]').boundingBox())!
    const submit = (await entry(page).getByRole('button', { name: 'Anmelden', exact: true }).boundingBox())!
    expect(Math.abs(field.width - submit.width)).toBeLessThanOrEqual(1)
    for (const target of [submit, (await entry(page).getByRole('button', { name: 'Passwort anzeigen' }).boundingBox())!,
      (await entry(page).getByRole('button', { name: 'Noch kein Konto? Registrieren' }).boundingBox())!]) {
      expect(target.height).toBeGreaterThanOrEqual(44)
    }
    await shot(page, info, `auth-01-sign-in-${width}`)

    await entry(page).getByRole('button', { name: 'Noch kein Konto? Registrieren' }).click()
    await expect(page.getByRole('heading', { name: 'Konto erstellen' })).toBeFocused()
    await expect(page.locator('form')).toHaveCount(1)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `auth-02-register-${width}`)
    expect(api.writes).toEqual([])
  })
}

test('keyboard order, visible focus and Enter submission with a generic failure that keeps input', async ({ page }, info) => {
  const api = await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Willkommen zurück!' })).toBeVisible()
  const order = ['auth-login-email', 'auth-login-password', 'Passwort anzeigen', 'Anmelden', 'Noch kein Konto? Registrieren']
  const seen: string[] = []
  for (let step = 0; step < order.length; step++) {
    await page.keyboard.press('Tab')
    seen.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || ''))
  }
  expect(seen).toEqual(order)

  await page.locator('#auth-login-email').focus()
  // The focused field shows the shared focus ring.
  await expect(entry(page).locator('.MuiOutlinedInput-root.Mui-focused')).toHaveCSS('outline-color', focusRing)
  await page.keyboard.insertText(email)
  await page.keyboard.press('Tab')
  await page.keyboard.insertText(password)
  await expect(page.locator('#auth-login-password')).toHaveAttribute('type', 'password')
  await page.keyboard.press('Enter')
  const alert = entry(page).getByRole('alert')
  await expect(alert).toHaveText('Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.')
  await expect(page.locator('#auth-login-email')).toHaveValue(email)
  await expect(page.locator('#auth-login-password')).toHaveValue(password)
  expect(await page.content()).not.toContain(password)
  expect(api.writes).toEqual(['POST /api/session'])
  await shot(page, info, 'auth-05-login-failed-390')
})

test('registration shows an inline conflict, then returns to sign-in with only the email', async ({ page }, info) => {
  const api = await mockApi(page)
  await page.goto('/')
  await entry(page).getByRole('button', { name: 'Noch kein Konto? Registrieren' }).click()
  await page.locator('#auth-register-email').fill(email)
  await page.locator('#auth-register-username').fill('Taken')
  await page.locator('#auth-register-password').fill(password)
  await entry(page).getByRole('button', { name: 'Konto erstellen', exact: true }).click()
  const username = page.locator('#auth-register-username')
  await expect(username).toBeFocused()
  await expect(username).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Dieser Benutzername ist bereits vergeben.')).toBeVisible()
  await shot(page, info, 'auth-02b-register-conflict-390')

  await username.fill(guest.username)
  await entry(page).getByRole('button', { name: 'Konto erstellen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Willkommen zurück!' })).toBeVisible()
  await expect(entry(page).getByRole('status')).toHaveText('Konto erstellt! Melde dich jetzt an.')
  await expect(page.locator('#auth-login-email')).toHaveValue(email)
  await expect(page.locator('#auth-login-password')).toHaveValue('')
  await expect(page.locator('#auth-login-password')).toBeFocused()
  expect(api.writes).toEqual(['POST /api/users', 'POST /api/users'])
  await shot(page, info, 'auth-03-registered-390')
})

test('session check, unverified retry and known expiry states', async ({ page }, info) => {
  const api = await mockApi(page, 'held')
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Sitzung wird geprüft …')
  await expect(page.locator('form')).toHaveCount(0)
  await shot(page, info, 'auth-04a-checking-390')
  api.me = 'unavailable'
  api.release()
  await expect(page.getByRole('heading', { name: 'Sitzung konnte nicht überprüft werden.' })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await shot(page, info, 'auth-04b-unverified-390')
  api.me = 'signed-out'
  await page.getByRole('button', { name: 'Erneut prüfen' }).click()
  await expect(page.getByRole('heading', { name: 'Willkommen zurück!' })).toBeVisible()
  await expect(page.getByText(/abgelaufen/)).toHaveCount(0)

  api.me = 'expired'
  await page.goto('/decks')
  await expect(entry(page).getByRole('alert')).toHaveText('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.')
  await shot(page, info, 'auth-04c-expired-390')
})

test('a short viewport keeps the focused field visible and scrollable', async ({ page }) => {
  // Approximates an open software keyboard on the narrowest supported phone.
  await page.setViewportSize({ width: 320, height: 300 })
  await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Willkommen zurück!' })).toBeVisible()
  await page.locator('#auth-login-password').focus()
  await expect(page.locator('#auth-login-password')).toBeInViewport()
  expect(await noHorizontalOverflow(page)).toBe(true)
})
