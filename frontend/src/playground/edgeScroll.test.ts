import { afterEach, expect, test, vi } from 'vitest'
import { edgeVelocity, startEdgeScroll } from './edgeScroll'

afterEach(() => vi.restoreAllMocks())
test('edge speed increases progressively, remains bounded and is zero in the middle', () => {
  expect(edgeVelocity(400, 0, 800)).toBe(0)
  expect(edgeVelocity(770, 0, 800)).toBeGreaterThan(edgeVelocity(740, 0, 800))
  expect(edgeVelocity(900, 0, 800)).toBe(480)
  expect(edgeVelocity(-100, 0, 800)).toBe(-480)
})
test('edge loop remeasures after scrolling, and cancellation retires the scheduled frame', () => {
  let next: FrameRequestCallback = () => {}
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { next = cb; return 123 })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  const measure = vi.fn()
  const stop = startEdgeScroll(() => ({ y: window.innerHeight - 1 }), measure)
  next(10); next(26)
  expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number), behavior: 'instant' }))
  expect(measure).toHaveBeenCalled()
  stop()
  expect(cancel).toHaveBeenCalledWith(123)
  expect(raf).toHaveBeenCalledTimes(3)
})
test('invalid horizontal pointer never scrolls', () => {
  let next: FrameRequestCallback = () => {}
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { next = cb; return 123 })
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  const stop = startEdgeScroll(() => null, vi.fn())
  next(10); next(26)
  expect(scroll).not.toHaveBeenCalled()
  stop()
})
