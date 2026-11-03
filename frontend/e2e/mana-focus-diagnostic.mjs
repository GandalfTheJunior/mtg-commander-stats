import { chromium, webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const engine = process.argv[2]
const browser = await ({ chromium, webkit })[engine].launch()
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5318', '--strictPort'], { stdio: 'ignore', detached: true })
const directory = `mana-focus-diagnostic-${engine}`
await mkdir(directory, { recursive: true })
const baselineCss = await readFile('e2e/mana-base-diagnostic.css', 'utf8')
const results = []
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch('http://127.0.0.1:5318/dev/lounge.html')).ok) break } catch { /* Wait for Vite. */ }
    if (attempt > 100) throw new Error('Vite did not start')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  for (const mobile of [true, false]) for (const version of ['base', 'head']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' })
    await page.goto('http://127.0.0.1:5318/dev/lounge.html')
    await page.getByRole('button', { name: 'Die Farben des Manas', exact: true }).click()
    if (version === 'base') await page.evaluate(css => {
      document.querySelector('style[data-vite-dev-id$="/mana.css"]').textContent = css
    }, baselineCss)
    const samples = []
    const sample = async step => samples.push(await page.evaluate(step => {
      const el = document.activeElement
      const style = el?.nextElementSibling ? getComputedStyle(el.nextElementSibling) : null
      return { step, tag: el?.tagName, type: el?.type, value: el?.value, text: el?.textContent?.slice(0, 60), focus: el?.matches(':focus'), focusVisible: el?.matches(':focus-visible'), outline: style?.outline, offset: style?.outlineOffset, shadow: style?.boxShadow }
    }, step))
    await page.locator('.mana-info summary').focus()
    await sample('summary.focus')
    await page.keyboard.press('Tab')
    await sample('Tab')
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await sample(`Tab/ArrowRight ${i + 1}`) }
    await page.screenshot({ path: `${directory}/${mobile ? 'mobile' : 'desktop'}-${version}-tab.png`, fullPage: true })
    await page.locator('.mana-info summary').focus()
    await page.keyboard.press('Alt+Tab')
    await sample('Alt+Tab')
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await sample(`Alt+Tab/ArrowRight ${i + 1}`) }
    await page.getByRole('radio', { name: 'Alle', exact: true }).focus()
    await sample('radio.focus')
    await page.keyboard.press('ArrowRight')
    await sample('radio.focus/ArrowRight')
    await page.screenshot({ path: `${directory}/${mobile ? 'mobile' : 'desktop'}-${version}-direct.png`, fullPage: true })
    await page.getByRole('radio', { name: '5', exact: true }).click()
    await sample('pointer click 5')
    await page.keyboard.press('ArrowRight')
    await sample('pointer/ArrowRight')
    results.push({ engine, mobile, version, samples })
    await page.close()
  }
  await writeFile(`${directory}/focus.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally {
  await browser.close()
  process.kill(-server.pid, 'SIGTERM')
}
