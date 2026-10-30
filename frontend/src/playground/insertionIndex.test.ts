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
test('120px downward target requires exactly 6px penetration in original geometry', () => {
  for (const held of [80, 300]) {
    const threshold = held + 19 + 6
    for (const [offset, expected] of [[-.01, 0], [0, 1], [.01, 1]]) {
      expect(insertionIndex([held, 120], 0, 0, threshold + offset, 19)).toBe(expected)
    }
    expect(insertionIndex([held, 120], 0, 0, held + 19, 19)).toBe(0)
    let index = 0
    for (const y of [threshold, threshold - 1, threshold + 1, threshold - 6]) {
      index = insertionIndex([held, 120], 0, index, y, 19)
      expect(index).toBe(1)
    }
    expect(insertionIndex([held, 120], 0, index, threshold - 6.01, 19)).toBe(0)
    expect(insertionIndex([held, 120], 0, 0, threshold, 19)).toBe(1)
  }
})
test('upward threshold includes equality and just beyond with a nonzero gap', () => {
  for (const [offset, expected] of [[.01, 2], [0, 1], [-.01, 1]]) {
    expect(insertionIndex([80, 120, 300], 2, 2, 99 + 114 + offset, 19)).toBe(expected)
  }
})
test('unequal targets, multi-slot jumps and reversal across the pickup slot', () => {
  const heights = [120, 220, 100, 170]
  let index = 1
  for (const [y, expected] of [[368.99, 1], [369, 2], [484.5, 3], [479, 3],
    [478.49, 2], [363, 2], [362.99, 1], [114, 0], [120, 0], [120.01, 1],
    [600, 3], [100, 0], [600, 3]]) {
    index = insertionIndex(heights, 1, index, y)
    expect(index).toBe(expected)
  }
})
test('reflecting the axis gives symmetric results including jitter and multi-slot jumps', () => {
  const heights = [120, 220, 100, 170]
  const total = heights.reduce((a, b) => a + b, 0) + 3 * 19
  for (let origin = 0; origin < 4; origin++) {
    let index = origin, mirrored = 3 - origin
    for (const y of [100, 114, 115, 400, 600, 590, 470, 200, 100, 0, total]) {
      index = insertionIndex(heights, origin, index, y, 19)
      mirrored = insertionIndex([...heights].reverse(), 3 - origin, mirrored, total - y, 19)
      expect(index).toBe(3 - mirrored)
    }
  }
})
