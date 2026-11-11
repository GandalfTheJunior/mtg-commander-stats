import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const card = (name: string, position = 1) => ({ name, position, oracleId: id(400 + position), selectionRef: { scryfallCardId: id(300 + position) }, scryfallCardId: id(300 + position),
  canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: [], effectiveColorIdentity: [],
  artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null, pairing: { roles: [], partnerWith: [], variants: [] } })

for (const width of [320, 1280]) for (const mode of ['normal', 'alternate', 'draw', 'readonly']) {
  test(`${mode} details at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const group = { id: id(10), name: 'Friday Night Commander', role: mode === 'readonly' ? 'MEMBER' : 'ADMIN', members: [1, 2, 3, 4].map(n => ({ userId: id(n), username: `Player ${n}`, role: 'MEMBER' })) }
    const game = { id: id(20), groupId: group.id, creatorId: id(2), recordedAt: '2026-11-01T08:14:00Z', playedOn: mode === 'draw' ? null : '2026-10-31',
      result: mode === 'draw' ? 'DRAW' : 'WIN', winnerUserId: mode === 'draw' ? null : id(4), alternateWinCon: mode === 'alternate',
      participants: [3, 1, 4, 2].map(n => ({ userId: id(n), username: n === 2 ? 'An existing player with a particularly long display name' : `Player ${n}`,
        startPosition: n, placement: mode === 'draw' || n === 3 ? null : n === 4 ? 1 : 2, stillInGame: mode === 'alternate' && n === 3 ? null : mode === 'draw' || n === 4,
        deckId: id(100 + n), deck: { id: id(100 + n), name: n === 4 ? 'Partner control with a long saved deck name' : `Saved deck ${n}`, colorIdentity: [], archived: n === 3,
          manaBoxUrl: n === 2 ? 'https://evil.test/deck' : n === 4 ? 'https://manabox.app/decks/synthetic-123' : null,
          commanders: n === 4 ? [card('Tymna the Weaver'), card('Kraum, Ludevic’s Opus', 2)] : [card('A saved Commander name')],
          companion: n === 4 ? card('Jegantha, the Wellspring') : null } })),
    }
    await page.route('**/api/**', route => {
      const pathname = new URL(route.request().url()).pathname
      const json = pathname === '/api/me' ? { id: id(1), username: 'Demo viewer' }
        : pathname === `/api/groups/${group.id}` ? group : pathname.endsWith(`/games/${game.id}`) ? game : []
      return route.fulfill({ json })
    })
    await page.goto(`/playgroups/${group.id}/games/${game.id}`)
    await expect(page.getByRole('heading', { name: 'Spieldetails' })).toBeVisible()
    const list = page.getByRole('list', { name: 'Teilnehmende und Decks' })
    await expect(list.getByRole('heading')).toHaveText(['Player 1', 'An existing player with a particularly long display name', 'Player 3', 'Player 4'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const edit = page.getByRole('button', { name: 'Spiel bearbeiten' }), remove = page.getByRole('button', { name: 'Spiel löschen' })
    if (mode === 'readonly') { await expect(edit).toHaveCount(0); await expect(remove).toHaveCount(0) }
    else {
      const a = (await edit.boundingBox())!, b = (await remove.boundingBox())!
      expect(a.y).toBe(b.y)
      expect(a.x + a.width).toBeLessThanOrEqual(b.x)
    }
    await expect(list.getByRole('link', { name: /ManaBox/ })).toHaveCount(1)
    const firstArt = (await list.getByRole('button', { name: 'Karte anzeigen: Tymna the Weaver', exact: true }).boundingBox())!
    const secondArt = (await list.getByRole('button', { name: 'Karte anzeigen: Kraum, Ludevic’s Opus', exact: true }).boundingBox())!
    const companionArt = (await list.getByRole('button', { name: 'Karte anzeigen: Jegantha, the Wellspring', exact: true }).boundingBox())!
    expect(firstArt.width).toBe(secondArt.width)
    expect(firstArt.height).toBe(secondArt.height)
    expect(firstArt.y).toBe(secondArt.y)
    expect(firstArt.x + firstArt.width).toBeLessThanOrEqual(secondArt.x)
    expect(companionArt.y).toBeGreaterThan(firstArt.y)
    expect(companionArt.height).toBeLessThan(firstArt.height)

    if (mode === 'draw') {
      await expect(page.getByText('Spieldatum unbekannt')).toBeVisible()
      await expect(list.getByText(/^Platz \d/)).toHaveCount(0)
      await expect(page.getByText('Unentschieden', { exact: true })).toHaveCount(1)
    } else {
      const label = mode === 'alternate' ? 'Alternative Siegbedingung' : 'Normaler Sieg'
      const winner = list.getByRole('button', { name: label })
      await winner.focus(); await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: label })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(winner).toBeFocused()
    }
    const companion = page.getByRole('button', { name: 'Companion anzeigen' })
    await companion.tap()
    await expect(page.getByRole('dialog', { name: 'Companion anzeigen' })).toHaveText(/Jegantha, the Wellspring/)
    await page.keyboard.press('Escape')
    const directory = process.env.MTG_SCREENSHOTS ?? info.outputPath('screenshots')
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: `${directory}/details-${mode}-${width}.png`, fullPage: true })
    if (mode === 'alternate') {
      await edit.click()
      const editor = page.getByRole('form', { name: 'Spiel bearbeiten' })
      await expect(editor).toBeVisible()
      await expect(editor.locator('input[aria-checked="mixed"]')).toHaveCount(1)
      await page.screenshot({ path: `${directory}/details-edit-handoff-${width}.png`, fullPage: true })
    }
    if (mode === 'normal') {
      await remove.click()
      await page.getByRole('button', { name: 'Abbrechen' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  })
}
