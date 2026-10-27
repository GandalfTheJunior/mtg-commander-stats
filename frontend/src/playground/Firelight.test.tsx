import { act, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Firelight } from './Firelight'

afterEach(() => vi.restoreAllMocks())
test('shared reflected light updates retire on off, reduced motion and unmount', () => {
  let next: FrameRequestCallback = () => {}
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { next = cb; return 51 })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  vi.spyOn(Math, 'random').mockReturnValue(.8)
  const { container, rerender, unmount } = render(<div><Firelight enabled animated /></div>)
  const room = container.firstElementChild as HTMLElement
  act(() => next(100))
  const first = room.style.getPropertyValue('--warm-a')
  act(() => { for (let now = 116; now < 3100; now += 16) next(now) })
  expect(room.style.getPropertyValue('--warm-a')).not.toBe(first)
  expect(room.style.getPropertyValue('--warm-a')).not.toBe(room.style.getPropertyValue('--warm-b'))
  rerender(<div><Firelight enabled={false} animated /></div>)
  expect(cancel).toHaveBeenCalledWith(51)
  expect(room.style.getPropertyValue('--warm-a')).toBe('')
  const count = raf.mock.calls.length
  rerender(<div><Firelight enabled animated={false} /></div>)
  expect(raf.mock.calls.length).toBe(count)
  unmount()
})

test('strong reflected light visibly varies without saturating the existing 2.1 gain', () => {
  let next: FrameRequestCallback = () => {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { next = cb; return 52 })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(Math, 'random').mockReturnValue(.6)
  const { container } = render(<div><Firelight enabled animated strong /></div>)
  const room = container.firstElementChild as HTMLElement
  const samples: number[] = []
  act(() => { for (let t = 0; t <= 16000; t += 64) { next(t); samples.push(Number(room.style.getPropertyValue('--warm-a')) * 2.1) } })
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(.15)
  expect(samples.every(n => n > 0 && n < .977)).toBe(true)
  expect(samples.slice(1).every((n, i) => Math.abs(n - samples[i]) < .1)).toBe(true)
})


test('intensity comparison preserves the current phase, clocks and scheduled work', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(53)
  const rng = vi.spyOn(Math, 'random').mockReturnValue(.7)
  vi.spyOn(window, 'cancelAnimationFrame')
  const { container, rerender } = render(<div><Firelight enabled animated /></div>)
  const room = container.firstElementChild as HTMLElement
  const quiet = Number(room.style.getPropertyValue('--warm-a'))
  const calls = rng.mock.calls.length, frames = raf.mock.calls.length
  rerender(<div><Firelight enabled animated strong /></div>)
  expect(Number(room.style.getPropertyValue('--warm-a')) * 2.1).toBeGreaterThan(quiet)
  expect(Number(room.style.getPropertyValue('--warm-a')) * 2.1).toBeLessThan(.977)
  expect(rng.mock.calls.length).toBe(calls)
  expect(raf.mock.calls.length).toBe(frames)
  rerender(<div><Firelight enabled animated /></div>)
  expect(Number(room.style.getPropertyValue('--warm-a'))).toBeCloseTo(quiet, 5)
})

test('hidden time does not advance the fire, and retired listeners cannot restart it', () => {
  let next: FrameRequestCallback = () => {}
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { next = cb; return 54 })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const { container, unmount } = render(<div><Firelight enabled animated /></div>)
  act(() => { next(100); next(140) })
  const room = container.firstElementChild as HTMLElement, before = room.style.getPropertyValue('--warm-a')
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')) })
  expect(cancel).toHaveBeenCalledWith(54)
  const count = raf.mock.calls.length
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(raf.mock.calls.length).toBe(count)
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); next(100000) })
  expect(room.style.getPropertyValue('--warm-a')).toBe(before)
  unmount()
  expect(room.style.getPropertyValue('--warm-a')).toBe('')
  const retired = raf.mock.calls.length
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(raf.mock.calls.length).toBe(retired)
})
