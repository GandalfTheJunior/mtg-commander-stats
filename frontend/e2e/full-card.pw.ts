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
const game = { id: uid(20), groupId: group.id, creatorId: uid(1), recordedAt: '2026-11-06T12:00:00Z',
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

test('own collection bounds preloading, keeps artwork editing separate and supports keyboard/fallback', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { apiRequests, images } = await fixture(page)
  await page.goto('/decks')
  await expect(page.getByRole('heading', { name: 'Deck 1', exact: true })).toBeVisible()
  await expect.poll(() => images.some(url => url.endsWith('deck=1'))).toBe(true)
  expect(images.some(url => url.endsWith('deck=12'))).toBe(false)
  const card = page.getByRole('heading', { name: 'Deck 1', exact: true }).locator('xpath=ancestor::li[1]')
  await expect(card.getByRole('button', { name: `Artwork für ${name} ändern` })).toBeVisible()
  const trigger = card.getByRole('button', { name: `Karte anzeigen: ${name}` })
  const requestsBefore = apiRequests.length
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  const image = dialog.getByRole('img', { name: 'Vollständige Karte: Esika, God of the Tree' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
  await capture(page, info, 'card-desktop')
  const close = dialog.getByRole('button', { name: 'Schließen' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '1: Esika, God of the Tree' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await dialog.getByRole('button', { name: '2: The Prismatic Bridge' }).click()
  await expect(dialog.getByText('Legendary Enchantment')).toBeVisible()
  expect(apiRequests).toHaveLength(requestsBefore)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await page.getByRole('heading', { name: 'Deck 12', exact: true }).scrollIntoViewIfNeeded()
  await expect.poll(() => images.some(url => url.endsWith('deck=12'))).toBe(true)
  await page.getByRole('button', { name: 'Karte anzeigen: Legacy Commander' }).click()
  await expect(page.getByText('Kein Kartenbild gespeichert.')).toBeVisible()
  await expect(page.getByText('Regeltext nicht gespeichert.')).toBeVisible()
  await capture(page, info, 'card-fallback')
})

test('game details preload all four cards and open the full card on a narrow viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { apiRequests, images } = await fixture(page)
  await page.goto(`/playgroups/${group.id}/games/${game.id}`)
  await expect(page.getByRole('heading', { name: 'Spieldetails' })).toBeVisible()
  await expect.poll(() => new Set(images).size).toBe(8)
  const requestsBefore = apiRequests.length
  const trigger = page.getByRole('button', { name: `Karte anzeigen: ${name}` }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name })
  await dialog.getByRole('button', { name: '2: The Prismatic Bridge' }).click()
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeInViewport()
  const bounds = (await dialog.boundingBox())!
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844)
  const image = dialog.getByRole('img', { name: 'Vollständige Karte: The Prismatic Bridge' })
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
  await expect(dialog.getByText(/At the beginning of your upkeep/)).toBeAttached()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(apiRequests).toHaveLength(requestsBefore)
  await capture(page, info, 'card-mobile')
  await dialog.getByRole('button', { name: 'Schließen' }).click()
  await expect(trigger).toBeFocused()
})
