import { expect, test, type Page, type TestInfo } from '@playwright/test'

// #199 read-only member decks with synthetic, non-sensitive API responses and generated artwork.
const id = (value: number) => `cccccccc-cccc-4ccc-8ccc-${String(value).padStart(12, '0')}`
const groupId = id(100)
const base = `/api/groups/${groupId}`
type Member = { userId: string; username: string; role: 'OWNER' | 'ADMIN' | 'MEMBER'; quickProfile?: boolean }
const viewer: Member = { userId: id(1), username: 'Gandalf', role: 'OWNER' }
const frodo: Member = { userId: id(4), username: 'Frodo', role: 'MEMBER' }
const quick: Member = { userId: id(5), username: 'Flinker Waschbär', role: 'MEMBER', quickProfile: true }
const roster: Member[] = [viewer, { userId: id(2), username: 'Saruman', role: 'ADMIN' }, { userId: id(3), username: 'Aragorn', role: 'MEMBER' }, quick, frodo]

let oracle = 400
const art = (name: string) => `https://cards.scryfall.io/art_crop/front/synthetic/${encodeURIComponent(name)}.svg`
const card = (name: string, colors: string[], position = 1) => {
  const printing = id(oracle + 200)
  return { name, position, oracleId: id(oracle++), selectionRef: { scryfallCardId: printing }, scryfallCardId: printing,
    canBeSoleCommander: true, requiresChosenColor: false, chosenColor: null, colorIdentity: colors, effectiveColorIdentity: colors,
    artworkFaceIndex: null, artCropUrl: art(name), illustrationId: null, artist: 'Synthetic artist', scryfallUri: null,
    pairing: { roles: [], partnerWith: [], variants: [] },
    cardFaces: [{ faceIndex: null, name, typeLine: 'Legendary Creature — Synthetic', oracleText: 'Synthetic rules text for screenshots.', imageUrl: null }] }
}
const companion = (name: string, colors: string[]) => {
  const { position: _position, pairing: _pairing, canBeSoleCommander: _sole, requiresChosenColor: _requires, chosenColor: _chosen, effectiveColorIdentity: _effective, ...rest } = card(name, colors)
  void [_position, _pairing, _sole, _requires, _chosen, _effective]
  return rest
}
const dragons = { id: id(201), name: 'Drachenpakt', colorIdentity: ['W', 'U', 'B', 'R', 'G'], companion: null,
  commanders: [card('The Ur-Dragon', ['W', 'U', 'B', 'R', 'G'])], manaBoxUrl: 'https://manabox.app/decks/Synthetic-Dragons_1' }
const elves = { id: id(202), name: 'Elfenrat', colorIdentity: ['B', 'G'], companion: null, commanders: [card('Lathril, Blade of the Elves', ['B', 'G'])] }
const partners = { id: id(203), name: 'Partnerkombo', colorIdentity: ['W', 'U', 'B', 'G'], companion: null,
  commanders: [card('Tymna the Weaver', ['W', 'B']), card('Thrasios, Triton Hero', ['U', 'G'], 2)] }
const superfriends = { id: id(204), name: 'Superfriends', colorIdentity: ['W', 'U', 'B', 'G'],
  commanders: [card("Atraxa, Praetors' Voice", ['W', 'U', 'B', 'G'])], companion: companion('Lurrus of the Dream-Den', ['W', 'B']) }
const extra = Array.from({ length: 6 }, (_, index) => ({ id: id(210 + index), name: `Testdeck mit langem Namen ${index + 1}`, colorIdentity: ['R'], companion: null,
  commanders: [card(`Synthetic Commander with a Long Name ${index + 1}`, ['R'])] }))
const short = [dragons, partners, superfriends]
const long = [dragons, elves, partners, superfriends, ...extra]

