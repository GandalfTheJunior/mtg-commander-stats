import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const name = 'Esika, God of the Tree // The Prismatic Bridge'
const faces = [
  { faceIndex: 0, name: 'Esika, God of the Tree', typeLine: 'Legendary Creature — God',
    oracleText: 'Vigilance\n{T}: Add one mana of any color.\nOther legendary creatures you control have vigilance and "{T}: Add one mana of any color."' },
  { faceIndex: 1, name: 'The Prismatic Bridge', typeLine: 'Legendary Enchantment',
    oracleText: 'At the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.' },
]
function commander(index: number) {
  return { position: 1, oracleId: uid(400 + index), name, selectionRef: { scryfallCardId: uid(300 + index) },
    scryfallCardId: uid(300 + index), canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null,
    colorIdentity: ['W', 'U', 'B', 'R', 'G'], effectiveColorIdentity: ['W', 'U', 'B', 'R', 'G'],
    pairing: { roles: [], partnerWith: [], variants: [] }, artworkFaceIndex: 0,
    artCropUrl: `https://cards.scryfall.io/art_crop/0.jpg?deck=${index}`, illustrationId: null, artist: 'Johannes Voss',
    scryfallUri: 'https://scryfall.com/card/khm/168',
    cardFaces: faces.map(face => ({ ...face, imageUrl: `https://cards.scryfall.io/normal/${face.faceIndex}.jpg?deck=${index}` })) }
}
function deck(index: number) {
  return { id: uid(100 + index), name: `Deck ${index}`, commanders: [commander(index)],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'], everUsed: false, archived: false, manaBoxUrl: null, companion: null }
}
const group = { id: uid(10), name: 'Friday games', role: 'OWNER', members: [1, 2, 3, 4].map(n => ({
  userId: uid(n), username: `Player ${n}`, role: n === 1 ? 'OWNER' : 'MEMBER',
})) }
const game = { id: uid(20), groupId: group.id, creatorId: uid(1), playedOn: null, recordedAt: '2026-11-06T12:00:00Z',
  result: 'DRAW', alternateWinCon: false, winnerUserId: null, participants: [1, 2, 3, 4].map((n) => ({
    startPosition: n, placement: null, stillInGame: true, userId: uid(n), username: `Player ${n}`, deckId: deck(n).id, deck: deck(n),
  })) }

async function fixture(page: Page) {
  const apiRequests: string[] = [], images: string[] = []
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    apiRequests.push(pathname)
    const body = pathname === '/api/me' ? { id: uid(1), username: 'Player 1' }
      : pathname === '/api/decks' ? [...Array.from({ length: 12 }, (_, n) => deck(n + 1)),
        { ...deck(99), name: 'Legacy deck', commanders: [{ ...commander(99), name: 'Legacy Commander', cardFaces: null }] }]
        : pathname === '/api/groups' ? [group] : pathname === `/api/groups/${group.id}` ? group
          : pathname === `/api/groups/${group.id}/games/${game.id}` ? game : null
    await route.fulfill({ status: body === null ? 404 : 200, json: body ?? {} })
  })
  await page.route('https://cards.scryfall.io/**', async route => {
    const url = new URL(route.request().url())
    const kind = url.pathname.split('/')[1], face = url.pathname.includes('/1.jpg') ? 1 : 0
    if (kind === 'normal') images.push(url.href)
    const assetDir = process.env.MTG_CARD_EVIDENCE_IMAGES
    if (assetDir) await route.fulfill({ path: path.join(assetDir, `${kind}-${face}.jpg`), contentType: 'image/jpeg' })
    else await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" fill="#eeeeee"/></svg>' })
  })
  return { apiRequests, images }
}

async function capture(page: Page, info: TestInfo, label: string) {
  const directory = process.env.MTG_SCREENSHOTS
  const file = directory ? path.join(directory, `${info.project.name}-${label}.png`) : info.outputPath(`${label}.png`)
  await mkdir(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file, fullPage: false })
  await info.attach(label, { path: file, contentType: 'image/png' })
}

