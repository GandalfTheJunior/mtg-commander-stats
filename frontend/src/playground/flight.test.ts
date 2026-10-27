import { expect, test, vi } from 'vitest'
import { curve, depths, exteriorRegions, flightDuration, nextFlight } from './flight'

test('near depth couples larger/brighter/softer halos to strictly higher speed budgets', () => {
  for (let i = 1; i < depths.length; i++) {
    expect(depths[i].speed[0]).toBeGreaterThan(depths[i - 1].speed[1])
    expect(depths[i].radius).toBeGreaterThan(depths[i - 1].radius)
    expect(depths[i].brightness).toBeGreaterThan(depths[i - 1].brightness)
    expect(depths[i].halo).toBeGreaterThan(depths[i - 1].halo)
  }
  const durations = depths.map(d => flightDuration({ x: 0, y: 0 }, { x: 40, y: 60 }, { x: 80, y: 0 }, d.speed[0]))
  expect(durations[0]).toBeGreaterThan(durations[1])
  expect(durations[1]).toBeGreaterThan(durations[2])
})
test.each([[288, 240], [343, 286], [358, 298], [442, 425]])('exterior pockets avoid frame, glazing bars and caption at %i × %i', (w, h) => {
  const caption = h * .5
  const regions = exteriorRegions(w, h, caption)
  expect(regions).toHaveLength(2)
  for (const r of regions) {
    expect(r.left).toBeGreaterThan(w * .15)
    expect(r.top).toBeGreaterThan(h * .2)
    expect(r.top + r.height).toBeLessThan(h * .5)
    expect(r.top + r.height).toBeLessThanOrEqual(caption - 14)
    expect(r.left + r.width < w * .46 || r.left > w * .54).toBe(true)
    const from = { x: r.left, y: r.top }, to = { x: r.left + r.width, y: r.top }, control = { x: r.left, y: r.top + r.height }
    for (let i = 0; i <= 100; i++) {
      const p = curve(from, control, to, i / 100)
      expect(p.x).toBeGreaterThanOrEqual(r.left - .001)
      expect(p.x).toBeLessThanOrEqual(r.left + r.width + .001)
      expect(p.y).toBeGreaterThanOrEqual(r.top - .001)
      expect(p.y).toBeLessThanOrEqual(r.top + r.height + .001)
    }
  }
})
test('too-small exterior areas hide rather than leak points onto caption or frame', () => {
  expect(exteriorRegions(288, 240, 45)).toEqual([])
  expect(exteriorRegions(0, 0, 0)).toEqual([])
})

test('even repeated random points produce a real curved leg instead of a tiny slow near-flight', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(.5)
  const region = { left: 0, top: 0, width: 80, height: 60 }, from = { x: 40, y: 30 }
  const leg = nextFlight(region, from)
  expect(Math.hypot(leg.to.x - from.x, leg.to.y - from.y)).toBeGreaterThanOrEqual(30)
  expect(leg.control.x).toBeGreaterThanOrEqual(0)
  expect(leg.control.y).toBeGreaterThanOrEqual(0)
  random.mockRestore()
})
