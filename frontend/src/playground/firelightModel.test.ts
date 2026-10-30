import { expect, test } from 'vitest'
import { cardLightLevel, createFirelightModel, flareEnvelope, reflectedLevels } from './firelightModel'

test('card illumination shares flare direction with the room, has distinct modes and peak headroom', () => {
  const model = createFirelightModel(seeded(156))
  let previous = cardLightLevel(model.sample(0), true)
  const samples: number[] = []
  for (let t = 33; t < 120000; t += 33) {
    const signal = model.sample(t)
    const quiet = cardLightLevel(signal, false), strong = cardLightLevel(signal, true)
    expect(quiet).toBeGreaterThan(.15)
    expect(strong).toBeGreaterThan(quiet)
    expect(strong).toBeLessThan(.84)
    expect(Math.abs(strong - previous)).toBeLessThan(.07)
    previous = strong; samples.push(strong)
    const flare = { ...signal, flare: signal.flare + .04 }
    expect(cardLightLevel(flare, true)).toBeGreaterThan(strong)
    expect(reflectedLevels(flare, true).a).toBeGreaterThan(reflectedLevels(signal, true).a)
  }
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(.2)
})

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}

test('a reference-shaped flare rises quickly and releases gently without edge jumps', () => {
  expect(flareEnvelope(-1, 300, 900)).toBe(0)
  expect(flareEnvelope(0, 300, 900)).toBe(0)
  expect(flareEnvelope(300, 300, 900)).toBe(1)
  expect(flareEnvelope(1200, 300, 900)).toBe(0)
  expect(flareEnvelope(150, 300, 900)).toBeCloseTo(.5)
  expect(flareEnvelope(750, 300, 900)).toBeCloseTo(.5)
  expect(flareEnvelope(299, 300, 900)).toBeCloseTo(flareEnvelope(301, 300, 900), 4)
})
test('reference-informed timing is deterministic with a seed and has irregular event gaps', () => {
  const a = createFirelightModel(seeded(77)), b = createFirelightModel(seeded(77))
  const starts: number[] = []; let previous = 0
  for (let t = 0; t < 120000; t += 33) {
    const sample = a.sample(t)
    expect(sample).toEqual(b.sample(t))
    if (!previous && sample.flare > 0) starts.push(t)
    previous = sample.flare
  }
  expect(starts.length).toBeGreaterThan(10)
  const gaps = starts.slice(1).map((t, i) => t - starts[i])
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(1500)
})
test('base glow persists and both modes retain headroom and bounded frame changes', () => {
  const model = createFirelightModel(seeded(42))
  let previous = reflectedLevels(model.sample(0), true).a * 2.1, largestStep = 0
  const quiet: number[] = [], strong: number[] = []
  for (let t = 33; t < 120000; t += 33) {
    const sample = model.sample(t), q = reflectedLevels(sample, false), s = reflectedLevels(sample, true)
    quiet.push(q.a); strong.push(s.a * 2.1)
    expect(q.a).toBeGreaterThan(.3)
    expect(s.a * 2.1).toBeLessThan(.977)
    expect(s.b * 2.1).toBeGreaterThan(0)
    expect(s.b * 2.1).toBeLessThan(1)
    largestStep = Math.max(largestStep, Math.abs(s.a * 2.1 - previous)); previous = s.a * 2.1
  }
  expect(Math.max(...strong) - Math.min(...strong)).toBeGreaterThan(.2)
  expect(Math.max(...strong) - Math.min(...strong)).toBeGreaterThan(Math.max(...quiet) - Math.min(...quiet))
  expect(largestStep).toBeLessThan(.08)
})
test('slow baseline can remain on the same side instead of alternating compulsory highs/lows', () => {
  const model = createFirelightModel(() => .8)
  for (let t = 0; t <= 40000; t += 33) expect(model.sample(t).slow).toBeGreaterThanOrEqual(0)
})
