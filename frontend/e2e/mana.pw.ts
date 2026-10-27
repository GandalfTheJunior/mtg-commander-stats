import { test, expect } from '@playwright/test'
const manaPercent = (n: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n)} %`
const expected: Record<string, [string, number, number, number | null][]> = {
  '6': [['R',12,4,33.33],['C',6,2,33.33],['U',6,1,16.67],['G',6,0,0],['W',0,0,null],['B',0,0,null]],
  '5': [['B',12,5,41.67],['G',12,3,25],['U',8,2,25],['C',4,1,25],['R',8,1,12.5],['W',10,0,0]],
  '4': [['U',16,9,56.25],['G',20,8,40],['W',20,7,35],['R',12,3,25],['B',18,4,22.22],['C',6,1,16.67]],
  '3': [['U',12,7,58.33],['G',12,6,50],['B',12,5,41.67],['R',9,2,22.22],['W',15,3,20],['C',0,0,null]],
  '2': [['R',10,7,70],['W',12,8,66.67],['B',8,4,50],['G',6,2,33.33],['U',12,3,25],['C',4,0,0]],
  'all': [['U',54,22,40.74],['B',50,18,36],['G',56,19,33.93],['R',51,17,33.33],['W',57,18,31.58],['C',20,4,20]],
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/lounge.html')
  await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
})

test('native frames: growing/shrinking fill and counter, interrupted FLIP continuity and exact endpoints', async ({ page }) => {
  const trace = await page.evaluate(async () => {
    const sample = () => Object.fromEntries([...document.querySelectorAll<HTMLElement>('.mana-row')].map(row => [row.dataset.color!, {
      y: row.getBoundingClientRect().top,
      value: parseFloat(row.querySelector<HTMLElement>('.mana-volume')!.style.width),
      counter: row.querySelector('.mana-counter')!.textContent!,
    }]))
    const change = (value: string) => (document.querySelector(`input[value="${value}"]`) as HTMLInputElement).click()
    const frames = async (until: (value: number) => boolean) => {
      const start = performance.now(); const samples = []
      do {
        await new Promise(requestAnimationFrame)
        samples.push(sample())
        if (performance.now() - start > 5000) throw new Error('Mana transition did not progress within 5 seconds')
      } while (!until(samples.at(-1)!.W.value))
      return samples
    }
    const before = sample()
    change('2')
    const grow = await frames(value => value > 50)
    const interrupted = sample()
    change('3')
    const shrink = await frames(value => value === 20)
    return { before, grow, interrupted, shrink }
  })
  expect(trace.grow.length).toBeGreaterThan(2)
  expect(trace.grow.some(s => s.W.value > trace.before.W.value && s.W.value < 66.67)).toBe(true)
  expect(Math.abs(trace.grow[0].W.y - trace.before.W.y)).toBeLessThan(3)
  expect(Math.abs(trace.shrink[0].W.y - trace.interrupted.W.y)).toBeLessThan(12)
  expect(trace.shrink.some(s => s.W.value < trace.interrupted.W.value && s.W.value > 20)).toBe(true)
  for (const sample of [...trace.grow, ...trace.shrink]) {
    for (const row of Object.values(sample)) {
      if (row.counter === '—') expect(row.value).toBe(0)
      // CSSOM serializes width with limited precision; text rounds to hundredths.
      else expect(Math.abs(Number(row.counter.replace(' %', '').replace(',', '.')) - row.value)).toBeLessThanOrEqual(0.0051)
    }
  }
  expect(trace.shrink.at(-1)!.W.value).toBe(20)
  expect(trace.grow.some(s => Math.abs(s.W.y - trace.before.W.y) > 10)).toBe(true)
  const finalOrder = await page.locator('.mana-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-color')))
  expect(finalOrder).toEqual(expected['3'].map(row => row[0]))
})

test('all filters, zero/missing semantics, live reduced motion, bubbles and unmount', async ({ page }) => {
  const bubbles = await page.locator('[data-color=W] .mana-bubble').evaluateAll(nodes => nodes.map(n => ({ delay: getComputedStyle(n).animationDelay, duration: getComputedStyle(n).animationDuration })))
  expect(new Set(bubbles.map(b => b.delay)).size).toBe(3)
  expect(new Set(bubbles.map(b => b.duration)).size).toBe(3)
  await page.getByRole('radio', { name: '2', exact: true }).check()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const filter of ['6', '5', '4', '3', '2', 'all']) {
    await page.getByRole('radio', { name: filter === 'all' ? 'Alle' : filter, exact: true }).check()
    expect(await page.locator('.mana-row').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-color')))).toEqual(expected[filter].map(row => row[0]))
    for (const [color, games, wins, rate] of expected[filter]) {
      const el = page.locator(`[data-color=${color}]`)
      await expect(el.locator('.mana-counter')).toHaveText(games ? manaPercent(rate!) : '—')
      await expect(el.locator('.mana-counts')).toContainText(`${games} Spiele · ${wins} Siege`)
      expect(await el.locator('.mana-volume').evaluate(n => parseFloat((n as HTMLElement).style.width))).toBe(rate ?? 0)
    }
  }
  expect(await page.locator('.mana-page').evaluate(n => n.getAnimations({ subtree: true }).length)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.locator('.mana-page').evaluate(n => n.getAnimations({ subtree: true }).length)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Die Lounge', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Auswahl bestätigen' })).toBeVisible()
  await expect(page.locator('.mana-page')).toHaveCount(0)
  expect(await page.evaluate(() => document.getAnimations().filter(a => (a.effect as KeyframeEffect)?.target?.classList.contains('mana-bubble')).length)).toBe(0)
})

for (const width of [320, 375, 390, 1280]) {
  test(`readable layout and focus at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByRole('heading', { name: 'Die Farben des Manas' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const box of await page.locator('.mana-filters label').evaluateAll(nodes => nodes.map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })))) {
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(32)
    }
    await page.getByRole('radio', { name: 'Alle', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: '2', exact: true })).toBeFocused()
    await expect(page.getByRole('radio', { name: '2', exact: true })).toBeChecked()
    await page.getByRole('radio', { name: 'Alle', exact: true }).check()
    await page.screenshot({ path: info.outputPath(`mana-${width}.png`), fullPage: true })
    await info.attach(`Mana ${width}px`, { path: info.outputPath(`mana-${width}.png`), contentType: 'image/png' })
    await page.goto('/dev/theme.html')
    await expect(page.locator('body')).not.toBeEmpty()
  })
}
