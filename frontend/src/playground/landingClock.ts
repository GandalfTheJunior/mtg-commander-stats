// Advance by rendered frames, rather than skipping the landing when WebKit (or a
// busy mobile main thread) leaves a long gap. Native WAAPI still interpolates the
// transforms/easing; this clock supplies currentTime only while a drop is active.
export function startLandingClock(update: (elapsed: number) => boolean) {
  let frame = 0, previous: number | null = null, elapsed = 0
  const tick = (now: number) => {
    elapsed += previous === null ? 0 : Math.min(32, Math.max(0, now - previous))
    previous = now
    if (update(elapsed)) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
