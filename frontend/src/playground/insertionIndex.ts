// Axis-relative entry distances keep both directions on the same rule. Geometry
// stays in original list order: preview transforms never move a threshold.
export function insertionIndex(heights: number[], origin: number, previous: number, pointerY: number, gap = 12) {
  let top = 0
  const cards = heights.map(height => {
    const card = { start: top, size: height }
    top += height + gap
    return card
  })
  const crosses = (slot: number, movement: number) => {
    const direction = slot < origin ? -1 : 1
    const target = cards[direction < 0 ? slot : slot + 1]
    const edge = target.start + (direction < 0 ? target.size : 0)
    const threshold = edge + direction * target.size * .05
    const penetration = direction * (pointerY - threshold)
    // Entry includes equality; retreat requires more than 6 CSS pixels.
    return movement === direction ? penetration >= 0 : penetration < -6
  }
  let index = previous
  while (index < heights.length - 1 && crosses(index, 1)) index++
  while (index > 0 && crosses(index - 1, -1)) index--
  return index
}
