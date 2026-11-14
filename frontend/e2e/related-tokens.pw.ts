import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// #235 browser coverage. Synthetic snapshots modelled on the PO's acceptance examples; images are labelled SVG stand-ins.
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const normal = (key: string) => `https://cards.scryfall.io/normal/front/${key}.jpg`
const token = (n: number, name: string, typeLine: string) => ({ scryfallCardId: uid(500 + n), name, typeLine, imageUrl: normal(`token-${n}`),
  layout: 'token', cardFaces: [{ faceIndex: null, name, typeLine, oracleText: '', imageUrl: normal(`token-${n}`) }] })
const food = token(1, 'Food', 'Token Artifact — Food')
const coil = token(2, "Koma's Coil", 'Token Creature — Serpent')
const extra = [token(3, 'Treasure', 'Token Artifact — Treasure'), token(4, 'Clue', 'Token Artifact — Clue'), token(5, 'Blood', 'Token Artifact — Blood')]
const SORIN = 'Sorin of House Markov // Sorin, Ravenous Neonate'
const KOMA = 'Koma, Cosmos Serpent'

function commander(n: number, name: string, cardFaces: object[] | null, relatedTokens: object[] | null) {
  return { position: 1, oracleId: uid(400 + n), name, selectionRef: { scryfallCardId: uid(300 + n) }, scryfallCardId: uid(300 + n),
    canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: ['B'], effectiveColorIdentity: ['B'],
    pairing: { roles: [], partnerWith: [], variants: [] }, artworkFaceIndex: 0, artCropUrl: normal(`art-${n}`).replace('/normal/', '/art_crop/'),
    illustrationId: null, artist: null, scryfallUri: null, cardFaces, relatedTokens }
}
const sorin = (tokens: object[] = [food]) => commander(1, SORIN, [
  { faceIndex: 0, name: 'Sorin of House Markov', typeLine: 'Legendary Creature — Human Warlock',
    oracleText: 'Lifelink\nAt the beginning of your postcombat main phase, if you gained 3 or more life this turn, exile Sorin of House Markov and return him to the battlefield transformed under his owner’s control.', imageUrl: normal('sorin-0') },
  { faceIndex: 1, name: 'Sorin, Ravenous Neonate', typeLine: 'Legendary Planeswalker — Sorin',
    oracleText: 'Extort\n+2: Create a Food token.\n−1: Sorin, Ravenous Neonate deals damage equal to the amount of life you gained this turn to any target.\n−6: Gain control of target creature. It becomes a Vampire in addition to its other types. Put a lifelink counter on it if you control a white permanent other than that creature or Sorin.', imageUrl: normal('sorin-1') },
], tokens)
const koma = (tokens: object[] = [coil]) => commander(2, KOMA, [{ faceIndex: null, name: KOMA, typeLine: 'Legendary Creature — Serpent',
  oracleText: 'This spell can’t be countered.\nAt the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma’s Coil.\nSacrifice another Serpent: Choose one —\n• Tap target permanent. Its activated abilities can’t be activated this turn.\n• Koma, Cosmos Serpent gains indestructible until end of turn.', imageUrl: normal('koma') }], tokens)
const deck = (n: number, card: object) => ({ id: uid(100 + n), name: `Deck ${n}`, commanders: [card], colorIdentity: ['B'], everUsed: false,
  archived: false, manaBoxUrl: null, companion: null })
const group = { id: uid(10), name: 'Friday games', role: 'OWNER', members: [1, 2].map(n => ({ userId: uid(n), username: `Player ${n}`, role: n === 1 ? 'OWNER' : 'MEMBER' })) }
const game = { id: uid(20), groupId: group.id, creatorId: uid(1), playedOn: null, recordedAt: '2026-11-06T12:00:00Z', result: 'DRAW',
  alternateWinCon: false, winnerUserId: null, participants: [sorin(), koma()].map((card, index) => ({ startPosition: index + 1, placement: null,
    stillInGame: true, userId: uid(index + 1), username: `Player ${index + 1}`, deckId: deck(index + 1, card).id, deck: deck(index + 1, card) })) }

const label = (key: string) => key.startsWith('token-') ? [food, coil, ...extra].find(entry => entry.imageUrl === normal(key))!.name + ' (Token)'
  : ({ 'sorin-0': 'Sorin of House Markov', 'sorin-1': 'Sorin, Ravenous Neonate', koma: KOMA } as Record<string, string>)[key] ?? key
