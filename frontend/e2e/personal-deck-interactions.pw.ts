import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Synthetic owner data: exercise the production collection without provider calls or writes.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const commander = (name: string, position = 1) => ({
  name, position, oracleId: id(400 + position), scryfallCardId: id(300 + position),
  selectionRef: { scryfallCardId: id(300 + position) }, canBeSoleCommander: true,
  requiresChosenColor: false, chosenColor: null, colorIdentity: ['U', 'R'], effectiveColorIdentity: ['U', 'R'],
  pairing: { roles: [], partnerWith: [], variants: [] }, artworkFaceIndex: null,
  artCropUrl: 'https://cards.scryfall.io/synthetic.svg', illustrationId: null, artist: 'Synthetic artist', scryfallUri: null,
  cardFaces: [{ faceIndex: null, name, typeLine: 'Legendary Creature', oracleText: 'Synthetic rules.', imageUrl: null }],
})
const decks = [false, true].flatMap(archived => [false, true].flatMap(paired => [false, true].map(companion => ({
  id: id(100 + Number(archived) * 4 + Number(paired) * 2 + Number(companion)),
  name: `${archived ? 'Archived' : 'Active'} ${paired ? 'pair' : 'solo'}${companion ? ' companion' : ''}`,
  commanders: [commander('First Commander'), ...(paired ? [commander('Second Commander', 2)] : [])],
  companion: companion ? commander('Test Companion', 3) : null, colorIdentity: ['U', 'R'],
  everUsed: archived, archived, manaBoxUrl: 'https://manabox.app/decks/Synthetic_123',
}))))
type Deck = typeof decks[number]

async function fixture(page: Page) {
  await page.route('**/api/**', async route => {
    expect(route.request().method()).toBe('GET')
    const url = new URL(route.request().url()).pathname
    const body = url === '/api/me' ? { id: id(1), username: 'Owner' }
      : url === '/api/decks' ? decks : url === '/api/groups' || url.endsWith('/artworks') ? [] : null
    await route.fulfill({ status: body === null ? 404 : 200, json: body ?? {} })
  })
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220"><rect width="300" height="220" fill="#456354"/><circle cx="160" cy="80" r="45" fill="#b9d3aa"/></svg>' }))
  await page.context().route('https://manabox.app/**', route => route.fulfill({ body: 'Synthetic ManaBox destination' }))
  await page.goto('/decks')
  await expect(page.getByRole('button', { name: `${decks[0].name} bearbeiten`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Archivierte Decks', exact: true }).click()
}

const editor = (page: Page, deck: Deck) => page.getByRole('button', { name: `${deck.name} bearbeiten`, exact: true })
const region = (page: Page, deck: Deck) => editor(page, deck).locator('..')
const regionPixels = async (page: Page, deck: Deck) => page.screenshot({ clip: (await region(page, deck).boundingBox())! })

async function reveal(page: Page, deck: Deck) {
  await region(page, deck).evaluate(element => {
    window.scrollBy(0, element.getBoundingClientRect().top - 150)
  })
}

// Native touch scrolling keeps moving the page after Input.dispatchTouchEvent returns (#338).
// Wait until the scroll position is unchanged across two animation frames.
async function scrollSettled(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<boolean>(resolve => {
    const start = scrollY
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY === start)))
  })), { message: 'Scrolling must settle before pixels are compared' }).toBe(true)
}

// DOM visibility alone passes when an opaque pseudo-element paints over the glyphs.
// Only one element changes per comparison: every detail must contribute visible pixels.
async function expectDetailsPainted(page: Page, deck: Deck) {
  const area = region(page, deck)
  await scrollSettled(page)
  const elements = [
    ...deck.commanders.map(card => area.getByText(card.name, { exact: true })),
    ...(deck.companion ? [area.getByText(`Companion: ${deck.companion.name}`, { exact: true })] : []),
    area.getByText(deck.name, { exact: true }),
    area.getByRole('img', { name: 'Farbidentität: Blau, Rot' }),
    area.getByText('Deck bearbeiten', { exact: true }),
  ]
  const clip = (await area.boundingBox())!
  expect(clip.y).toBeGreaterThanOrEqual(0)
  expect(clip.y + clip.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  const painted = await page.screenshot({ clip })
  for (const element of elements) {
    await expect(element).toBeVisible()
    const original = await element.evaluate((node: HTMLElement) => {
      const opacity = node.style.opacity
      node.style.opacity = '0'
      return opacity
    })
    try {
      const hidden = await page.screenshot({ clip })
      // A moved region would compare different content, so a match or mismatch would mean nothing.
      expect(await area.boundingBox(), 'The region must not move while its pixels are compared').toEqual(clip)
      expect(painted.equals(hidden), `Content must contribute visible pixels: ${await element.textContent()}`).toBe(false)
    } finally {
      await element.evaluate((node: HTMLElement, opacity) => { node.style.opacity = opacity }, original)
    }
  }
  await expect(page).toHaveURL(/\/decks$/)
}

async function capture(page: Page, info: TestInfo, name: string) {
  const file = process.env.MTG_SCREENSHOTS
    ? path.join(process.env.MTG_SCREENSHOTS, `${info.project.name}-${name}.png`) : info.outputPath(`${name}.png`)
  await mkdir(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file })
  await info.attach(name, { path: file, contentType: 'image/png' })
}

