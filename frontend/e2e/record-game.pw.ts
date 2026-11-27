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

test.describe('played-on validation', () => {
  test.use({ timezoneId: 'Europe/Berlin' })
  for (const operation of ['create', 'edit']) {
    test(`${operation} rejects future dates and preserves the draft after a server rejection`, async ({ page }, info) => {
      const width = operation === 'create' ? 390 : 1280
      await page.setViewportSize({ width, height: 900 })
      await page.clock.setFixedTime(new Date('2026-11-15T23:01:00Z'))
      await mockApi(page)
      const saved = { id: id(20), groupId: group.id, creatorId: id(1), recordedAt: '2026-11-01T20:00:00Z',
        playedOn: '2000-02-29', result: 'WIN', alternateWinCon: false, winnerUserId: id(1),
        participants: [1, 2].map((n, i) => ({ userId: id(n), username: people[n - 1], deckId: deck(n).id,
          startPosition: n, placement: i ? 2 : 1, stillInGame: !i, deck: { ...deck(n), archived: false } })) }
      const writes: Record<string, unknown>[] = []
      const path = `/api/groups/${group.id}/games${operation === 'edit' ? `/${id(20)}` : ''}`
      await page.route(`**${path}`, async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: saved })
        writes.push(route.request().postDataJSON() as Record<string, unknown>)
        return route.fulfill({ status: 400, json: { code: 'PLAYED_ON_FUTURE', field: 'playedOn', detail: 'Choose today or earlier.' } })
      })
      await page.goto(`/playgroups/${group.id}/games/${operation === 'edit' ? `${id(20)}/edit` : 'new'}`)
      await expect(page.getByRole('heading', { name: operation === 'edit' ? 'Spiel bearbeiten' : 'Spiel erfassen' })).toBeVisible()
      if (operation === 'create') {
        await choose(page, 1, 1); await choose(page, 2, 2)
        await page.getByRole('button', { name: 'Aragorn: Sieger des Spiels' }).click()
      }
      const date = page.getByLabel('Spieldatum')
      await expect(date).toHaveAttribute('max', '2026-11-16')
      if (operation === 'create') await expect(date).toHaveValue('2026-11-16')
      await date.fill('2026-11-17')
      await page.getByRole('button', { name: 'Spiel speichern' }).click()
      await expect(date).toHaveAttribute('aria-invalid', 'true')
      await expect(date).toHaveAccessibleDescription('Bitte heute oder ein früheres Spieldatum wählen.')
      await expect(date).toBeFocused()
      expect(writes).toHaveLength(0)
      // Native constraints disable future picker days; the handler protects scripted submissions too.
      expect(await date.evaluate((element: HTMLInputElement) => element.validity.rangeOverflow)).toBe(true)
      await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      expect(writes).toHaveLength(0)
      expect(await noOverflow(page)).toBe(true)
      const directory = process.env.MTG_SCREENSHOTS ?? info.outputPath('screenshots')
      await mkdir(directory, { recursive: true })
      await page.screenshot({ path: `${directory}/played-on-${operation}-${info.project.name}.png`, fullPage: true })
      // The new local day is accepted at Save even when the previously rendered maximum is stale.
      await page.clock.setFixedTime(new Date('2026-11-16T23:01:00Z'))
      await page.getByRole('button', { name: 'Spiel speichern' }).click()
      await expect.poll(() => writes.length).toBe(1)
      expect(writes[0].playedOn).toBe('2026-11-17')
      expect(writes[0].playedOnTimeZone).toBe('Europe/Berlin')
      await expect(date).toHaveAccessibleDescription('Bitte heute oder ein früheres Spieldatum wählen.')
      await expect(date).toHaveValue('2026-11-17')
      await expect(page.getByRole('img', { name: 'Aragorn: Sieger des Spiels, Platz 1' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Spieler 2' }).getByRole('heading', { name: 'Gandalf' })).toBeVisible()
      expect(writes).toHaveLength(1)
      await page.screenshot({ path: `${directory}/played-on-server-${operation}-${info.project.name}.png`, fullPage: true })
      // Simulate a browser without usable zone detection; do not guess UTC or Berlin.
      await page.evaluate(() => {
        Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
          apply(target, thisArg, args) {
            const formatter = Reflect.apply(target, thisArg, args) as Intl.DateTimeFormat
            Object.defineProperty(formatter, 'resolvedOptions', { value: () => ({ timeZone: '' }) })
            return formatter
          },
        })
      })
      await date.fill('2000-02-29')
      await page.getByRole('button', { name: 'Spiel speichern' }).click()
      await expect(date).toHaveAccessibleDescription(/Deine Zeitzone konnte nicht ermittelt werden/)
      expect(writes).toHaveLength(1)
      expect(await noOverflow(page)).toBe(true)
      await page.screenshot({ path: `${directory}/played-on-zone-${operation}-${info.project.name}.png`, fullPage: true })
    })
  }
})

