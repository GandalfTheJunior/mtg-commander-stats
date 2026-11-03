import { test, expect, type Locator } from '@playwright/test'

async function expectKeyboardRing(radio: Locator) {
  // Check real focus separately: WebKit can lose :focus-visible on native arrows.
  await expect(radio).toBeFocused()
  await expect(radio).toBeChecked()
  const focus = await radio.evaluate(node => {
    const style = getComputedStyle(node.nextElementSibling!)
    return {
      active: document.activeElement === node, focus: node.matches(':focus'), focusVisible: node.matches(':focus-visible'),
      width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset),
      outline: style.outlineStyle, color: style.outlineColor,
    }
  })
  expect(focus.active).toBe(true)
  expect(focus.focus).toBe(true)
  expect(focus.outline, JSON.stringify(focus)).toBe('solid')
  expect(focus.width).toBeGreaterThanOrEqual(3)
  expect(focus.offset).toBeLessThan(0)
  expect(focus.color).toBe('rgb(255, 240, 215)')
}
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
      time: row.getAnimations()[0]?.currentTime as number | undefined,
      duration: row.getAnimations()[0]?.effect?.getTiming().duration,
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
  for (const sample of trace.grow) expect(sample.W.counter).toMatch(/^\d+ %$/)
  expect(trace.grow.some(s => s.W.value % 1 !== 0)).toBe(true)
  for (const sample of [...trace.grow, ...trace.shrink]) {
    for (const row of Object.values(sample)) {
      if (row.counter === '—') expect(row.value).toBe(0)
      // The exact final frame retains decimals; intermediate counters round only text.
      else {
        if (row.time !== undefined) expect(row.counter).toMatch(/^\d+ %$/)
        const textValue = Number(row.counter.replace(' %', '').replace(',', '.'))
        expect(Math.abs(textValue - row.value)).toBeLessThanOrEqual(0.5001)
        if (row.counter.includes(',')) expect(Math.abs(textValue - row.value)).toBeLessThanOrEqual(0.0051)
      }
    }
  }
  const moving = trace.shrink.filter(s => s.W.time !== undefined)
  expect(moving.length).toBeGreaterThan(2)
  for (const sample of moving) {
    expect(sample.W.duration).toBe(605)
    const progress = 1 - (1 - sample.W.time! / 605) ** 3
    expect(sample.W.value).toBeCloseTo(trace.interrupted.W.value + (20 - trace.interrupted.W.value) * progress, 3)
  }
  expect(trace.shrink.at(-1)!.W.value).toBe(20)
  expect(trace.grow.some(s => Math.abs(s.W.y - trace.before.W.y) > 10)).toBe(true)
  const finalOrder = await page.locator('.mana-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-color')))
  expect(finalOrder).toEqual(expected['3'].map(row => row[0]))
})

test('native frames preserve exact initial and unchanged fractional rates', async ({ page }) => {
  const trace = await page.evaluate(async () => {
    const sample = () => Object.fromEntries([...document.querySelectorAll<HTMLElement>('.mana-row')].map(row => [row.dataset.color!, {
      value: parseFloat(row.querySelector<HTMLElement>('.mana-volume')!.style.width),
      counter: row.querySelector('.mana-counter')!.textContent!,
      accessible: row.querySelector('.mana-sr')!.textContent!,
    }]))
    const initial = [sample()]
    for (let i = 0; i < 6; i++) { await new Promise(requestAnimationFrame); initial.push(sample()) }
    const six = document.querySelector('input[value="6"]') as HTMLInputElement
    six.click()
    const update = []
    const start = performance.now()
    do {
      await new Promise(requestAnimationFrame)
      update.push(sample())
      if (performance.now() - start > 5000) throw new Error('Mana transition did not finish within 5 seconds')
    } while (update.at(-1)!.U.counter !== '16,67 %')
    return { initial, update }
  })
  for (const sample of trace.initial) {
    for (const [color, , , rate] of expected.all) {
      expect(sample[color].counter).toBe(manaPercent(rate!))
      expect(sample[color].accessible).toBe(manaPercent(rate!))
      expect(sample[color].value).toBe(rate)
    }
  }
  expect(trace.update.length).toBeGreaterThan(2)
  expect(trace.update.some(s => s.U.value > 16.67 && s.U.value < 40.74)).toBe(true)
  for (const sample of trace.update) {
    expect(sample.R.counter).toBe('33,33 %')
    expect(sample.R.accessible).toBe('33,33 %')
    expect(sample.R.value).toBe(33.33)
    expect(sample.U.accessible).toBe('16,67 %')
    if (sample.U.counter !== '16,67 %') {
      expect(sample.U.counter).toMatch(/^\d+ %$/)
      expect(Math.abs(Number(sample.U.counter.replace(' %', '')) - sample.U.value)).toBeLessThanOrEqual(0.5001)
    }
  }
  expect(trace.update.at(-1)!.U.counter).toBe('16,67 %')
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

test('parchment loads locally on all seven foreground surfaces and keyboard focus stays inside the selector', async ({ page }) => {
  const surfaces = page.locator('.mana-filters > div, .mana-row')
  const images = await surfaces.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundImage))
  expect(images).toHaveLength(7)
  const texture = images[0].match(/url\("?([^")]+)"?\)/)![1]
  expect(texture).toContain('paper-grain')
  expect(new URL(texture).origin).toBe(new URL(page.url()).origin)
  for (const image of images) {
    expect(image).toContain(texture)
    expect(image).not.toContain('mana-walnut')
  }
  expect(await page.evaluate(async source => {
    const image = new Image()
    image.src = source
    await image.decode()
    return image.naturalWidth > 0 && image.naturalHeight > 0
  }, texture)).toBe(true)
  const panel = page.locator('.mana-parchment')
  await expect(panel).toHaveCSS('background-image', /mana-walnut/)
  const wood = (await panel.evaluate(node => getComputedStyle(node).backgroundImage)).match(/url\("?([^")]+)"?\)/)![1]
  expect(new URL(wood).origin).toBe(new URL(page.url()).origin)
  expect(await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode()
    return image.naturalWidth > 0 && image.naturalHeight > 0
  }, wood)).toBe(true)
  const radio = page.getByRole('radio', { name: 'Alle', exact: true })
  await page.locator('.mana-info summary').focus()
  await page.keyboard.press('Tab')
  await expectKeyboardRing(radio)
  // Walk both directions without assuming the engines wrap at group boundaries.
  for (const name of ['2', '3', '4', '5', '6']) {
    await page.keyboard.press('ArrowRight')
    await expectKeyboardRing(page.getByRole('radio', { name, exact: true }))
  }
  for (const name of ['5', '4', '3', '2', 'Alle']) {
    await page.keyboard.press('ArrowLeft')
    await expectKeyboardRing(page.getByRole('radio', { name, exact: true }))
  }
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.mana-info summary')).toBeFocused()
  await expect(page.locator('.mana-filters input:focus')).toHaveCount(0)
  await expect(page.locator('.mana-filters')).toHaveAttribute('data-keyboard-focus', 'false')
  await page.keyboard.press('Tab')
  await expectKeyboardRing(radio)

  for (const pointer of ['mouse', 'touch'] as const) {
    const five = page.getByRole('radio', { name: '5', exact: true })
    if (pointer === 'mouse') await five.click()
    else await five.tap()
    await expect(five).toBeChecked()
    await expect(page.locator('.mana-filters')).toHaveAttribute('data-keyboard-focus', 'false')
    await expect(five.locator('+ span')).toHaveCSS('outline-style', 'none')
    await page.keyboard.press('ArrowRight')
    await expectKeyboardRing(page.getByRole('radio', { name: '6', exact: true }))
  }
})

