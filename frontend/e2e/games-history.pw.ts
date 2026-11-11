import { expect, test } from '@playwright/test'

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
function savedCommander(name: string) {
  return { name, position: 1, oracleId: id(401), selectionRef: { scryfallCardId: id(301) }, scryfallCardId: id(301),
    canBeSoleCommander: true, requiresChosenColor: false, colorIdentity: [], effectiveColorIdentity: [], chosenColor: null,
    artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null,
    pairing: { roles: [], partnerWith: [], variants: [] } }
}
const group = { id: id(1), name: 'Friday Night Commander', role: 'OWNER', members: [{ userId: id(2), username: 'Demo', role: 'OWNER' }] }
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


for (const width of [320, 1280]) {
  test(`Games history pagination and states at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 })
    let mode = 'populated'
    let pages = 0
    await page.route('https://cards.scryfall.io/**', route => route.abort())
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/me') return route.fulfill({ json: { id: id(2), username: 'Demo' } })
      if (url.pathname === `/api/groups/${group.id}`) return route.fulfill({ json: group })
      if (url.pathname.endsWith('/history')) {
        // StrictMode may abort and restart the initial effect; append must run exactly once.
        if (url.search) pages++
        if (mode === 'error') return route.fulfill({ status: 503, json: {} })
        return route.fulfill({ json: { games: mode === 'empty' ? [] : url.search ? [games[3]] : games.slice(0, 3), nextCursor: mode === 'populated' && !url.search ? 'next' : null } })
      }
      return route.fulfill({ json: [] })
    })
    const capture = async (state: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`games-${state}-${width}.png`), fullPage: true })
      if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/games-${state}-${width}.png`, fullPage: true })
    }
    await page.goto(`/playgroups/${group.id}/games`)
    await expect(page.getByRole('tab', { name: 'Games', selected: true })).toBeVisible()
    await page.locator('[data-history-sentinel]').scrollIntoViewIfNeeded()
    await expect(page.getByText('Du hast das Ende der Bibliothek erreicht.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Game history' }).getByRole('listitem')).toHaveCount(4)
    expect(pages).toBe(1)
    await capture('populated')
    mode = 'empty'
    await page.reload()
    await expect(page.getByText(/Tamiyo hat noch keine/)).toBeVisible()
    await expect(page.getByText('Du hast das Ende der Bibliothek erreicht.')).toHaveCount(0)
    await capture('empty')
    mode = 'error'
    await page.reload()
    await expect(page.getByRole('button', { name: 'Refresh games' })).toBeVisible()
    await capture('error')
  })
}
