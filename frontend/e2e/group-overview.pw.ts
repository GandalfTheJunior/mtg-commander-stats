import { expect, test } from '@playwright/test'

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
function savedCommander(name: string) {
  return { name, position: 1, oracleId: id(401), selectionRef: { scryfallCardId: id(301) }, scryfallCardId: id(301),
    canBeSoleCommander: true, requiresChosenColor: false, colorIdentity: [], effectiveColorIdentity: [], chosenColor: null,
    artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null,
    pairing: { roles: [], partnerWith: [], variants: [] } }
}
const group = { id: id(1), name: 'Friday Night Commander', role: 'OWNER', members: [{ userId: id(2), username: 'Demo', role: 'OWNER' }] }
const stats = {
  players: ['Deleted profile', 'Same name', 'Same name', 'Fourth'].map((username, i) => ({ userId: id(2 + i), username, deleted: i === 0, deletedNumber: i === 0 ? 1 : null, games: 12 - i, wins: 3, winRatePercent: 25 + i })), decks: [],
  startPositions: [2, 3, 4, 5, 6].map(playerCount => ({ playerCount, seats: Array.from({ length: playerCount }, (_, i) => ({ startPosition: i + 1, games: 0, wins: 0, winRatePercent: null })) })),
  manaColors: ['W', 'U', 'B', 'R', 'G', 'C'].map(color => ({ color, games: 0, wins: 0, winRatePercent: null })),
}
const games = Array.from({ length: 4 }, (_, i) => ({
  id: id(20 + i), groupId: group.id, creatorId: id(2), recordedAt: '2026-11-09T10:00:00Z', playedOn: i === 2 ? null : `2026-11-0${4 - i}`,
  result: i === 2 ? 'DRAW' : 'WIN', winnerUserId: i === 2 ? null : id(2), alternateWinCon: false,
  participants: [2, 3].map((n, position) => ({ userId: id(n), username: n === 2 ? (i === 1 ? 'A very long existing player display name that needs to wrap' : 'Ada') : 'Emil',
    startPosition: position + 1, placement: position + 1, stillInGame: position === 0, deckId: id(100 + n),
    deck: { id: id(100 + n), name: i === 1 ? 'A very long saved deck name with two Commanders' : 'Dragon Engine', colorIdentity: [], archived: false,
      commanders: i === 1 ? [savedCommander('Partner one'), { ...savedCommander('Partner two'), position: 2, oracleId: id(333), scryfallCardId: id(334), selectionRef: { scryfallCardId: id(334) } }]
        : [{ ...savedCommander('Karn'), artCropUrl: 'https://cards.scryfall.io/art_crop/front/test.jpg' }] },
  })),
}))

for (const width of [320, 390, 1280]) {
  test(`Overview populated, empty, loading and error states at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    let mode: 'populated' | 'empty' | 'error' | 'loading' = 'populated'
    let unblock!: () => void
    const blocked = new Promise<void>(resolve => { unblock = resolve })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://cards.scryfall.io/**', route => route.abort())
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/me') return route.fulfill({ json: { id: id(2), username: 'Demo' } })
      if (path === `/api/groups/${group.id}`) return route.fulfill({ json: group })
      if (mode === 'loading') await blocked
      if (mode === 'error') return route.fulfill({ status: 503, json: {} })
      if (path.endsWith('/history')) return route.fulfill({ json: { games: mode === 'empty' ? [] : games, nextCursor: null } })
      if (path.endsWith('/statistics')) return route.fulfill({ json: mode === 'empty' ? { ...stats, players: [] } : stats })
      return route.fulfill({ json: [] })
    })
    const url = `/playgroups/${group.id}`
    const capture = async (state: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`overview-${state}-${width}.png`), fullPage: true })
      if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/overview-${state}-${width}.png`, fullPage: true })
    }
    await page.goto(url)
    await expect(page.getByRole('tab', { name: 'Overview', selected: true })).toBeVisible()
    const list = page.getByRole('list', { name: 'Letzte Spiele' })
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await expect(page.getByRole('list', { name: 'Gesamtsiegquoten' }).getByRole('listitem')).toHaveCount(3)
    await expect(list.getByText('Spieldatum unbekannt')).toBeVisible()
    await expect(list.getByText('Unentschieden')).toBeVisible()
    const cards = list.getByRole('link')
    let bottom = 0
    for (const card of await cards.all()) {
      const box = (await card.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(bottom)
      bottom = box.y + box.height
      expect(await card.locator('a, button').count()).toBe(0)
    }
    const report = page.getByRole('link', { name: /Alle Spielerstatistiken ansehen/ })
    await report.focus()
    await expect(report).toBeFocused()
    expect(await report.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
    await expect(report).toHaveAttribute('href', `${url}/statistics/reports/players`)
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Dashboard', 'Playgroups', 'Decks'])
    await capture('populated')
    await report.click()
    await expect(page).toHaveURL(`${url}/statistics/reports/players`)
    await page.getByRole('link', { name: 'Zurück zur Playgroup' }).click()
    await expect(list).toBeVisible()
    await page.getByRole('link', { name: 'Spiel erfassen', exact: true }).click()
    await expect(page).toHaveURL(`${url}/games/new`)
    await expect(page.getByRole('heading', { name: 'Commander-Spiel erfassen' })).toBeVisible()
    mode = 'empty'
    await page.goto(url)
    await expect(page.getByText('Die Archive erscheinen unvollständig… Absolviert mehr Spiele, um eure Statistiken zu sehen.')).toBeVisible()
    await expect(page.getByText('Tamiyo hat noch keine Aufzeichnungen angefertigt. Sobald ihr ein paar Runden gespielt habt, seht ihr hier eure Historie.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Spiel erfassen', exact: true })).toHaveCount(1)
    await capture('empty')
    mode = 'error'
    await page.reload()
    await expect(page.getByRole('button', { name: 'Übersicht erneut laden' })).toBeVisible()
    await capture('error')
    mode = 'populated'
    await page.getByRole('button', { name: 'Übersicht erneut laden' }).click()
    await expect(list).toBeVisible()
    mode = 'loading'
    await page.reload()
    await expect(page.getByText('Letzte Spiele werden geladen…')).toBeVisible()
    await expect(page.getByText('Statistiken werden geladen…')).toBeVisible()
    await capture('loading')
    unblock()
    expect(errors).toEqual([])
  })
}
