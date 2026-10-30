// Stable, untransformed list geometry: preview reflow never moves a threshold.
// Only slots above the pickup position use the new rule. Downward slots retain
// the original compacted-list midpoint rule, including its strict comparison.
export function insertionIndex(heights: number[], origin: number, previous: number, pointerY: number, gap = 12) {
  let top = 0
  const thresholds = heights.map(height => {
    const threshold = top + height * .95
    top += height + gap
    return threshold
  })
  let index = Math.min(previous, origin)
  while (index < origin && pointerY > thresholds[index] + 6) index++
  while (index > 0 && pointerY <= thresholds[index - 1]) index--
  if (index < origin) return index
  top = 0
  index = 0
  heights.forEach((height, i) => {
    if (i === origin) return
    if (pointerY > top + height / 2) index++
    top += height + gap
  })
  return Math.max(origin, index)
}
