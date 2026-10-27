// Pixels/second: quadratic ramp in a bounded viewport edge band.
export function edgeVelocity(y: number, top: number, height: number) {
  const band = Math.min(80, height / 4)
  const ramp = (distance: number) => Math.min(1, Math.max(0, distance / band)) ** 2
  return 480 * (ramp(y - (top + height - band)) - ramp(top + band - y))
}

// One loop per active gesture. The caller owns capture and synchronously stops
// this loop on every exit, including unmount. Scroll events remeasure hit targets.
export function startEdgeScroll(pointer: () => { y: number; upLimit?: number; downLimit?: number } | null, remeasure: () => void) {
  let frame = 0
  let last: number | null = null
  const tick = (now: number) => {
    const p = pointer()
    if (p) {
      const viewport = window.visualViewport
      const speed = edgeVelocity(p.y, viewport?.offsetTop ?? 0, viewport?.height ?? window.innerHeight)
      const desired = speed * Math.min(last === null ? 0 : now - last, 32) / 1000
      const delta = Math.max(-(p.upLimit ?? Infinity), Math.min(p.downLimit ?? Infinity, desired))
      if (delta) {
        window.scrollBy({ top: delta, behavior: 'instant' })
        remeasure()
      }
    }
    last = now
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
