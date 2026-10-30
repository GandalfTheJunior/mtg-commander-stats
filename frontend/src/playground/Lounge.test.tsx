import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppThemeProvider } from '../theme/AppThemeProvider'
import { Lounge } from './Lounge'
import { initialOrder, insert } from './ordering'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => vi.unstubAllGlobals())
const open = () => render(<AppThemeProvider><Lounge /></AppThemeProvider>)
const names = () => within(screen.getByRole('list', { name: 'Demo-Spieler' })).getAllByRole('heading').map(n => n.textContent)

test('insertion shifts intervening players in both directions, without swaps', () => {
  expect(insert(initialOrder, 'mira', 3)).toEqual(['orin', 'lumi', 'fenn', 'mira'])
  expect(insert(initialOrder, 'fenn', 0)).toEqual(['fenn', 'mira', 'orin', 'lumi'])
})
test('keyboard-accessible buttons reorder, announce and reset the local demo', () => {
  open()
  expect(screen.getByRole('button', { name: 'mira nach oben' })).toBeDisabled()
  const down = screen.getByRole('button', { name: 'mira nach unten' })
  down.focus()
  fireEvent.click(down)
  expect(names()).toEqual(['Orin', 'Mira', 'Lumi', 'Fenn'])
  expect(screen.getByText('Mira: Position 2 von 4.')).toBeInTheDocument()
  expect(down).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'mira nach oben' }))
  expect(names()).toEqual(['Mira', 'Orin', 'Lumi', 'Fenn'])
  fireEvent.click(screen.getByRole('button', { name: /zurücksetzen/ }))
  expect(names()).toEqual(['Mira', 'Orin', 'Lumi', 'Fenn'])
})
test('buttons give meaningful local feedback; ambience toggles and intensity reset', () => {
  const { container } = open()
  expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl bestätigen' }))
  expect(screen.getByRole('button', { name: /Auswahl bestätigt/ })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel starten' }))
  expect(screen.getByText(/Demo-Runde 1 gestartet/)).toBeVisible()
  fireEvent.click(screen.getByRole('switch', { name: 'Kaminlicht' }))
  expect(container.querySelector('.room-light')).toHaveAttribute('hidden')
  fireEvent.click(screen.getByRole('switch', { name: 'Glühwürmchen' }))
  expect(container.querySelector('.fireflies')).toHaveStyle({ display: 'none' })
  fireEvent.click(screen.getByRole('button', { name: 'Deutlich' }))
  expect(container.querySelector('.lounge')).toHaveAttribute('data-intensity', 'strong')
  fireEvent.click(screen.getByRole('button', { name: /zurücksetzen/ }))
  expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeDisabled()
  expect(container.querySelector('.lounge')).toHaveAttribute('data-intensity', 'quiet')
  expect(screen.getByRole('switch', { name: 'Kaminlicht' })).toBeChecked()
})
test('OS reduced motion overrides enabled decoration, including strong intensity', () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => true }))
  const { container } = open()
  fireEvent.click(screen.getByRole('button', { name: 'Deutlich' }))
  expect(container.querySelector('.lounge')).toHaveAttribute('data-reduced', 'true')
  expect(container.querySelector('.fireflies')).toHaveStyle({ display: 'none' })
  fireEvent.click(screen.getByRole('button', { name: 'mira nach unten' }))
  expect(names()[1]).toBe('Mira')
  vi.restoreAllMocks()
})
test('firefly work pauses while hidden and retires on disable/unmount', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const { unmount } = open()
  expect(raf).toHaveBeenCalled()
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(cancel).toHaveBeenCalledWith(42)
  const count = raf.mock.calls.length
  expect(raf.mock.calls.length).toBe(count)
  fireEvent.click(screen.getByRole('switch', { name: 'Glühwürmchen' }))
  unmount()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(raf.mock.calls.length).toBe(count)
  vi.restoreAllMocks()
})

test('a confirmed selection survives an unchanged grip tap', () => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1 })
  Element.prototype.setPointerCapture = vi.fn()
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl bestätigen' }))
  const grip = screen.getByRole('button', { name: 'Mira ziehen' })
  fireEvent.pointerDown(grip, { clientX: 30, clientY: 30, button: 0 })
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 30 })
  expect(screen.getByRole('button', { name: /Auswahl bestätigt/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeEnabled()
})
test('a live OS preference change overrides strong ambience and stops scheduled motion', () => {
  const original = window.matchMedia
  const changes = new EventTarget()
  let reduced = false
  const mql = {
    get matches() { return reduced }, media: '(prefers-reduced-motion: reduce)', onchange: null,
    addEventListener: changes.addEventListener.bind(changes), removeEventListener: changes.removeEventListener.bind(changes),
    addListener() {}, removeListener() {}, dispatchEvent: changes.dispatchEvent.bind(changes),
  }
  vi.spyOn(window, 'matchMedia').mockImplementation(q => q.includes('prefers-reduced-motion') ? mql : original(q))
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(89)
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const { container } = open()
  fireEvent.click(screen.getByRole('button', { name: 'Deutlich' }))
  const before = raf.mock.calls.length
  act(() => { reduced = true; changes.dispatchEvent(new Event('change')) })
  expect(container.querySelector('.lounge')).toHaveAttribute('data-reduced', 'true')
  expect(container.querySelector('.fireflies')).toHaveStyle({ display: 'none' })
  expect(cancel).toHaveBeenCalledWith(89)
  fireEvent.click(screen.getByRole('switch', { name: 'Kaminlicht' }))
  fireEvent.click(screen.getByRole('switch', { name: 'Kaminlicht' }))
  expect(raf.mock.calls.length).toBe(before)
  vi.restoreAllMocks()
})

test('design comparison preserves repeated actions and reset restores initial wax design', () => {
  const { container } = open()
  const toggle = screen.getByRole('switch', { name: 'Wachssiegel-Design' })
  expect(toggle).toBeChecked()
  expect(container.querySelectorAll('.wax-button')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl bestätigen' }))
  fireEvent.click(toggle)
  expect(container.querySelector('.wax-button')).toBeNull()
  expect(screen.getByRole('button', { name: /Auswahl bestätigt/ })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Spiel starten' }))
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Spiel starten' }))
  expect(screen.getByText(/Demo-Runde 2 gestartet/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Auswahl bestätigt/ }))
  expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeDisabled()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: /Demo zurücksetzen/ }))
  expect(toggle).toBeChecked()
  expect(container.querySelectorAll('.wax-button')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeDisabled()
})