test.describe('desktop personal deck interaction painting', () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 900 } })

  test('hover, mouseout, press and keyboard focus preserve every active/archived variant', async ({ page }, info) => {
    test.setTimeout(120_000)
    await fixture(page)
    for (const deck of decks) {
      await reveal(page, deck)
      await page.mouse.move(2, 150)
      await expectDetailsPainted(page, deck)
      const idle = await regionPixels(page, deck)
      const target = region(page, deck).getByText('Deck bearbeiten', { exact: true })
      const hoverBox = (await target.boundingBox())!
      await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2)
      expect(await editor(page, deck).evaluate(el => el.matches(':hover'))).toBe(true)
      await expectDetailsPainted(page, deck)
      const hovered = await regionPixels(page, deck)
      expect(hovered.equals(idle), 'Hover feedback must remain visible').toBe(false)
      if (deck === decks[0]) await capture(page, info, 'personal-deck-hover-desktop')
      await page.mouse.down()
      expect(await editor(page, deck).evaluate(el => el.matches(':active'))).toBe(true)
      expect((await regionPixels(page, deck)).equals(hovered), 'Pressed feedback must remain visible').toBe(false)
      await expectDetailsPainted(page, deck)
      // Release outside the target, so the pressed-state check does not navigate.
      await page.mouse.move(2, 150)
      await page.mouse.up()
      await expectDetailsPainted(page, deck)
    }
    const deck = decks[0]
    await reveal(page, deck)
    await editor(page, deck).focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(editor(page, deck)).toBeFocused()
    await expectDetailsPainted(page, deck)
    expect(await editor(page, deck).evaluate(el => getComputedStyle(el, '::after').outlineWidth)).toBe('3px')
    await capture(page, info, 'personal-deck-focus-desktop')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/decks/${deck.id}/edit`)
    await expect(page.getByRole('textbox', { name: /Deckname/ })).toHaveValue(deck.name)
  })
})

for (const width of [320, 375, 390]) {
  test(`mobile touch lifecycle, independent controls and tap at ${width}px`, async ({ page, browserName }, info) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await fixture(page)
    for (const deck of decks) {
      await reveal(page, deck)
      const target = region(page, deck).getByText('Deck bearbeiten', { exact: true })
      const box = (await target.boundingBox())!
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      if (browserName === 'chromium') {
        const session = await page.context().newCDPSession(page)
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
        await expectDetailsPainted(page, deck) // Stationary finger held through real screenshot captures.
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - 2 }] })
        await expectDetailsPainted(page, deck)
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
        await session.detach()
      } else {
        // Playwright WebKit exposes native tap only. Synthetic lifecycle events supplement
        // real pointer pressed-state checks; physical Safari long press remains manual.
        for (const type of ['touchstart', 'touchmove', 'touchend']) {
          await target.dispatchEvent(type, { touches: [], changedTouches: [] })
          await expectDetailsPainted(page, deck)
        }
        const hoverBox = (await target.boundingBox())!
        await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2)
        await page.mouse.down()
        await expectDetailsPainted(page, deck)
        await page.mouse.move(2, 150)
        await page.mouse.up()
      }
      await expectDetailsPainted(page, deck)
    }
    const deck = decks[0]
    await reveal(page, deck)
    await capture(page, info, `personal-deck-mobile-${width}`)
    const card = editor(page, deck).locator('xpath=ancestor::li[1]')
    const popupOpened = page.waitForEvent('popup')
    await card.getByRole('link', { name: /ManaBox/ }).tap()
    const popup = await popupOpened
    await expect(popup).toHaveURL(deck.manaBoxUrl)
    await popup.close()
    await expect(page).toHaveURL(/\/decks$/)
    const artwork = card.getByRole('button', { name: 'Artwork für First Commander ändern', exact: true })
    await artwork.tap()
    const gallery = page.getByRole('dialog', { name: 'Artwork für First Commander ändern', exact: true })
    await expect(gallery).toBeVisible()
    await gallery.getByRole('button', { name: 'Schließen' }).tap()
    const viewer = card.getByRole('button', { name: 'Karte anzeigen: First Commander', exact: true })
    await viewer.tap()
    const dialog = page.getByRole('dialog', { name: 'First Commander', exact: true })
    await expect(dialog.getByText('Synthetic rules.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Schließen' }).tap()
    await expectDetailsPainted(page, deck)
    // Tap the stretched region below the actual button text, not just the Commander.
    const tapBox = (await region(page, deck).getByText('Deck bearbeiten', { exact: true }).boundingBox())!
    await page.touchscreen.tap(tapBox.x + tapBox.width / 2, tapBox.y + tapBox.height / 2)
    await expect(page).toHaveURL(`/decks/${deck.id}/edit`)
    await expect(page.getByRole('textbox', { name: /Deckname/ })).toHaveValue(deck.name)
  })
}

test('native touch scrolling through and outside the edit region never opens the editor', async ({ page, browserName }) => {
  test.setTimeout(120_000)
  test.skip(browserName !== 'chromium', 'Playwright WebKit has no native touch-drag API; validate on physical Safari.')
  await fixture(page)
  const session = await page.context().newCDPSession(page)
  for (const throughContent of [false, true]) {
    const deck = decks[0]
    await reveal(page, deck)
    const area = (await region(page, deck).boundingBox())!
    const x = throughContent ? area.x + area.width / 2 : 4
    const y = area.y + Math.min(area.height - 10, 110)
    const before = await page.evaluate(() => scrollY)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await expectDetailsPainted(page, deck)
    for (const dy of [10, 30, 60]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - dy }] })
      await expectDetailsPainted(page, deck)
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before)
    await expect(page).toHaveURL(/\/decks$/)
    // A fling may carry the card out of view; bring it back to inspect the post-touch state.
    await reveal(page, deck)
    await expectDetailsPainted(page, deck)
  }
  await session.detach()
})
