import { expect, test } from 'vitest'
import { insertionIndex } from './insertionIndex'

test('120px upward target requires exactly 6px pointer penetration independent of held height', () => {
  for (const held of [80, 300]) {
    expect(insertionIndex([120, held], 1, 1, 120)).toBe(1)
    expect(insertionIndex([120, held], 1, 1, 114.01)).toBe(1)
    expect(insertionIndex([120, held], 1, 1, 114)).toBe(0)
  }
})
test('six pixel hysteresis holds jitter and reverses deliberate retreat', () => {
  let index = 1
  for (const y of [114, 115, 113, 119, 114, 120]) {
    index = insertionIndex([120, 300], 1, index, y)
    expect(index).toBe(0)
  }
  expect(insertionIndex([120, 300], 1, index, 120.01)).toBe(1)
})
test('multiple unequal upward targets retain measured original thresholds', () => {
  const heights = [120, 220, 100, 170]
  expect(insertionIndex(heights, 3, 3, 459.01)).toBe(3)
  expect(insertionIndex(heights, 3, 3, 459)).toBe(2)
  expect(insertionIndex(heights, 3, 2, 341)).toBe(1)
  expect(insertionIndex(heights, 3, 1, 114)).toBe(0)
  expect(insertionIndex(heights, 3, 0, 348)).toBe(2)
  expect(insertionIndex(heights, 3, 2, 466)).toBe(3)
  expect(insertionIndex(heights, 3, 3, 100)).toBe(0)
})
test('downward insertion keeps original strict compacted midpoint thresholds', () => {
  for (const origin of [0, 1, 2, 3]) {
    const heights = [120, 220, 100, 170]
    for (let y = 480; y >= 0; y--) {
      let top = 0, old = 0
      heights.forEach((height, i) => {
        if (i === origin) return
        if (y > top + height / 2) old++
        top += height + 12
      })
      if (y >= heights.slice(0, origin).reduce((sum, h) => sum + h + 12, 0)) expect(insertionIndex(heights, origin, origin, y)).toBe(old)
    }
  }
})