/** #239: the complete card image is inside the viewport and below the sticky header at initial open. */
async function expectWholeCardVisible(page: Page, dialog: ReturnType<Page['getByRole']>, faceName: string) {
  const image = dialog.getByRole('img', { name: `Vollständige Karte: ${faceName}` })
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
  const viewport = page.viewportSize()!
  const box = (await image.boundingBox())!, header = (await dialog.locator('h2').boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5)
  // Native aspect ratio, never cropped or stretched.
  expect(Math.abs(box.width / box.height - 488 / 680)).toBeLessThan(0.01)
  return { image, box }
}

const turnerIdle = (page: Page) => page.evaluate(() => {
  const img = document.querySelector('[role="dialog"] img')
  const wrapper = img?.parentElement
  return !!wrapper && wrapper.getAnimations().length === 0 && getComputedStyle(wrapper).transform === 'none'
})

test('own collection bounds preloading, keeps artwork editing separate and supports keyboard/fallback', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { apiRequests, images } = await fixture(page)
  await page.goto('/decks')
  // #201 cards expose the deck through their editor target; A–Z sorting puts "Deck 9" near the end.
  const editor = (deckName: string) => page.getByRole('button', { name: `${deckName} bearbeiten`, exact: true })
  await expect(editor('Deck 1')).toBeVisible()
  await expect.poll(() => images.some(url => url.endsWith('deck=1'))).toBe(true)
  expect(images.some(url => url.endsWith('deck=9'))).toBe(false)
  const card = editor('Deck 1').locator('xpath=ancestor::li[1]')
  await expect(card.getByRole('button', { name: `Artwork für ${name} ändern` })).toBeVisible()
  const trigger = card.getByRole('button', { name: `Karte anzeigen: ${name}` })
  const requestsBefore = apiRequests.length
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  const { box } = await expectWholeCardVisible(page, dialog, 'Esika, God of the Tree')
  // Wide layout: image left, real text right; flip button right-aligned directly above the image.
  const heading = (await dialog.getByRole('heading', { name: 'Esika, God of the Tree', exact: true }).boundingBox())!
  expect(heading.x).toBeGreaterThanOrEqual(box.x + box.width)
  expect(heading.y).toBeLessThan(box.y + box.height)
  const flip = dialog.getByRole('button', { name: 'Rückseite anzeigen' })
  const flipBox = (await flip.boundingBox())!
  expect(flipBox.y + flipBox.height).toBeLessThanOrEqual(box.y)
  expect(Math.abs(flipBox.x + flipBox.width - (box.x + box.width))).toBeLessThanOrEqual(1)
  await expect(dialog.getByText('Vorderseite', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toHaveCount(1)
  const close = dialog.getByRole('button', { name: 'Schließen' })
  await expect(close).toBeFocused() // Focus moves on the entered transition, so the capture is not mid-fade.
  await capture(page, info, 'card-desktop')
  await page.keyboard.press('Tab')
  await expect(flip).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  // Record the real Web Animations calls of the card turn without changing their behavior.
  await page.evaluate(() => {
    const turns: { from: string; to: string; duration: number }[] = []
    Object.assign(window, { turns })
    const animate = Element.prototype.animate
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const frames = keyframes as Keyframe[]
      turns.push({ from: String(frames[0].transform), to: String(frames.at(-1)!.transform), duration: Number((options as KeyframeAnimationOptions).duration) })
      return animate.call(this, keyframes, options)
    }
  })
  await flip.focus()
  await page.keyboard.press('Enter')
  // Two ~175 ms halves (≈350 ms): turn out to edge-on, swap the face, turn the new face in. Never past 90° (no mirroring).
  await expect.poll(() => page.evaluate(() => (window as unknown as { turns: unknown[] }).turns)).toEqual([
    { from: 'perspective(1600px) rotateY(0deg)', to: 'perspective(1600px) rotateY(90deg)', duration: 175 },
    { from: 'perspective(1600px) rotateY(-90deg)', to: 'perspective(1600px) rotateY(0deg)', duration: 175 },
  ])
  await expect(dialog.getByText('Legendary Enchantment')).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'Vollständige Karte: The Prismatic Bridge' })).toBeVisible()
  await expect(dialog.getByText('Rückseite', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Vorderseite anzeigen' })).toBeFocused()
  // Stationary final state: no lingering animation or transform on the presentation wrapper.
  await expect.poll(() => turnerIdle(page)).toBe(true)
  await capture(page, info, 'card-desktop-back')
  expect(apiRequests).toHaveLength(requestsBefore)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await editor('Deck 9').scrollIntoViewIfNeeded()
  await expect.poll(() => images.some(url => url.endsWith('deck=9'))).toBe(true)
  await page.getByRole('button', { name: 'Karte anzeigen: Legacy Commander' }).click()
  await expect(page.getByText('Kein Kartenbild gespeichert.')).toBeVisible()
  await expect(page.getByText('Regeltext nicht gespeichert.')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Schließen' })).toBeFocused()
  await expect(page.getByRole('dialog').getByRole('button', { name: /seite anzeigen/ })).toHaveCount(0)
  await capture(page, info, 'card-fallback')
  // Backdrop dismissal closes only the viewer and does not open the gallery or editor underneath.
  await page.mouse.click(4, 450)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/decks$/)
})