test.describe('desktop native keyboard focus', () => {
  test.use({ isMobile: false, hasTouch: false })

  test('Tab and arrows show a ring; mouse selection clears the fallback', async ({ page }) => {
    await page.locator('.mana-info summary').focus()
    await page.keyboard.press('Tab')
    await expectKeyboardRing(page.getByRole('radio', { name: 'Alle', exact: true }))
    await page.keyboard.press('ArrowRight')
    await expectKeyboardRing(page.getByRole('radio', { name: '2', exact: true }))
    const three = page.getByRole('radio', { name: '3', exact: true })
    await three.click()
    await expect(three.locator('+ span')).toHaveCSS('outline-style', 'none')
    await page.keyboard.press('ArrowLeft')
    await expectKeyboardRing(page.getByRole('radio', { name: '2', exact: true }))
  })
})

for (const [width, height] of [[320, 568], [320, 844], [375, 812], [390, 844], [1280, 1000]]) {
  test(`readable layout and focus at ${width}×${height}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByRole('heading', { name: 'Die Farben des Manas' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const box of await page.locator('.mana-filters label').evaluateAll(nodes => nodes.map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })))) {
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth }))
    if (width === 375 || width === 390) expect(dimensions.scrollHeight).toBeLessThanOrEqual(height)
    await info.attach('page-measurements', { body: JSON.stringify(dimensions), contentType: 'application/json' })
    await page.getByRole('radio', { name: 'Alle', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: '2', exact: true })).toBeFocused()
    await expect(page.getByRole('radio', { name: '2', exact: true })).toBeChecked()
    await expectKeyboardRing(page.getByRole('radio', { name: '2', exact: true }))
    await page.screenshot({ path: info.outputPath(`mana-focus-${width}-${height}.png`), fullPage: true })
    await info.attach(`Mana keyboard focus ${width}px`, { path: info.outputPath(`mana-focus-${width}-${height}.png`), contentType: 'image/png' })
    await page.getByRole('radio', { name: 'Alle', exact: true }).check()
    await page.screenshot({ path: info.outputPath(`mana-${width}-${height}.png`), fullPage: true })
    await info.attach(`Mana ${width}px`, { path: info.outputPath(`mana-${width}-${height}.png`), contentType: 'image/png' })
    await page.getByRole('radio', { name: '6', exact: true }).check()
    if (width === 375 || width === 390) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height)
    await expect(page.getByText('Keine Daten vorhanden', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`mana-empty-${width}-${height}.png`), fullPage: true })
    await info.attach(`Mana missing and zero values ${width}px`, { path: info.outputPath(`mana-empty-${width}-${height}.png`), contentType: 'image/png' })
    await page.locator('.mana-info summary').click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await expect(page.locator('.mana-info p')).toBeVisible()
    await page.goto('/dev/theme.html')
    await expect(page.locator('body')).not.toBeEmpty()
  })
}
