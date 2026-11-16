import { expect, test, type Page } from '@playwright/test'

// Temporary PR #334 historical-helper probe. Remove after CI evidence collection.
// The current regression file remains unchanged and runs alongside this probe.

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

async function reveal(page: Page, deck: Deck) {
  await region(page, deck).evaluate(element => {
    window.scrollBy(0, element.getBoundingClientRect().top - 150)
  })
}

// DOM visibility alone passes when an opaque pseudo-element paints over the glyphs.
// Only one element changes per comparison: every detail must contribute visible pixels.
async function expectDetailsPainted(page: Page, deck: Deck) {
  const area = region(page, deck)
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
      if (painted.equals(hidden)) {
        // Synthetic fixtures only; record evidence in the accessible job log.
        console.log('CI334_OLD_CAPTURE ' + JSON.stringify({ label: await element.textContent(), clip,
          current: await area.boundingBox(), element: await element.boundingBox(),
          scroll: await page.evaluate(() => ({ y: scrollY, viewportY: visualViewport?.pageTop })),
          painted: painted.toString('base64'), hidden: hidden.toString('base64') }))
      }
      expect(painted.equals(hidden), `Content must contribute visible pixels: ${await element.textContent()}`).toBe(false)
    } finally {
      await element.evaluate((node: HTMLElement, opacity) => { node.style.opacity = opacity }, original)
    }
  }
  await expect(page).toHaveURL(/\/decks$/)
}

for (let iteration = 1; iteration <= 20; iteration++) {
  test(`historical helper native touch scrolling ${iteration}`, async ({ page, browserName }) => {
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
}
