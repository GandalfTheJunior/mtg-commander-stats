import { expect, test, type Locator, type Page } from '@playwright/test'

// Synthetic, non-sensitive fixtures for the #197 statistics landing, chooser and reports.
const id = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`
function commander(name: string, n: number, position = 1) {
  return { name, position, oracleId: id(400 + n), selectionRef: { scryfallCardId: id(300 + n) }, scryfallCardId: id(300 + n),
    canBeSoleCommander: true, requiresChosenColor: false, colorIdentity: [], effectiveColorIdentity: [], chosenColor: null,
    artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null,
    pairing: { roles: [], partnerWith: [], variants: [] } }
}
const group = { id: id(1), name: 'Commander-Runde', role: 'OWNER', members: [{ userId: id(2), username: 'Demo', role: 'OWNER' }] }
const seats = (n: number, games: number, wins: number[]) => Array.from({ length: n }, (_, i) => ({ startPosition: i + 1, games: games ? games : 0,
  wins: games ? wins[i] ?? 0 : 0, winRatePercent: games ? Math.round(10000 * (wins[i] ?? 0) / games) / 100 : null }))
const rate = (wins: number, games: number) => Math.round(10000 * wins / games) / 100
const player = (n: number, username: string, games: number, wins: number) => ({ userId: id(n), username, games, wins, winRatePercent: rate(wins, games) })
const deck = (n: number, name: string, owner: string, commanders: unknown[], games: number, wins: number, archived = false) =>
  ({ deckId: id(100 + n), ownerUserId: id(50 + n), ownerUsername: owner, name, commanders, format: 'COMMANDER', archived, games, wins, winRatePercent: rate(wins, games) })
const stats = {
  players: [player(2, 'Alex', 24, 10), player(3, 'Mara', 18, 9), player(4, 'Alex', 14, 5), player(5, 'Sam', 8, 2),
    { ...player(6, 'Deleted profile', 3, 0), deleted: true, deletedNumber: 1 },
    player(7, 'A remarkably long display name for a quick profile that has to wrap', 2, 1)],
  decks: [deck(1, 'Superfriends', 'Mara', [commander('Atraxa, Praetors\' Voice', 1)], 6, 4),
    deck(2, 'Partner Control', 'Alex', [commander('Tymna the Weaver', 2), commander('Kraum, Ludevic\'s Opus', 3, 2)], 4, 2),
    deck(3, 'Friedhof', 'Sam', [commander('Muldrotha, the Gravetide', 4)], 12, 3, true),
    deck(4, 'One-game wonder with an unusually long saved deck name', 'Mara', [commander('Yuriko, the Tiger\'s Shadow', 5)], 1, 1)],
  startPositions: [seats(2, 0, []), seats(3, 12, [5, 4, 3]), seats(4, 28, [9, 7, 5, 4]), seats(5, 0, []), seats(6, 0, [])]
    .map((section, index) => ({ playerCount: index + 2, seats: section })),
  manaColors: [['W', 12, 7], ['U', 21, 11], ['B', 18, 6], ['R', 10, 3], ['G', 16, 7], ['C', 4, 1]]
    .map(([color, games, wins]) => ({ color, games, wins, winRatePercent: rate(wins as number, games as number) })),
}

async function serve(page: Page, mode: { failStatistics: boolean } = { failStatistics: false }) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/me') return route.fulfill({ json: { id: id(2), username: 'Demo' } })
    if (url.pathname === `/api/groups/${group.id}`) return route.fulfill({ json: group })
    if (url.pathname.endsWith('/statistics')) {
      if (mode.failStatistics) return route.fulfill({ status: 503, json: {} })
      const size = url.searchParams.get('playerCount')
      return route.fulfill({ json: size ? { ...stats, startPositions: stats.startPositions.filter(section => String(section.playerCount) === size) } : stats })
    }
    return route.fulfill({ json: [] })
  })
  return errors
}
const base = `/playgroups/${group.id}/statistics`
async function expectKeyboardRing(radio: Locator) {
  // Check real focus separately from :focus-visible, which WebKit can drop on native arrows.
  await expect(radio).toBeFocused()
  await expect(radio).toBeChecked()
  await expect(radio.locator('xpath=..')).toHaveCSS('outline-style', 'solid')
}
async function capture(page: Page, name: string, width: number, full = true) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const select of await page.locator('select').all()) {
    expect(await select.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
  if (process.env.MTG_SCREENSHOTS) await page.waitForTimeout(600) // Let click ripples settle for review images only.
  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/statistics-${name}-${width}.png`, fullPage: full })
}

