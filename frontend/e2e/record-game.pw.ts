import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Synthetic, non-sensitive fixtures; every API read and write is intercepted.
const id = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`
const card = (name: string) => ({ name, position: 1, oracleId: id(400), selectionRef: { scryfallCardId: id(300) }, scryfallCardId: id(300),
  canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: [], effectiveColorIdentity: [],
  artworkFaceIndex: null, artCropUrl: null, illustrationId: null, artist: null, scryfallUri: null, pairing: { roles: [], partnerWith: [], variants: [] } })
const people = ['Aragorn', 'Gandalf', 'Legolas', 'Gimli']
const commanders = ['Atraxa, Praetors’ Voice', 'Krenko, Mob Boss', 'Marwyn, the Nurturer', 'Magda, Brazen Outlaw']
const decks = ['Superfriends', 'Goblin-Armee', 'Elfensturm', 'Schatzkammer']
const group = { id: id(10), name: 'Die Gefährten', role: 'OWNER', members: [
  ...people.map((username, i) => ({ userId: id(i + 1), username, role: i ? 'MEMBER' : 'OWNER', quickProfile: false })),
  { userId: id(5), username: 'Hairy Zombie', role: 'MEMBER', quickProfile: true },
] }
const deck = (n: number) => ({ id: id(100 + n), name: decks[n - 1], commanders: [card(commanders[n - 1])], colorIdentity: [] })

async function mockApi(page: Page) {
  const writes: unknown[] = []
  let history: unknown[] = []
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { id: id(1), username: 'Aragorn' } })
    if (path === '/api/csrf') return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'synthetic' } })
    if (path === `/api/groups/${group.id}`) return route.fulfill({ json: group })
    const member = path.match(/\/members\/([^/]+)\/decks$/)
    if (member) { const n = Number(member[1].slice(-2)); return route.fulfill({ json: n <= 4 ? [deck(n)] : [] }) }
    if (path.endsWith('/games/history')) return route.fulfill({ json: { games: history, nextCursor: null } })
    if (path.endsWith('/games') && request.method() === 'POST') {
      const input = request.postDataJSON() as { playedOn: string; result: 'WIN'; alternateWinCon: boolean; participants: { userId: string; deckId: string; startPosition: number; placement?: number }[] }
      writes.push(input)
      const game = { id: id(20), groupId: group.id, creatorId: id(1), recordedAt: '2026-11-06T20:00:00Z', playedOn: input.playedOn, result: input.result,
        alternateWinCon: input.alternateWinCon, winnerUserId: input.participants.find(p => p.placement === 1)!.userId,
        participants: input.participants.map(p => ({ ...p, placement: p.placement ?? null, stillInGame: p.placement === 1 ? true : null,
          username: people[Number(p.userId.slice(-2)) - 1], deck: { ...deck(Number(p.deckId.slice(-1))), archived: false } })) }
      history = [game]
      return route.fulfill({ status: 201, json: game })
    }
    return route.fulfill({ json: [] })
  })
  return writes
}

async function choose(page: Page, slot: number, n: number) {
  await page.getByRole('button', { name: `Spieler ${slot} auswählen` }).click()
  await page.getByRole('dialog', { name: 'Gruppenmitglied auswählen' }).getByRole('button', { name: new RegExp(`^${people[n - 1]} · `) }).click()
  await page.getByRole('dialog', { name: 'Deck auswählen' }).getByRole('button', { name: `${commanders[n - 1]} · ${decks[n - 1]}` }).click()
  await expect(page.getByRole('button', { name: `Spieler ${slot} bearbeiten` })).toBeVisible()
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

for (const width of [320, 390, 1280]) {
  test(`records a game end to end at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const directory = process.env.MTG_SCREENSHOTS ?? info.outputPath('screenshots')
    await mkdir(directory, { recursive: true })
    const shot = (name: string) => page.screenshot({ path: `${directory}/record-${width}-${name}.png`, fullPage: true })
    const writes = await mockApi(page)
    await page.goto(`/playgroups/${group.id}/games/new`)
    await expect(page.getByRole('heading', { name: 'Spiel erfassen' })).toBeVisible()
    await expect(page.getByRole('region', { name: /^Spieler \d$/ })).toHaveCount(4)
    expect(await noOverflow(page)).toBe(true)
    await shot('empty')

    await page.getByRole('button', { name: 'Spieler 1 auswählen' }).click()
    await expect(page.getByRole('dialog', { name: 'Gruppenmitglied auswählen' }).getByRole('button', { name: 'Hairy Zombie · Schnellprofil' })).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Spieler 1 auswählen' })).toBeFocused()

    for (const n of [1, 2, 3, 4]) await choose(page, n, n)
    // Pointer drag on the left grip moves Gimli to the first seat, live, without expanding cards.
    const grip = page.getByRole('button', { name: 'Gimli verschieben' })
    const target = (await page.getByRole('region', { name: 'Spieler 1' }).boundingBox())!
    const start = (await grip.boundingBox())!
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + start.width / 2, target.y + 20, { steps: 12 })
    await page.mouse.up()
    await expect(page.getByRole('region', { name: 'Spieler 1' }).getByRole('heading', { name: 'Gimli' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mitglied ändern' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Legolas: Sieger des Spiels' }).click()
    await page.getByLabel('Ergebnis für Gandalf').selectOption('2')
    await shot('win')
    await page.getByRole('button', { name: 'Spiel speichern' }).click()
    await expect(page.getByRole('dialog', { name: 'Fehlende Platzierungen' })).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
    await shot('partial')
    await page.getByRole('button', { name: 'Spiel ohne Platzierungen speichern' }).click()

    const panel = page.getByRole('region', { name: 'Spiel erfolgreich gespeichert' })
    await expect(panel).toBeVisible()
    await expect(page.getByRole('link', { name: /^Spieldetails: Legolas/ })).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
    await shot('success')
    expect(writes).toHaveLength(1)
    const [write] = writes as { playedOn: string; participants: { userId: string; startPosition: number; placement?: number }[] }[]
    expect(write.playedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(write.participants.map(p => [people[Number(p.userId.slice(-2)) - 1], p.startPosition, p.placement ?? null]))
      .toEqual([['Gimli', 1, null], ['Aragorn', 2, null], ['Gandalf', 3, null], ['Legolas', 4, 1]])

    await panel.getByRole('button', { name: 'Noch ein Spiel – gleiche Spieler' }).click()
    await expect(page.getByRole('heading', { name: 'Spiel erfassen' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Spieler 1' }).getByRole('heading', { name: 'Aragorn' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Deck auswählen' })).toHaveCount(4)
    expect(await noOverflow(page)).toBe(true)
  })
}
