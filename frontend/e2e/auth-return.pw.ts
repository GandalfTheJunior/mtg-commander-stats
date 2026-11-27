import { expect, test, type Page } from '@playwright/test'

// #323: synthetic sessions; no claim or join may be sent by an authentication detour.
const code = 'Qr5tUvWxYz0123456789_-'
const owner = { id: 'dddddddd-dddd-4ddd-8ddd-000000000001', username: 'Gandalf' }
const guest = { id: 'dddddddd-dddd-4ddd-8ddd-000000000002', username: 'Frodo' }
const email = 'frodo@example.test'
const password = 'correct horse battery'

async function mockSession(page: Page, signedIn = false) {
  let user: typeof owner | null = signedIn ? owner : null
  const writes: string[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (method === 'POST' || method === 'DELETE') writes.push(`${method} ${path}`)
    if (path === '/api/me') await route.fulfill(user ? { json: user } : { status: 401, json: {} })
    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
    else if (path === '/api/session' && method === 'DELETE') { user = null; await route.fulfill({ status: 204 }) }
    else if (path === '/api/session' && method === 'POST') {
      expect(request.postDataJSON()).toEqual({ email, password })
      user = guest
      await route.fulfill({ json: guest })
    } else if (path === '/api/users' && method === 'POST') await route.fulfill({ status: 201, json: guest })
    else if (path === `/api/invitations/${code}` || path === `/api/profile-invitations/${code}`)
      await route.fulfill({ json: { groupName: 'Friday Commander', profileName: 'Hairy Zombie' } })
    else throw new Error(`Unexpected request: ${method} ${path}`)
  })
  return writes
}

async function observeFirstForm(page: Page, intent: 'login' | 'register') {
  await page.evaluate(intent => {
    const observer = new MutationObserver(() => {
      const email = document.getElementById(`auth-${intent}-email`) as HTMLInputElement | null
      if (!email) return
      observer.disconnect()
      const first = { focused: document.activeElement?.id, path: location.pathname }
      document.documentElement.dataset.firstAuth = JSON.stringify(first)
      // Start entering credentials in the first microtask that can see the form.
      email.focus()
      document.execCommand('insertText', false, 'frodo@example.test')
      document.getElementById(`auth-${intent}-password`)!.focus()
    })
    observer.observe(document, { childList: true, subtree: true })
  }, intent)
}

async function enterPassword(page: Page, intent: 'login' | 'register', path: string) {
  await expect(page.locator('html')).toHaveAttribute('data-first-auth', JSON.stringify({ focused: `auth-${intent}-email`, path }))
  const field = page.locator(`#auth-${intent}-password`)
  await expect(field).toBeFocused()
  await page.keyboard.insertText(password)
  await expect(field).toHaveValue(password)
  await expect(page.locator(`#auth-${intent}-email`)).toHaveValue(email)
}

test('account-switch form is ready at first visibility, including slow Chromium navigation', async ({ page, browserName }, info) => {
  const writes = await mockSession(page, true)
  const path = `/claim/${code}`
  await page.goto(path)
  await expect(page.getByText(owner.username, { exact: true })).toBeVisible()
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  }
  await observeFirstForm(page, 'login')
  await page.getByRole('button', { name: 'Anderes Konto verwenden' }).click()
  await enterPassword(page, 'login', path)
  await page.screenshot({ path: info.outputPath('claim-sign-in-ready.png'), fullPage: true })
  // #277: the password's visibility toggle sits between the field and the submit button.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Passwort anzeigen' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText(guest.username, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(path)
  await expect(page.getByRole('button', { name: 'Profil übernehmen' })).toBeVisible()
  expect(writes).toEqual(['DELETE /api/session', 'POST /api/session'])
})

for (const prefix of ['claim', 'invite']) {
  for (const intent of ['login', 'register'] as const) {
    test(`${prefix} ${intent} focuses before first visibility and preserves keyboard, Back and auth return`, async ({ page }, info) => {
      const writes = await mockSession(page)
      const path = `/${prefix}/${code}`
      const choice = intent === 'login' ? 'Anmelden' : 'Registrieren'
      await page.goto(path)
      await expect(page.getByRole('button', { name: choice, exact: true })).toBeVisible()
      await observeFirstForm(page, intent)
      await page.getByRole('button', { name: choice, exact: true }).click()
      await enterPassword(page, intent, path)
      await page.keyboard.press('Shift+Tab')
      await expect(page.locator(`#auth-${intent}-${intent === 'login' ? 'email' : 'username'}`)).toBeFocused()
      await page.screenshot({ path: info.outputPath(`${prefix}-${intent}-ready.png`), fullPage: true })
      await page.goBack()
      await expect(page.getByRole('button', { name: choice, exact: true })).toBeVisible()
      expect(writes).toEqual([])

      await page.getByRole('button', { name: choice, exact: true }).click()
      await expect(page.locator(`#auth-${intent}-email`)).toBeFocused()
      await page.reload()
      await expect(page.locator(`#auth-${intent}-email`)).toBeFocused()
      if (intent === 'register') {
        await page.locator('#auth-register-email').fill(email)
        await page.locator('#auth-register-username').fill(guest.username)
        await page.locator('#auth-register-password').fill(password)
        await page.getByRole('button', { name: 'Konto erstellen', exact: true }).click()
        await expect(page.getByText('Konto erstellt! Melde dich jetzt an.')).toBeVisible()
        await expect(page).toHaveURL(path)
        expect(writes).toEqual(['POST /api/users'])
      }
      await page.locator('#auth-login-email').fill(email)
      await page.locator('#auth-login-password').fill(password)
      await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
      await expect(page.getByText('Anmeldung erfolgreich.', { exact: true })).toBeVisible()
      if (prefix === 'claim') await expect(page.getByText(guest.username, { exact: true })).toBeVisible()
      await expect(page).toHaveURL(path)
      await expect(page.getByRole('button', { name: prefix === 'claim' ? 'Profil übernehmen' : 'Playgroup beitreten', exact: true })).toBeVisible()
      expect(writes).toEqual(intent === 'register' ? ['POST /api/users', 'POST /api/session'] : ['POST /api/session'])
    })
  }
}
