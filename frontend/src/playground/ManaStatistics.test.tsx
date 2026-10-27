import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ManaStatistics } from './ManaStatistics'
import { manaDataset, manaPercent } from './manaData'

afterEach(() => vi.restoreAllMocks())
test('filters keep six keyed rows and distinguish missing observations from measured zero', () => {
  const { container } = render(<ManaStatistics />)
  const white = container.querySelector('[data-color=W]')
  fireEvent.click(screen.getByRole('radio', { name: '6' }))
  expect(container.querySelector('[data-color=W]')).toBe(white)
  expect(Array.from(container.querySelectorAll('.mana-row')).map(e => e.getAttribute('data-color'))).toEqual(['R', 'C', 'U', 'G', 'W', 'B'])
  expect(white).toHaveTextContent('Keine Daten vorhanden')
  expect(container.querySelector('[data-color=G]')).toHaveTextContent('6 Spiele · 0 Siege')
  expect(screen.getByRole('radio', { name: '6' })).toBeChecked()
})
test('counter and fill rebase on interruption, land exactly, cancel on hide and unmount', () => {
  let now = 0
  let callback: FrameRequestCallback = () => {}
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { callback = cb; return 42 })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const { container, unmount } = render(<ManaStatistics />)
  const white = container.querySelector('[data-color=W]')!
  const fill = () => parseFloat((white.querySelector('.mana-volume') as HTMLElement).style.width)
  fireEvent.click(screen.getByRole('radio', { name: '2' }))
  act(() => callback(now))
  now = 200; act(() => callback(now))
  const mid = fill()
  expect(mid).toBeGreaterThan(manaDataset('all').find(r => r.color === 'W')!.winRatePercent!)
  expect(mid).toBeLessThan(66.67)
  expect(white.querySelector('.mana-counter')).toHaveTextContent(manaPercent(mid))
  fireEvent.click(screen.getByRole('radio', { name: '3' }))
  expect(fill()).toBe(mid)
  act(() => callback(now))
  for (let i = 0; i < 18; i++) { now += 32; act(() => callback(now)) }
  expect(fill()).toBe(20)
  expect(white.querySelector('.mana-counter')).toHaveTextContent('20 %')
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  const calls = raf.mock.calls.length
  expect(container.querySelector('.mana-page')).toHaveAttribute('data-paused', 'true')
  expect(cancel).toHaveBeenCalledWith(42)
  unmount()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(raf).toHaveBeenCalledTimes(calls)
})
