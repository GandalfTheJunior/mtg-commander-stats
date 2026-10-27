import { useEffect, useRef } from 'react'
import { random, smooth } from './flight'

export function Firelight({ enabled, animated }: { enabled: boolean; animated: boolean }) {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const room = layer.current?.parentElement
    if (!enabled || !animated || !room) return
    const channels = [
      { from: .4, to: random(.35, .85), start: 0, duration: random(3000, 8000) },
      { from: .3, to: random(.2, .7), start: 0, duration: random(6500, 14000) },
    ]
    let raf = 0, last = 0, elapsed = 0, painted = -100
    const tick = (now: number) => {
      elapsed += last ? Math.min(now - last, 64) : 0
      last = now
      if (elapsed - painted >= 80) {
        channels.forEach((c, i) => {
          if (elapsed - c.start >= c.duration) {
            c.from = c.to
            c.to = random(.25, .85)
            c.start = elapsed
            c.duration = i ? random(6500, 14000) : random(3000, 8000)
          }
          const value = c.from + (c.to - c.from) * smooth((elapsed - c.start) / c.duration)
          room.style.setProperty(i ? '--warm-b' : '--warm-a', value.toFixed(4))
        })
        painted = elapsed
      }
      raf = requestAnimationFrame(tick)
    }
    const visibility = () => {
      cancelAnimationFrame(raf)
      last = 0
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
