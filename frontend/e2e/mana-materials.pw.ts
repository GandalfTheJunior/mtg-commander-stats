import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'

const baseline = '2e83ab5940bb865951132aeaa1969fc34a2dad42'
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const baselineCss = git('show', `${baseline}:frontend/src/playground/mana.css`)
  .replaceAll("url('./", "url('/src/playground/")

// Reproduce A with its exact CSS, only while its rendering inputs remain intact.
test.beforeAll(() => {
  for (const file of ['ManaStatistics.tsx', 'manaData.ts', 'landingClock.ts', 'paper-grain.webp', 'mana-walnut.webp']) {
    expect(git('diff', baseline, '--', `src/playground/${file}`)).toBe('')
  }
})

for (const [width, height] of [[320, 568], [375, 812], [390, 844], [1280, 1000]]) {
  test.describe(`${width}px material profile`, () => {
    test.use({ isMobile: width < 600, hasTouch: width < 600 })
    test(`material comparison A and B at ${width}×${height}`, async ({ page, context }, info) => {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/dev/lounge.html')
      await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
      const style = page.locator('style[data-vite-dev-id$="/playground/mana.css"]')
      const currentCss = await style.textContent()
      expect(currentCss).toBeTruthy()
      const head = git('rev-parse', 'HEAD')
      const dirty = git('status', '--porcelain') !== ''
      await info.attach('source-commits', {
        body: JSON.stringify({ A: baseline, B: head, worktreeDirty: dirty, width, height, reducedMotion: true,
          reproduction: 'A uses the exact baseline CSS with unchanged component, data, clock and local assets; B uses the current checkout.' }),
        contentType: 'application/json',
      })
      for (const [state, filter, focus] of [['all', 'Alle', false], ['keyboard-2', '2', true], ['zero-missing-6', '6', false]] as const) {
        const captures: Buffer[] = []
        let content: string | undefined
        for (const [variant, css] of [['A', baselineCss], ['B', currentCss!]]) {
          await style.evaluate((node, text) => { node.textContent = text }, css)
          await expect(page.locator('.mana-parchment')).toHaveCSS('background-image', variant === 'A' ? /paper-grain/ : /mana-walnut/)
          await expect(page.locator('.mana-row').first()).toHaveCSS('background-image', variant === 'A' ? /mana-walnut/ : /paper-grain/)
          if (focus) {
            await page.getByRole('radio', { name: 'Alle', exact: true }).check()
            await page.locator('.mana-info summary').focus()
            await page.keyboard.press('Tab')
            await page.keyboard.press('ArrowRight')
            const radio = page.getByRole('radio', { name: filter, exact: true })
            await expect(radio).toBeFocused()
            await expect(radio.locator('+ span')).toHaveCSS('outline-style', 'solid')
          } else await page.getByRole('radio', { name: filter, exact: true }).check()
          await expect(page.getByRole('radio', { name: filter, exact: true })).toBeChecked()
          await expect(page.locator('.mana-row')).toHaveCount(6)
          const text = await page.locator('.mana-parchment').innerText()
          if (content !== undefined) expect(text).toBe(content)
          content = text
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
          // Decode both materials before capturing; CSS replacement changes no data.
          await page.evaluate(async () => {
            const urls = [...document.querySelectorAll('.mana-parchment, .mana-row')]
              .flatMap(node => [...getComputedStyle(node).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)].map(match => match[1]))
            await Promise.all([...new Set(urls)].map(async url => { const image = new Image(); image.src = url; await image.decode() }))
          })
          const path = info.outputPath(`${variant}-${state}-${width}x${height}.png`)
          captures.push(await page.screenshot({ path, fullPage: true }))
          await info.attach(`${variant} ${state}`, { path, contentType: 'image/png' })
        }
        // Compose actual captures in a separate browser page, without resizing them.
        const comparison = await context.newPage()
        await comparison.setViewportSize({ width: width * 2 + 24, height: height + 100 })
        await comparison.setContent(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
          body{margin:0;padding:8px;background:#201a1e;color:#fff0d7;font:14px system-ui}
          main{display:flex;gap:8px}section{width:${width}px;flex:none}p{margin:4px 0;overflow-wrap:anywhere}img{display:block;width:100%}
          </style><main>${captures.map((capture, i) => `<section><p>${i ? 'B: parchment cards / wood backdrop' : 'A: wood cards / parchment backdrop'}</p><p>${i ? (dirty ? `Working tree at ${head}` : head) : baseline}</p><p>${width}×${height} · ${state} · reduced motion</p><img src="data:image/png;base64,${capture.toString('base64')}"></section>`).join('')}</main></html>`)
        const path = info.outputPath(`AB-${state}-${width}x${height}.png`)
        await comparison.screenshot({ path, fullPage: true })
        await info.attach(`A versus B ${state}`, { path, contentType: 'image/png' })
        await comparison.close()
      }
    })
  })
}
