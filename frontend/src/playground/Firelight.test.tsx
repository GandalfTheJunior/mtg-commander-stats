import { act, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Firelight } from './Firelight'

afterEach(() => vi.restoreAllMocks())
test('independent reflected light updates retire on off, reduced motion and unmount', () => {
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

test('existing gradients receive a visible swell with bounded asynchronous flicker', () => {
  let next: FrameRequestCallback = () => {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { next = cb; return 52 })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(Math, 'random').mockReturnValue(.6)
  const { container } = render(<div><Firelight enabled animated /></div>)
  const room = container.firstElementChild as HTMLElement
  const samples: number[] = []
  act(() => { for (let t = 0; t <= 16000; t += 64) { next(t); samples.push(Number(room.style.getPropertyValue('--warm-a'))) } })
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(.3)
  expect(samples.every(n => n >= .14 && n <= .9)).toBe(true)
  expect(samples.slice(1).every((n, i) => Math.abs(n - samples[i]) < .04)).toBe(true)
})
