import { useEffect, useRef } from 'react'

import { railPoint, smooth, random } from './flight'

export function Ambience({ enabled }: { enabled: boolean }) {
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled || !frame.current) return
    const root = frame.current
    const flies = Array.from(root.children) as HTMLElement[]
    const states = flies.map((_, i) => {
      const initialGlow = i % 3 === 2 ? 0 : random(.45, .85)
      return ({
      position: i / flies.length, from: i / flies.length, to: i / flies.length,
      start: 0, duration: random(2500, 6500),
      glow: initialGlow, glowFrom: initialGlow, glowTo: random(.55, 1), glowStart: 0, glowDuration: random(1200, 4500), glowHold: random(500, 3000),
    }) })
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
        if (elapsed - s.glowStart >= s.glowDuration + s.glowHold) {
          s.glowFrom = s.glow
          s.glowTo = Math.random() < .4 ? 0 : random(.55, 1)
          s.glowStart = elapsed
          s.glowDuration = random(1500, 4500)
          s.glowHold = random(800, 4000)
        }
        s.glow = s.glowFrom + (s.glowTo - s.glowFrom) * smooth(Math.min(1, (elapsed - s.glowStart) / s.glowDuration))
        const { x, y } = railPoint(width, height, s.position)
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
