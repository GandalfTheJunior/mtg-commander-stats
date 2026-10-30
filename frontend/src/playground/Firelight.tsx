import { useEffect, useLayoutEffect, useRef } from 'react'
import { cardLightLevel, createFirelightModel, reflectedLevels } from './firelightModel'

export function Firelight({ enabled, animated, strong = false }: { enabled: boolean; animated: boolean; strong?: boolean }) {
  const layer = useRef<HTMLDivElement>(null)
  const strongMode = useRef(strong)
  const repaint = useRef<(() => void) | null>(null)
  // Compare intensity without resetting event clocks or exposing a clipped frame.
  useLayoutEffect(() => { strongMode.current = strong; repaint.current?.() }, [strong])
  useEffect(() => {
    const room = layer.current?.parentElement
    if (!enabled || !room) return
    const model = createFirelightModel()
    let signal = { slow: 0, flutter: 0, flare: 0 }
    const paint = () => {
      const { a, b } = reflectedLevels(signal, strongMode.current)
      // Preserve the existing CSS-only static room/hall reflection contract.
      if (animated) {
        room.style.setProperty('--warm-a', a.toFixed(5))
        room.style.setProperty('--warm-b', b.toFixed(5))
      }
      room.style.setProperty('--card-fire', cardLightLevel(signal, strongMode.current).toFixed(5))
    }
    repaint.current = paint
    paint()
    let raf = 0, last: number | null = null, elapsed = 0, nextPaint = 1000 / 30
    const tick = (now: number) => {
      elapsed += last === null ? 0 : Math.min(now - last, 64)
      last = now
      if (elapsed >= nextPaint) {
        signal = model.sample(elapsed)
        paint(); nextPaint = (Math.floor(elapsed / (1000 / 30)) + 1) * (1000 / 30)
      }
      raf = requestAnimationFrame(tick)
    }
    const visibility = () => {
      cancelAnimationFrame(raf)
      last = null
      if (animated && !document.hidden) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => {
      cancelAnimationFrame(raf)
      repaint.current = null
      document.removeEventListener('visibilitychange', visibility)
      room.style.removeProperty('--warm-a')
      room.style.removeProperty('--warm-b')
      room.style.removeProperty('--card-fire')
    }
  }, [enabled, animated])
  return <div ref={layer} className="room-light" aria-hidden="true" hidden={!enabled}><i/><i/></div>
}