type DeckReply = unknown[] | { status: number }
async function mockApi(page: Page, decks: Record<string, DeckReply>, members = roster) {
  await page.route('https://cards.scryfall.io/**', async route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!.replace(/\.svg$/, ''))
    let hash = 0
    for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 360
    await route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220" viewBox="0 0 300 220">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hash},45%,55%)"/><stop offset="1" stop-color="hsl(${(hash + 60) % 360},40%,25%)"/></linearGradient></defs>
      <rect width="300" height="220" fill="url(#g)"/><circle cx="210" cy="70" r="38" fill="hsl(${(hash + 180) % 360},50%,75%)" opacity=".7"/>
      <path d="M0 180 L80 110 L150 160 L220 90 L300 150 L300 220 L0 220Z" fill="rgba(0,0,0,.35)"/></svg>` })
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const deckEntry = Object.entries(decks).find(([memberId]) => path === `${base}/members/${memberId}/decks`)
    if (path === '/api/me') await route.fulfill({ json: { id: viewer.userId, username: viewer.username } })
    else if (path === '/api/csrf') await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'demo' } })
    else if (path === '/api/groups') await route.fulfill({ json: [{ id: id(101), name: 'Freitagsrunde', role: 'MEMBER' }, { id: id(102), name: 'Spielabend', role: 'ADMIN' }] })
    else if (path === base) await route.fulfill({ json: { id: groupId, name: 'Commander-Runde', role: viewer.role, members } })
    else if (path === `${base}/ownership-transfer`) await route.fulfill({ status: 404, json: {} })
    else if (deckEntry) {
      const reply = deckEntry[1]
      await route.fulfill(Array.isArray(reply) ? { json: reply } : { status: reply.status, json: {} })
    } else await route.fulfill({ json: [] })
  })
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))))
  await page.evaluate(() => Promise.all([...document.images].map(image => image.complete ? undefined : image.decode().catch(() => undefined))))
  await page.screenshot({ path: info.outputPath(`${name}.png`) })
  if (process.env.MTG_SCREENSHOTS) await page.screenshot({ path: `${process.env.MTG_SCREENSHOTS}/${name}.png` })
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
const deckUrl = (member: Member) => `/playgroups/${groupId}/members/${member.userId}/decks`

for (const width of [320, 390, 1280]) {
  test(`member decks, search and empty/unavailable states at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    await mockApi(page, { [frodo.userId]: short, [quick.userId]: [], [id(3)]: long, [id(9)]: { status: 404 }, [id(2)]: [elves] })
    // A single deck always fits: no search field.
    await page.goto(`/playgroups/${groupId}/members/${id(2)}/decks`)
    await expect(page.getByRole('list', { name: 'Decks von Saruman' }).getByRole('listitem')).toHaveCount(1)
    await expect(page.getByRole('searchbox')).toHaveCount(0)
    await page.goto(deckUrl(frodo))
    const list = page.getByRole('list', { name: 'Decks von Frodo' })
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await expect(page.getByRole('heading', { level: 2, name: 'Frodos Decks' })).toBeVisible()
    await expect(page.getByText('Playgroup: Commander-Runde')).toBeVisible()
    // Search is offered exactly when the complete list overflows its bounded region (at 320px it already does).
    const overflows = await page.getByTestId('member-decks-region').evaluate(element => element.scrollHeight > element.clientHeight + 1)
    await expect(page.getByRole('searchbox')).toHaveCount(overflows ? 1 : 0)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true)
    const link = page.getByRole('link', { name: 'Drachenpakt: Deck in ManaBox ansehen (öffnet einen neuen Tab)' })
    await expect(link).toHaveAttribute('href', dragons.manaBoxUrl)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(list.getByRole('link')).toHaveCount(1)
    for (const button of await list.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `member-decks-01-overview-${width}`)

    // Artwork opens the shared full-card viewer; closing returns focus to the artwork.
    const thrasios = list.getByRole('button', { name: 'Karte anzeigen: Thrasios, Triton Hero' })
    await thrasios.click()
    const dialog = page.getByRole('dialog', { name: 'Thrasios, Triton Hero' })
    await expect(dialog).toBeVisible()
    await shot(page, info, `member-decks-01b-card-viewer-${width}`)
    await dialog.getByRole('button', { name: 'Schließen' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(thrasios).toBeFocused()

    // 02a: the complete list overflows its bounded region, so search appears and stays above the scrolling cards.
    await page.goto(`/playgroups/${groupId}/members/${id(3)}/decks`)
    const longList = page.getByRole('list', { name: 'Decks von Aragorn' })
    await expect(longList.getByRole('listitem')).toHaveCount(long.length)
    const search = page.getByRole('searchbox', { name: 'Deckname oder Commander suchen' })
    await expect(search).toBeVisible()
    const region = page.getByTestId('member-decks-region')
    expect(await region.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true)
    await region.evaluate(element => { element.scrollTop = 260 })
    await expect(search).toBeInViewport()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await region.evaluate(element => { element.scrollTop = 0 })
    await shot(page, info, `member-decks-02a-long-list-${width}`)
    // The shared viewer leaves the list's scroll position untouched.
    await region.evaluate(element => { element.scrollTop = 200 })
    const scrolledArt = longList.getByRole('button', { name: 'Karte anzeigen: Tymna the Weaver' })
    await scrolledArt.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await region.evaluate(element => element.scrollTop)).toBeGreaterThan(150)

    // 02b: Commander match keeps the search visible with one result.
    await search.fill('thrasios')
    await expect(longList.getByRole('listitem')).toHaveCount(1)
    await expect(search).toBeVisible()
    await shot(page, info, `member-decks-02b-commander-search-${width}`)
    // 02c: no results.
    await search.fill('Meerjungfrau')
    await expect(page.getByText('Keine Decks gefunden')).toBeVisible()
    await shot(page, info, `member-decks-02c-no-results-${width}`)
    await page.getByRole('button', { name: 'Suche zurücksetzen' }).click()
    await expect(search).toHaveValue('')
    await expect(search).toBeFocused()
    await expect(longList.getByRole('listitem')).toHaveCount(long.length)

    // 03a: zero eligible decks, with no create action even for a quick profile.
    await page.goto(deckUrl(quick))
    await expect(page.getByText('Keine verfügbaren Decks')).toBeVisible()
    await expect(page.getByRole('button', { name: /Deck erstellen/ })).toHaveCount(0)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await shot(page, info, `member-decks-03a-empty-${width}`)

    // 03b: target no longer in the fresh roster.
    await page.goto(`/playgroups/${groupId}/members/${id(9)}/decks`)
    await expect(page.getByText('Mitglied nicht mehr verfügbar')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Mitglieder-Decks' })).toBeVisible()
    await shot(page, info, `member-decks-03b-unavailable-${width}`)
  })
}

