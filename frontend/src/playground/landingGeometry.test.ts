import { expect, test } from 'vitest'
import { withinDropZone } from './landingGeometry'

test('fractional native edge-scroll rounding remains a valid insertion, while outside drops cancel', () => {
  const bounds = { left: 16, right: 374, top: 20.4375, bottom: 794.3125 } as DOMRect
  expect(withinDropZone(51, 20, bounds)).toBe(true)
  expect(withinDropZone(51, 795, bounds)).toBe(true)
  expect(withinDropZone(51, 18, bounds)).toBe(false)
  expect(withinDropZone(380, 200, bounds)).toBe(false)
})
