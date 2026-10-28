import { expect, test, type Page } from '@playwright/test'

async function mockArtworks(page: Page, status = 200, broken = false) {
  const calls: string[] = [], names = new Map<string, string>()
  await page.route('**/api/scryfall/**', route => {
    expect(route.request().method()).toBe('GET')
    const url = new URL(route.request().url()); calls.push(url.href)
    if (status !== 200) return route.fulfill({ status, json: {} })
    if (url.pathname.includes('/artworks')) {
      const id = url.pathname.split('/')[4]
      return route.fulfill({ json: [{ scryfallCardId: id, artworkFaceIndex: null, artCropUrl: `https://cards.scryfall.io/hall-test/${id}.svg`, artist: 'Synthetic Test Artist', illustrationId: null, scryfallUri: `https://scryfall.com/card/test/${id}` }] })
    }
    const name = url.searchParams.get('q')!
    if (!names.has(name)) names.set(name, `11111111-1111-4111-8111-${String(names.size + 1).padStart(12, '0')}`)
    const id = names.get(name)!
    return route.fulfill({ json: [{ name, scryfallCardId: id, selectionRef: { scryfallCardId: id }, colorIdentity: ['U', 'B'], requiresChosenColor: false, canBeSoleCommander: true, thumbnailUrl: null, pairing: { roles: [], partnerWith: [], variants: [] } }] })
  })
  await page.route('https://cards.scryfall.io/**', route => {
    if (broken) return route.abort()
    const wide = Number(route.request().url().match(/(\d+)\.svg/)![1]) % 2 === 0
    // Original synthetic vector image at real crop dimensions. No provider bytes.
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${wide ? 900 : 600}" height="${wide ? 300 : 440}"><rect width="100%" height="100%" fill="#304c66"/><circle cx="160" cy="100" r="65" fill="#d6c28a"/><path d="M0 300L250 80L600 380H0Z" fill="#517c75"/><text x="25" y="35" fill="white" font-size="18">Synthetisches Testbild</text></svg>` })
  })
  await page.goto('/dev/lounge.html')
  await page.getByRole('button', { name: 'Die Ruhmeshalle', exact: true }).click()
  expect(calls).toHaveLength(0)
  await page.getByRole('checkbox', { name: 'Echte Commander-Artworks' }).check()
  return calls
}

for (const width of [320, 375, 390, 1280]) {
  test(`online artwork keeps native dimensions, frame identity and layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 })
    const calls = await mockArtworks(page)
    const images = page.locator('.hall-online-image')
    await expect(images).toHaveCount(6)
    await expect(page.getByText('Illustration: Synthetic Test Artist')).toHaveCount(6)
    expect(calls).toHaveLength(12)
    expect(new Set(await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('alt')))).size).toBe(6)
    await expect(page.locator('.art-frame[data-left="U"][data-right="B"]')).toHaveCount(6)
    for (const image of await images.all()) {
      await expect(image).toBeVisible()
      const style = await image.evaluate((img: HTMLImageElement) => ({ ratio: img.clientWidth / img.clientHeight, native: img.naturalWidth / img.naturalHeight, filter: getComputedStyle(img).filter, fit: getComputedStyle(img).objectFit, opacity: getComputedStyle(img).opacity }))
      expect(style.ratio).toBeCloseTo(style.native, 1)
      expect(style.filter).toBe('none'); expect(style.fit).not.toBe('cover'); expect(style.opacity).toBe('1')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`hall-online-${width}.png`), fullPage: true })
    await info.attach(`Online layout with synthetic images ${width}px`, { path: info.outputPath(`hall-online-${width}.png`), contentType: 'image/png' })
    const previous = await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('src')))
    await page.getByRole('combobox', { name: 'Schmuck für Mira' }).selectOption('crown')
    await page.getByRole('button', { name: 'Kaminlicht aus' }).click()
    await page.getByRole('button', { name: 'Neu mischen' }).click()
    await expect(page.getByText('Illustration: Synthetic Test Artist')).toHaveCount(6)
    expect((await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('src')))).every(src => !previous.includes(src))).toBe(true)
    await expect(page.getByRole('combobox', { name: 'Schmuck für Mira' })).toHaveValue('crown')
    await expect(page.getByRole('button', { name: 'Kaminlicht ein' })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('combobox', { name: 'Demowand' }).selectOption('sparse')
    await expect(page.getByText(/Freier Platz/)).toHaveCount(3)
    await expect(images).toHaveCount(3)
    await page.screenshot({ path: info.outputPath(`hall-online-sparse-${width}.png`), fullPage: true })
    await page.getByRole('checkbox', { name: 'Echte Commander-Artworks' }).uncheck()
    await expect(images).toHaveCount(0)
    await expect(page.locator('.hall-art')).toHaveCount(3)
    expect(calls).toHaveLength(24)
  })
}

for (const status of [401, 503, 200]) {
  test(`online ${status === 200 ? 'broken image' : status} retains SVG fallback`, async ({ page }, info) => {
    const calls = await mockArtworks(page, status, status === 200)
    await expect(page.getByText('Commander-Illustration nicht verfügbar · lokale Vorschau')).toHaveCount(6)
    await expect(page.locator('.hall-art')).toHaveCount(6)
    await expect(page.locator('.hall-online-image')).toHaveCount(0)
    expect(calls).toHaveLength(status === 401 ? 1 : status === 503 ? 6 : 12)
    if (status === 401) await expect(page.getByText(/Für echte Artworks über die Hauptanwendung anmelden/)).toBeVisible()
    await page.screenshot({ path: info.outputPath(`hall-online-fallback-${status}.png`), fullPage: true })
  })
}

test('late search response cannot replace a newer reroll or its mana finish', async ({ page }, info) => {
  await mockArtworks(page)
  await expect(page.getByText('Illustration: Synthetic Test Artist')).toHaveCount(6)
  let held: import('@playwright/test').Route | undefined
  let intercept = true
  await page.route('**/api/scryfall/commanders?*', route => {
    if (intercept) { intercept = false; held = route; return }
    return route.fallback()
  })
  await page.getByRole('button', { name: 'Neu mischen' }).click()
  await expect.poll(() => !!held).toBe(true)
  await expect(page.locator('.hall-art')).toHaveCount(6)
  await page.screenshot({ path: info.outputPath('hall-online-loading.png'), fullPage: true })
  await page.getByRole('button', { name: 'Neu mischen' }).click()
  await expect(page.getByText('Illustration: Synthetic Test Artist')).toHaveCount(6)
  const images = page.locator('.hall-online-image')
  const current = await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('src')))
  const name = new URL(held!.request().url()).searchParams.get('q')!
  const id = '99999999-9999-4999-8999-999999999999'
  await held!.fulfill({ json: [{ name, scryfallCardId: id, selectionRef: { scryfallCardId: id }, colorIdentity: ['R'], canBeSoleCommander: true, requiresChosenColor: false, thumbnailUrl: null, pairing: { roles: [], partnerWith: [], variants: [] } }] })
  await expect(images).toHaveCount(6)
  expect(await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('src')))).toEqual(current)
  await expect(page.locator('.art-frame[data-left="U"][data-right="B"]')).toHaveCount(6)
})
