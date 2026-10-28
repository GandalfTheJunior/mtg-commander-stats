import { test, expect } from '@playwright/test'

const cardId = '11111111-1111-4111-8111-111111111111'
const name = 'The Ur-Dragon'
const choice = { name, scryfallCardId: cardId, selectionRef: { scryfallCardId: cardId, gameplayFaceIndex: 1 },
  canBeSoleCommander: true, requiresChosenColor: false, colorIdentity: ['W'], thumbnailUrl: null,
  pairing: { roles: [], partnerWith: [], variants: [] } }
const art = (face: number) => ({ scryfallCardId: cardId, artworkFaceIndex: face,
  artCropUrl: `https://cards.scryfall.io/test-art-${face}.svg`, artist: `Test Artist ${face + 1}`, illustrationId: null,
  scryfallUri: 'https://scryfall.com/card/test/1' })

for (const width of [320, 375, 390, 1280]) {
  test(`static artwork, native keyboard choice and no overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 })
    const calls: string[] = []
    await page.route('**/api/**', route => {
      expect(route.request().method()).toBe('GET')
      const url = route.request().url(); calls.push(url)
      return route.fulfill({ json: url.includes('/artworks') ? [art(0), art(1)] : [choice] })
    })
    // Synthetic image only: deterministic layout test, no bundled provider bytes.
    await page.route('https://cards.scryfall.io/**', route => route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#456354"/></svg>' }))
    await page.goto('/dev/lounge.html')
    await expect(page.getByRole('button', { name: 'Auswahl bestätigen' })).toBeVisible()
    await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
    expect(calls).toHaveLength(0)
    await page.getByRole('button', { name: 'Commander-Artwork', exact: true }).click()
    const input = page.getByRole('combobox', { name: 'Commander suchen' })
    await input.fill('Ur'); await input.press('ArrowDown')
    await expect(page.getByRole('option', { name })).toBeVisible()
    await input.press('ArrowDown'); await input.press('Enter')
    const radios = page.getByRole('radio')
    await expect(radios).toHaveCount(2)
    expect(calls.find(url => url.includes('/artworks'))).toContain('gameplayFaceIndex=1')
    await radios.first().focus(); await page.keyboard.press('ArrowRight')
    await expect(radios.nth(1)).toBeChecked(); await expect(radios.nth(1)).toBeFocused()
    await expect(page.getByText('Illustration: Test Artist 2')).toBeVisible()
    const image = page.locator('.art-mount img')
    await expect(image).toBeVisible()
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(600)
    const size = await image.boundingBox()
    expect(size!.width / size!.height).toBeCloseTo(1.5, 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.locator('.commander-art').evaluate(el => el.getAnimations({ subtree: true }).filter(a => {
      const target = (a.effect as KeyframeEffect)?.target
      return target instanceof Element && !!target.closest('.art-parchment')
    }).length)).toBe(0)
    for (const box of await page.locator('.art-options label').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: info.outputPath(`artwork-${width}.png`), fullPage: true })
    await info.attach(`Synthetic layout ${width}px`, { path: info.outputPath(`artwork-${width}.png`), contentType: 'image/png' })
    await page.getByRole('button', { name: 'Die Lounge', exact: true }).click()
    await page.getByRole('button', { name: 'Commander-Artwork', exact: true }).click()
    await expect(page.getByRole('combobox')).toHaveValue('')
    await expect(page.getByRole('radio')).toHaveCount(0)
  })
}

test('401, unavailable lookup, retry and blocked image remain readable', async ({ page }, info) => {
  let stage = 401
  await page.route('**/api/**', route => route.fulfill(stage === 401 ? { status: 401, json: {} }
    : route.request().url().includes('/artworks') ? stage === 503 ? { status: 503, json: {} } : { json: [art(0)] }
      : { json: [choice] }))
  // WebKit maps blockedbyclient to Cancellation, which suppresses img.onerror.
  // A blocked response reports an image load failure in both browser engines.
  await page.route('https://cards.scryfall.io/**', route => route.abort('blockedbyresponse'))
  await page.goto('/dev/lounge.html')
  await page.getByRole('button', { name: 'Commander-Artwork', exact: true }).click()
  await page.getByRole('combobox').fill('Ur')
  await expect(page.getByRole('alert')).toContainText('Hauptanwendung')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('sign-in.png'), fullPage: true })
  stage = 503
  await page.getByRole('button', { name: 'Nach Anmeldung erneut versuchen' }).click()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name }).click()
  await expect(page.getByRole('alert')).toContainText('Scryfall is currently')
  stage = 200
  await page.getByRole('button', { name: 'Illustrationen erneut laden' }).click()
  await expect(page.locator('.art-image-fallback')).toContainText('blockiert')
  await page.getByRole('button', { name: 'Bild erneut laden' }).click()
  await expect(page.locator('.art-image-fallback')).toBeVisible()
  await expect(page.getByText('Illustration: Test Artist 1')).toBeVisible()
  await page.screenshot({ path: info.outputPath('blocked-image.png'), fullPage: true })
})