test.describe('parchment player cards (#382)', () => {
  // Barrel cap/shaft geometry: the caps keep fixed sizes while only the shaft follows the card height.
  const barrel = (page: Page, slot: number) => page.getByRole('region', { name: `Spieler ${slot}` })
    .evaluate(element => getComputedStyle(element, '::after').backgroundSize)
  const height = (page: Page, slot: number) => page.getByRole('region', { name: `Spieler ${slot}` }).evaluate(element => element.getBoundingClientRect().height)

  test('collapse and expand animate, keep ink focus and fixed barrel caps', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await mockApi(page)
    await page.goto(`/playgroups/${group.id}/games/new`)
    await choose(page, 1, 1); await choose(page, 2, 2)
    expect(await barrel(page, 1)).toBe('100% 9px, 100% 10.5px, 100% calc(100% - 18px)')
    const collapsed = await height(page, 1)

    const toggle = page.getByRole('button', { name: 'Spieler 1 bearbeiten' })
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Spieler 1 einklappen' })).toBeFocused()
    // Dark ink outline on parchment instead of the editor's gold outline.
    expect(await page.getByRole('button', { name: 'Spieler 1 einklappen' }).evaluate(element => getComputedStyle(element).outlineColor)).toBe('rgb(88, 44, 28)')
    await expect(page.getByRole('region', { name: 'Spieler 1' }).locator('.MuiCollapse-entered')).toHaveCount(1)
    const expanded = await height(page, 1)
    expect(expanded).toBeGreaterThan(collapsed + 80)
    expect(await barrel(page, 1)).toBe('100% 9px, 100% 10.5px, 100% calc(100% - 18px)')

    // Record the card height on every frame while it collapses: intermediate heights prove the animation.
    const frames = await page.getByRole('region', { name: 'Spieler 1' }).evaluate(async card => {
      const heights: number[] = []
      card.querySelector<HTMLButtonElement>('[aria-expanded="true"]')!.click()
      const start = performance.now()
      while (performance.now() - start < 400) {
        await new Promise(requestAnimationFrame)
        heights.push(card.getBoundingClientRect().height)
      }
      return heights
    })
    expect(frames.some(value => value > collapsed + 1 && value < expanded - 1)).toBe(true)
    await expect(page.getByRole('region', { name: 'Spieler 1' }).getByRole('button', { name: 'Mitglied ändern' })).toHaveCount(0)
    await expect.poll(() => height(page, 1)).toBe(collapsed)
    expect(await noOverflow(page)).toBe(true)
  })

  test('reduced motion toggles immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.goto(`/playgroups/${group.id}/games/new`)
    await choose(page, 1, 1)
    const collapsed = await height(page, 1)
    await page.getByRole('button', { name: 'Spieler 1 bearbeiten' }).click()
    expect(await height(page, 1)).toBeGreaterThan(collapsed + 80)
    await page.getByRole('button', { name: 'Spieler 1 einklappen' }).click()
    await expect.poll(() => height(page, 1), { intervals: [20] }).toBe(collapsed)
  })
})
