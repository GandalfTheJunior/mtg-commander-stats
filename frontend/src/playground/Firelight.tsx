import { useEffect, useRef } from 'react'
import { random, smooth } from './flight'

export function Firelight({ enabled, animated }: { enabled: boolean; animated: boolean }) {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const room = layer.current?.parentElement
    if (!enabled || !animated || !room) return
    // Keep the spatial gradients untouched: a broad irregular swell plus two
    // smaller asynchronous flicker envelopes modulate only their existing intensity.
    const swell = { from: .4, to: .72, start: 0, duration: random(2800, 4800), high: true }
    const flickers = [0, 1].map(i => ({ from: 0, to: random(-.07, .09), start: 0, duration: random(800 + i * 200, 1800 + i * 500) }))
    let raf = 0, last: number | null = null, elapsed = 0, painted = -100
    const tick = (now: number) => {
      elapsed += last === null ? 0 : Math.min(now - last, 64)
      last = now
      if (elapsed - painted >= 64) {
        if (elapsed - swell.start >= swell.duration) {
          swell.from = swell.to; swell.high = !swell.high
          swell.to = swell.high ? random(.62, .78) : random(.22, .34)
          swell.start = elapsed; swell.duration = random(2600, 5700)
        }
        const base = swell.from + (swell.to - swell.from) * smooth((elapsed - swell.start) / swell.duration)
        flickers.forEach((c, i) => {
          if (elapsed - c.start >= c.duration) {
            c.from = c.to
            // Occasional modest peaks, with subsequent independently timed falloff.
            c.to = Math.random() < .15 ? random(.09, .14) : random(-.08, .08)
            c.start = elapsed; c.duration = random(800 + i * 200, 1800 + i * 500)
          }
          const shimmer = c.from + (c.to - c.from) * smooth((elapsed - c.start) / c.duration)
          const value = i ? .15 + base * .55 + shimmer * .65 : base + shimmer
          room.style.setProperty(i ? '--warm-b' : '--warm-a', Math.max(.14, Math.min(.9, value)).toFixed(4))
        })
        painted = elapsed
      }
      raf = requestAnimationFrame(tick)
    }
    const visibility = () => {
      cancelAnimationFrame(raf)
      last = null
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', visibility)
      room.style.removeProperty('--warm-a')
      room.style.removeProperty('--warm-b')
    }
  }, [enabled, animated])
  return <div ref={layer} className="room-light" aria-hidden="true" hidden={!enabled}><i/><i/></div>
}