for (const width of [320, 375, 390, 1280]) {
  test(`statistics landing, chooser and four reports at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 })
    const errors = await serve(page)
    await page.goto(base)
    await expect(page.getByRole('tab', { name: 'Statistics', selected: true })).toBeVisible()
    const teasers = page.getByRole('link', { name: /^(Gesamtsiegquote|Siegrate)/ })
    await expect(teasers).toHaveCount(3)
    await expect(page.getByText('4 Spieler · 28 Partien')).toBeVisible()
    // The chooser action shares the heading row.
    const heading = (await page.getByRole('heading', { name: 'Statistiken', level: 3 }).boundingBox())!
    const action = (await page.getByRole('link', { name: 'Alle Statistiken anzeigen' }).boundingBox())!
    expect(Math.abs((heading.y + heading.height / 2) - (action.y + action.height / 2))).toBeLessThan(heading.height)
    if (width === 1280) {
      const boxes = await Promise.all((await teasers.all()).map(link => link.boundingBox()))
      expect(new Set(boxes.map(box => Math.round(box!.y))).size).toBe(1) // Three desktop columns.
    }
    await capture(page, 'landing', width)

    await page.getByRole('link', { name: 'Alle Statistiken anzeigen' }).click()
    await expect(page.getByRole('heading', { name: 'Alle Statistiken' })).toBeVisible()
    await capture(page, 'chooser-collapsed', width)
    for (const category of ['Spieler', 'Decks', 'Gruppe']) await page.getByRole('button', { name: category }).click()
    await capture(page, 'chooser-expanded', width)

    await page.getByRole('link', { name: 'Gesamtsiegquote pro Spieler' }).click()
    await expect(page.getByRole('heading', { name: 'Gesamtsiegquote pro Spieler', level: 3 })).toBeVisible()
    const alle = page.getByRole('radio', { name: 'Alle' })
    await expect(alle).toBeChecked()
    // Real keyboard entry: Tab from the preceding Back link into the group, then arrows.
    await page.getByRole('link', { name: 'Zurück zu Statistiken' }).focus()
    await page.keyboard.press('Tab')
    await expectKeyboardRing(alle)
    await page.keyboard.press('ArrowRight')
    await expectKeyboardRing(page.getByRole('radio', { name: '2' }))
    // Pointer selection shows no keyboard ring.
    await page.getByRole('radio', { name: 'Alle' }).click()
    await expect(alle).toBeChecked()
    await expect(alle.locator('xpath=..')).toHaveCSS('outline-style', 'none')
    await expect(page.getByRole('button', { name: /Kennung anzeigen/ })).toHaveCount(2)
    for (const option of await page.getByRole('radio').all()) {
      const box = (await option.locator('xpath=..').boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await capture(page, 'players', width)
    await page.getByRole('link', { name: 'Zurück zu Statistiken' }).click()
    await expect(page.getByRole('button', { name: 'Decks' })).toHaveAttribute('aria-expanded', 'true')

    await page.getByRole('link', { name: 'Gesamtsiegquote pro Deck' }).click()
    await expect(page.getByText('Kraum, Ludevic\'s Opus')).toBeVisible()
    await expect(page.getByText('Archiviert')).toBeVisible()
    await capture(page, 'decks', width)
    await page.goBack()

    await page.getByRole('link', { name: 'Siegrate nach Startplatz' }).click()
    await expect(page.getByRole('heading', { name: '4 Spieler · 28 Partien' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '3 Spieler · 12 Partien' })).toBeVisible()
    await capture(page, 'starting-seats', width)
    await page.goBack()

    await page.getByRole('link', { name: 'Siegrate nach Manafarbe' }).click()
    const colors = page.getByRole('list', { name: 'Siegrate nach Manafarbe' }).getByRole('listitem')
    await expect(colors).toHaveCount(6)
    if (width === 390) {
      // Binding compact layout: on a 390 × 844 phone the six rows fit together once scrolled to the list.
      await colors.first().scrollIntoViewIfNeeded()
      const first = (await colors.first().boundingBox())!, last = (await colors.last().boundingBox())!
      expect(last.y + last.height - first.y).toBeLessThan(844 - 72)
    }
    await capture(page, 'mana-colors', width)

    // Deliberate tab selection always returns to the landing page.
    await page.getByRole('tab', { name: 'Statistics' }).click()
    await expect(page).toHaveURL(base)
    await expect(page.getByRole('link', { name: 'Alle Statistiken anzeigen' })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('statistics failure offers retry without presenting numbers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const mode = { failStatistics: true }
  const errors = await serve(page, mode)
  await page.goto(`${base}/reports/players`)
  await expect(page.getByRole('alert')).toContainText('Die Statistiken konnten nicht geladen werden.')
  await expect(page.getByText('%')).toHaveCount(0)
  await capture(page, 'error', 390)
  mode.failStatistics = false
  await page.getByRole('button', { name: 'Erneut versuchen' }).click()
  await expect(page.getByRole('list', { name: 'Spielerstatistiken' })).toBeVisible()
  expect(errors).toEqual([])
})