test('lost viewer access returns to Playgroups with the notice and no deck content', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { [frodo.userId]: { status: 403 } })
  await page.goto(deckUrl(frodo))
  await expect(page).toHaveURL(/\/playgroups$/)
  await expect(page.getByText('Du hast keinen Zugriff mehr auf diese Playgroup.')).toBeVisible()
  await expect(page.getByText('Drachenpakt')).toHaveCount(0)
  await shot(page, info, 'member-decks-03c-access-lost-390')
})

test('a Members row opens the decks and Back restores filter, search and list scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 })
  const many: Member[] = [viewer, ...Array.from({ length: 18 }, (_, index): Member => ({ userId: id(20 + index), username: `Spieler ${String(index + 1).padStart(2, '0')}`, role: 'MEMBER' }))]
  await mockApi(page, Object.fromEntries(many.map(member => [member.userId, short])), many)
  await page.goto(`/playgroups/${groupId}/members`)
  const directory = page.getByRole('list', { name: 'Aktive Mitglieder' })
  await expect(directory.getByRole('listitem')).toHaveCount(many.length)
  const search = page.getByRole('searchbox', { name: 'Mitglieder suchen' })
  await search.fill('spieler 1')
  await expect(directory.getByRole('listitem')).toHaveCount(9)
  await directory.evaluate(element => { element.scrollTop = 120 })
  const scroll = await directory.evaluate(element => element.scrollTop)
  expect(scroll).toBeGreaterThan(0)
  await directory.getByRole('button', { name: /^Spieler 14/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Spieler 14s Decks' })).toBeVisible()
  await page.getByRole('button', { name: 'Zurück zu Mitglieder' }).click()
  await expect(search).toHaveValue('spieler 1')
  await expect.poll(() => directory.evaluate(element => element.scrollTop)).toBe(scroll)
  // Browser Back behaves the same.
  await directory.getByRole('button', { name: /^Spieler 15/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Spieler 15s Decks' })).toBeVisible()
  await page.goBack()
  await expect(search).toHaveValue('spieler 1')
})
