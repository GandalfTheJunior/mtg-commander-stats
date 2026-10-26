import { useEffect, useRef } from 'react'

// Both clocks use smooth interpolation, but independent random destinations and
// durations. No recurring CSS particle paths; only six small DOM nodes are moved.
const smooth = (t: number) => t * t * (3 - 2 * t)
const random = (min: number, max: number) => min + Math.random() * (max - min)

export function Ambience({ enabled }: { enabled: boolean }) {
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled || !frame.current) return
    const root = frame.current
    const flies = Array.from(root.children) as HTMLElement[]
    const states = flies.map((_, i) => ({
      position: i / flies.length, from: i / flies.length, to: i / flies.length,
      start: 0, duration: random(2500, 6500),
      glow: 0, glowFrom: 0, glowTo: random(.2, .85), glowStart: 0, glowDuration: random(1200, 4500),
    }))
    let width = root.clientWidth, height = root.clientHeight
    const resize = new ResizeObserver(() => { width = root.clientWidth; height = root.clientHeight })
    resize.observe(root)
    let raf = 0, last = 0, elapsed = 0
    const tick = (now: number) => {
      elapsed += last ? Math.min(now - last, 64) : 0
      last = now
      states.forEach((s, i) => {
        if (elapsed - s.start >= s.duration || s.start === 0) {
          s.from = s.position
          // Short excursions along the perimeter, with occasional near-pauses.
          s.to = s.from + random(-.1, .1)
          s.start = elapsed || .001
          s.duration = random(2200, 7300)
        }
        s.position = s.from + (s.to - s.from) * smooth(Math.min(1, (elapsed - s.start) / s.duration))
        if (elapsed - s.glowStart >= s.glowDuration) {
          s.glowFrom = s.glow
          s.glowTo = Math.random() < .4 ? 0 : random(.25, .9)
          s.glowStart = elapsed
          s.glowDuration = random(1500, 6000)
        }
        s.glow = s.glowFrom + (s.glowTo - s.glowFrom) * smooth(Math.min(1, (elapsed - s.glowStart) / s.glowDuration))
        const p = ((s.position % 1) + 1) % 1
        // Rounded rectangular orbit stays inside the window's decorative rail.
        const angle = p * Math.PI * 2
        const x = width / 2 + (width / 2 - 13) * Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), .25)
        const y = height / 2 + (height / 2 - 13) * Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), .25)
        flies[i].style.transform = `translate(${x}px, ${y}px)`
        flies[i].style.opacity = String(s.glow)
      })
      raf = requestAnimationFrame(tick)
    }
    const visibility = () => {
      cancelAnimationFrame(raf)
      last = 0
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => { cancelAnimationFrame(raf); resize.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [enabled])
  return <div ref={frame} className="fireflies" aria-hidden="true" hidden={!enabled}>
    {Array.from({ length: 6 }, (_, i) => <i key={i} />)}
  </div>
}