const svg = (text: string, fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680">
  <rect width="488" height="680" rx="24" fill="#171314"/><rect x="18" y="18" width="452" height="644" rx="14" fill="${fill}"/>
  <text x="244" y="330" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#222">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
  <text x="244" y="370" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#555">synthetic test image</text></svg>`

async function fixture(page: Page) {
  const apiRequests: string[] = [], tokenImages: string[] = []
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    apiRequests.push(pathname)
    const body = pathname === '/api/me' ? { id: uid(1), username: 'Player 1' }
      : pathname === '/api/decks' ? [deck(1, sorin()), deck(2, koma([coil, ...extra])), deck(3, commander(3, 'Pending Commander', null, null)),
        deck(4, commander(4, 'Resolved Without Tokens', null, []))]
        : pathname === '/api/groups' ? [group] : pathname === `/api/groups/${group.id}` ? group
          : pathname === `/api/groups/${group.id}/games/${game.id}` ? game
            : pathname === `/api/groups/${group.id}/members/${uid(2)}/decks` ? [deck(2, koma())].map(({ id, name, commanders, colorIdentity, companion }) =>
              ({ id, name, commanders, colorIdentity, companion })) : null
    await route.fulfill({ status: body === null ? 404 : 200, json: body ?? {} })
  })
  await page.route('https://cards.scryfall.io/**', async route => {
    const key = path.basename(new URL(route.request().url()).pathname, '.jpg')
    if (key.startsWith('token-')) tokenImages.push(key)
    await route.fulfill({ contentType: 'image/svg+xml', body: svg(label(key), key.startsWith('token-') ? '#cfe3f3' : '#e9e3d6') })
  })
  return { apiRequests, tokenImages }
}

/** Wait for the accordion's collapse/chevron transitions so captures and scroll positions reflect the final state. */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'))

async function capture(page: Page, info: TestInfo, name: string) {
  await settled(page)
  const directory = process.env.MTG_SCREENSHOTS
  const file = directory ? path.join(directory, `${info.project.name}-${name}.png`) : info.outputPath(`${name}.png`)
  await mkdir(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file })
  await info.attach(name, { path: file, contentType: 'image/png' })
}

const summary = (dialog: Locator) => dialog.getByRole('button', { name: /^Zugehörige Tokens \(\d+\)$/ })
const loaded = (image: Locator) => expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('mobile: Sorin shows the collapsed Food accordion on the front face and keeps it across the flip', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { apiRequests, tokenImages } = await fixture(page)
  await page.goto(`/playgroups/${group.id}/games/${game.id}`)
  await page.getByRole('button', { name: `Karte anzeigen: ${SORIN}` }).click()
  const dialog = page.getByRole('dialog', { name: SORIN })
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused()
  await loaded(dialog.getByRole('img', { name: 'Vollständige Karte: Sorin of House Markov' }))
  const requestsBefore = apiRequests.length
  const toggle = summary(dialog)
  await expect(toggle).toHaveAccessibleName('Zugehörige Tokens (1)')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.scrollIntoViewIfNeeded()
  await capture(page, info, 'tokens-mobile-collapsed')
  expect(tokenImages).toEqual([])

  await toggle.click()
  const tokenImage = dialog.getByRole('img', { name: 'Zugehöriger Token 1 von 1: Food (Token Artifact — Food)' })
  await loaded(tokenImage)
  expect(tokenImages).toEqual(['token-1'])
  // Phones: the token uses the content width at its native ratio.
  const box = (await tokenImage.boundingBox())!, rules = (await dialog.getByText(/^Lifelink/).boundingBox())!
  expect(Math.abs(box.width - rules.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(box.width / box.height - 488 / 680)).toBeLessThan(0.01)
  await settled(page)
  await toggle.evaluate(node => node.scrollIntoView({ block: 'start' }))
  await expect(tokenImage).toBeInViewport()
  await capture(page, info, 'tokens-mobile-expanded')

  await dialog.getByRole('button', { name: 'Rückseite anzeigen' }).click()
  await expect(dialog.getByRole('heading', { name: 'Sorin, Ravenous Neonate' })).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(tokenImage).toBeAttached()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(tokenImage).toBeVisible()
  expect(tokenImages).toEqual(['token-1']) // Re-expanding reuses the mounted image.
  expect(apiRequests).toHaveLength(requestsBefore)
  expect(await noHorizontalScroll(page)).toBe(true)
})

