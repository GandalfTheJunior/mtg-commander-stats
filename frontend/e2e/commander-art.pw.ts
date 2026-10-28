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
    await page.route('https://cards.scryfall.io/**', route => {
      const wide = route.request().url().includes('test-art-1')
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${wide ? 900 : 600}" height="${wide ? 300 : 400}"><rect width="100%" height="100%" fill="#456354"/></svg>` })
    })
    await page.goto('/dev/lounge.html')
    await expect(page.getByRole('button', { name: 'Auswahl bestätigen' })).toBeVisible()
    await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
    expect(calls).toHaveLength(0)
    await page.getByRole('button', { name: 'Commander-Rahmen', exact: true }).click()
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
    const image = page.locator('.art-frame-opening > img')
    await expect(image).toBeVisible()
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(900)
    const size = await image.boundingBox()
    expect(size!.width / size!.height).toBeCloseTo(3, 1)
    const frame = page.locator('.art-frame')
    const frameSize = await frame.boundingBox()
    expect(frameSize!.width).toBeGreaterThan(frameSize!.height)
    await expect(frame).toHaveAttribute('data-left', 'W')
    await expect(frame).toHaveAttribute('data-right', 'W')
    expect(await image.evaluate(el => ({ filter: getComputedStyle(el).filter, transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }))).toEqual({ filter: 'none', transform: 'none', opacity: '1' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.locator('.commander-art').evaluate(el => el.getAnimations({ subtree: true }).filter(a => {
      const target = (a.effect as KeyframeEffect)?.target
      return target instanceof Element && !!target.closest('.art-frame')
    }).length)).toBe(0)
    // A different crop of the same Commander changes the opening height, not its mana finish.
    await page.keyboard.press('ArrowLeft')
    await expect(radios.first()).toBeChecked()
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(600)
    const ordinary = await image.boundingBox()
    expect(ordinary!.width / ordinary!.height).toBeCloseTo(1.5, 1)
    const dimensions = await frame.evaluate(el => ({ outer: el.getBoundingClientRect().height, image: el.querySelector('img')!.getBoundingClientRect().height, rail: parseFloat(getComputedStyle(el).paddingTop) }))
    expect(dimensions.outer - dimensions.image).toBeCloseTo(dimensions.rail * 2, 1)
    await expect(frame).toHaveAttribute('data-left', 'W')
    for (const box of await page.locator('.art-options label').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: info.outputPath(`artwork-${width}.png`), fullPage: true })
    await info.attach(`Synthetic layout ${width}px`, { path: info.outputPath(`artwork-${width}.png`), contentType: 'image/png' })
    await page.getByRole('button', { name: 'Die Lounge', exact: true }).click()
    await page.getByRole('button', { name: 'Commander-Rahmen', exact: true }).click()
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
  await page.getByRole('button', { name: 'Commander-Rahmen', exact: true }).click()
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


test('all mana finishes share the same ornament geometry and split only the frame', async ({ page }, info) => {
  const identities = [[], ['W'], ['U'], ['B'], ['R'], ['G'], ['W', 'U'], ['U', 'R'], ['B', 'G'], ['W', 'U', 'B'], ['W', 'U', 'B', 'R'], ['W', 'U', 'B', 'R', 'G']]
  let identity: string[] = []
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/artworks') ? [art(0), art(1)] : [{ ...choice, name: 'Fixture Commander', colorIdentity: identity }] }))
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="626" height="457"><rect width="626" height="457" fill="#456354"/></svg>' }))
  await page.goto('/dev/lounge.html')
  await page.getByRole('button', { name: 'Commander-Rahmen', exact: true }).click()
  let silhouette: unknown
  for (const colors of identities) {
    identity = colors
    const input = page.getByRole('combobox')
    await input.fill(''); await input.fill('Fixture')
    await page.getByRole('option', { name: 'Fixture Commander', exact: true }).click()
    const frame = page.locator('.art-frame')
    await expect(frame).toBeVisible()
    await expect.poll(() => page.locator('.art-frame-opening > img').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(626)
    const sides = !colors.length ? ['silver', 'silver'] : colors.length >= 3 ? ['gold', 'gold'] : [colors[0], colors.at(-1)!]
    await expect(frame).toHaveAttribute('data-left', sides[0])
    await expect(frame).toHaveAttribute('data-right', sides[1])
    if (!colors.length) await expect(page.locator('.art-identity')).toContainText('Farblos')
    for (const color of colors) await expect(page.locator('.art-identity')).toContainText(`(${color})`)
    const geometry = await frame.evaluate(el => ({
      width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
      corners: [...el.querySelectorAll('.frame-corner')].map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })),
      paths: [...el.querySelectorAll('defs path')].map(n => n.getAttribute('d')),
    }))
    if (silhouette) expect(geometry).toEqual(silhouette)
    else silhouette = geometry
    expect(await page.locator('.art-frame-opening > img').evaluate(el => getComputedStyle(el).filter)).toBe('none')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`frame-${colors.join('') || 'silver'}.png`), fullPage: true })
  }
})
