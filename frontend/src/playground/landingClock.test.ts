import { afterEach, expect, test, vi } from 'vitest'
import { startLandingClock } from './landingClock'

afterEach(() => vi.unstubAllGlobals())

function frames() {
  let next = 0
  const pending = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
  return { pending, paint: (time: number) => {
    const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time))
  } }
}

test('a long browser frame cannot skip the meaningful landing; completion stops scheduling', () => {
  const { paint, pending } = frames(), seen: number[] = []
  startLandingClock(elapsed => { seen.push(elapsed); return elapsed < 80 })
  paint(1000); paint(1016); paint(1216); paint(1232); paint(1248)
  expect(seen).toEqual([0, 16, 48, 64, 80])
  expect(pending.size).toBe(0)
})

test('retiring a landing cancels its next frame without another update', () => {
  const { paint, pending } = frames(), update = vi.fn(() => true)
  const stop = startLandingClock(update)
  paint(1000); stop(); paint(1200)
  expect(update).toHaveBeenCalledOnce()
  expect(pending.size).toBe(0)
})