for (const [width, height] of [[320, 568], [375, 667], [390, 844]] as const) {
  test(`game details open the complete card without initial scrolling at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    const { apiRequests, images } = await fixture(page)
    await page.goto(`/playgroups/${group.id}/games/${game.id}`)
    await expect(page.getByRole('heading', { name: 'Spieldetails' })).toBeVisible()
    await expect.poll(() => new Set(images).size).toBe(8)
    const requestsBefore = apiRequests.length
    const trigger = page.getByRole('button', { name: `Karte anzeigen: ${name}` }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name })
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused()
    const { box } = await expectWholeCardVisible(page, dialog, 'Esika, God of the Tree')
    // Mobile order: flip row (right-aligned) above the image, real text below it.
    const flipBox = (await dialog.getByRole('button', { name: 'Rückseite anzeigen' }).boundingBox())!
    expect(flipBox.y + flipBox.height).toBeLessThanOrEqual(box.y)
    expect(flipBox.x + flipBox.width).toBeGreaterThan(width * 0.75)
    const heading = (await dialog.getByRole('heading', { name: 'Esika, God of the Tree', exact: true }).boundingBox())!
    expect(heading.y).toBeGreaterThanOrEqual(box.y + box.height)
    if (width === 390) await capture(page, info, 'card-mobile')
    if (width === 320) await capture(page, info, 'card-mobile-320')
    // A single body scrolls; the header X stays reachable while the text is revealed.
    const rules = dialog.getByText(/Other legendary creatures you control/)
    await rules.scrollIntoViewIfNeeded()
    await expect(rules).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeInViewport()
    if (width === 390) await capture(page, info, 'card-mobile-scrolled')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(apiRequests).toHaveLength(requestsBefore)
    await dialog.getByRole('button', { name: 'Schließen' }).click()
    await expect(trigger).toBeFocused()
  })
}

test('short landscape viewports keep the whole card, controls and text reachable; reduced motion flips instantly', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 844, height: 390 })
  const { apiRequests } = await fixture(page)
  await page.goto(`/playgroups/${group.id}/games/${game.id}`)
  await page.getByRole('button', { name: `Karte anzeigen: ${name}` }).first().click()
  const dialog = page.getByRole('dialog', { name })
  const requestsBefore = apiRequests.length
  const image = dialog.getByRole('img', { name: 'Vollständige Karte: Esika, God of the Tree' })
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
  const box = (await image.boundingBox())!
  expect(Math.abs(box.width / box.height - 488 / 680)).toBeLessThan(0.01)
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Rückseite anzeigen' })).toBeInViewport()
  await capture(page, info, 'card-landscape')
  await page.evaluate(() => {
    Object.assign(window, { turns: 0 })
    const animate = Element.prototype.animate
    Element.prototype.animate = function (this: Element, ...args) { (window as unknown as { turns: number }).turns++; return animate.apply(this, args) }
  })
  await dialog.getByRole('button', { name: 'Rückseite anzeigen' }).click()
  // Reduced motion: the face changes immediately and nothing animates.
  await expect(dialog.getByRole('img', { name: 'Vollständige Karte: The Prismatic Bridge' })).toBeVisible({ timeout: 100 })
  expect(await turnerIdle(page)).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { turns: number }).turns)).toBe(0)
  const rules = dialog.getByText(/At the beginning of your upkeep/)
  await rules.scrollIntoViewIfNeeded()
  await expect(rules).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(apiRequests).toHaveLength(requestsBefore)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