for (const [width, height] of [[320, 568], [375, 667], [844, 390]] as const) {
  test(`Koma's Coil fits at ${width}×${height} from the member deck view`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    const { apiRequests, tokenImages } = await fixture(page)
    await page.goto(`/playgroups/${group.id}/members/${uid(2)}/decks`)
    await page.getByRole('button', { name: `Karte anzeigen: ${KOMA}` }).click()
    const dialog = page.getByRole('dialog', { name: KOMA })
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused()
    const requestsBefore = apiRequests.length
    const toggle = summary(dialog)
    await toggle.scrollIntoViewIfNeeded()
    await toggle.click()
    const tokenImage = dialog.getByRole('img', { name: "Zugehöriger Token 1 von 1: Koma's Coil (Token Creature — Serpent)" })
    await loaded(tokenImage)
    await settled(page)
    await tokenImage.scrollIntoViewIfNeeded()
    const box = (await tokenImage.boundingBox())!, panel = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(panel.x)
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width)
    expect(Math.abs(box.width / box.height - 488 / 680)).toBeLessThan(0.01)
    expect(await noHorizontalScroll(page)).toBe(true)
    expect(tokenImages).toEqual(['token-2'])
    expect(apiRequests).toHaveLength(requestsBefore)
    if (width !== 375) await capture(page, info, `tokens-koma-${width}x${height}`)
  })
}

test('desktop: tokens sit below the rules in the text column, capped at the Commander card width, keyboard operable', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { apiRequests, tokenImages } = await fixture(page)
  await page.goto('/decks')
  // null and [] snapshots show no section at all.
  for (const name of ['Pending Commander', 'Resolved Without Tokens']) {
    await page.getByRole('button', { name: `Karte anzeigen: ${name}` }).click()
    await expect(page.getByRole('dialog', { name })).toBeVisible()
    await expect(page.getByRole('dialog').getByText(/Zugehörige Tokens/)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.getByRole('button', { name: `Karte anzeigen: ${KOMA}` }).click()
  const dialog = page.getByRole('dialog', { name: KOMA })
  const card = dialog.getByRole('img', { name: `Vollständige Karte: ${KOMA}` })
  await loaded(card)
  const requestsBefore = apiRequests.length
  const toggle = summary(dialog)
  await expect(toggle).toHaveAccessibleName('Zugehörige Tokens (4)')
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(toggle).toBeFocused()
  expect(await toggle.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid')
  const cardBox = (await card.boundingBox())!, toggleBox = (await toggle.boundingBox())!
  const rulesBox = (await dialog.getByText(/This spell can’t be countered/).boundingBox())!
  expect(toggleBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width)
  expect(toggleBox.y).toBeGreaterThan(rulesBox.y + rulesBox.height)
  expect(toggleBox.height).toBeGreaterThanOrEqual(44)
  await capture(page, info, 'tokens-desktop-collapsed')
  expect(tokenImages).toEqual([])
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  // First expansion requests every saved token image at once, in saved order, including those further down.
  await expect.poll(() => tokenImages).toEqual(['token-2', 'token-3', 'token-4', 'token-5'])
  const images = dialog.getByRole('region', { name: 'Zugehörige Tokens (4)' }).getByRole('img')
  await expect(images).toHaveCount(4)
  let bottom = 0
  for (const image of await images.all()) {
    await loaded(image)
    const box = (await image.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(cardBox.width + 1)
    expect(box.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width)
    expect(box.y).toBeGreaterThan(bottom) // A single vertical column.
    bottom = box.y + box.height
  }
  await capture(page, info, 'tokens-desktop-expanded')
  // Many tokens scroll in the existing dialog body; there is no inner scroll container.
  await settled(page)
  await images.nth(1).evaluate(node => node.scrollIntoView({ block: 'center' }))
  await expect(toggle).not.toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeInViewport()
  await capture(page, info, 'tokens-desktop-scrolled')
  await toggle.evaluate(node => node.scrollIntoView({ block: 'center' }))
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(apiRequests).toHaveLength(requestsBefore)
  expect(tokenImages).toHaveLength(4)
})
