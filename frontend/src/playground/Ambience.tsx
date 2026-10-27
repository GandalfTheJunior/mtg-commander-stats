import { useEffect, useId, useRef } from 'react'
import type { RefObject } from 'react'
import { curve, depths, exteriorRegions, flightDuration, pointIn, smooth, random, nextFlight } from './flight'

export function Ambience({ enabled, caption }: { enabled: boolean; caption: RefObject<HTMLDivElement | null> }) {
  const rootRef = useRef<SVGGElement>(null)
  const halo = useId().replaceAll(':', '')
  useEffect(() => {
    const root = rootRef.current, svg = root?.ownerSVGElement
    if (!enabled || !root || !svg) return
    const nodes = Array.from(root.querySelectorAll<SVGGElement>('[data-depth]'))
    let width = 0, height = 0, elapsed = 0
    const makeStates = () => {
      const rect = svg.getBoundingClientRect()
      width = rect.width; height = rect.height
      const captionTop = caption.current ? caption.current.getBoundingClientRect().top - rect.top : height
      const regions = exteriorRegions(width, height, captionTop)
      root.style.visibility = regions.length ? 'visible' : 'hidden'
      return regions.length ? nodes.map((_, i) => {
        const depth = depths[i % depths.length], region = regions[i % 2], from = pointIn(region)
        return { depth, region, from, point: from, ...nextFlight(region, from), start: elapsed,
          duration: 0, hold: random(100, 1100), speed: random(depth.speed[0], depth.speed[1]),
          glow: i % 3 === 0 ? .65 : .9, glowFrom: .65, glowTo: random(.65, 1), glowStart: elapsed,
          glowDuration: random(1400, 3200), glowHold: random(1000, 4000) }
      }) : []
    }
    let states = makeStates()
    const resize = new ResizeObserver(() => { states = makeStates() })
    resize.observe(svg)
    if (caption.current) resize.observe(caption.current)
    let raf = 0, last: number | null = null
    const tick = (now: number) => {
      elapsed += last === null ? 0 : Math.min(now - last, 64)
      last = now
      states.forEach((s, i) => {
        if (!s.duration) s.duration = flightDuration(s.from, s.control, s.to, s.speed)
        if (elapsed - s.start >= s.duration + s.hold) {
          s.from = s.point
          const leg = nextFlight(s.region, s.from)
          s.control = leg.control; s.to = leg.to
          s.start = elapsed; s.duration = flightDuration(s.from, s.control, s.to, s.speed)
          s.hold = random(100, 1300)
        }
        s.point = curve(s.from, s.control, s.to, (elapsed - s.start) / s.duration)
        if (elapsed - s.glowStart >= s.glowDuration + s.glowHold) {
          s.glowFrom = s.glow; s.glowTo = Math.random() < .3 ? 0 : random(.65, 1)
          s.glowStart = elapsed; s.glowDuration = random(1400, 3600); s.glowHold = random(1000, 4500)
        }
        s.glow = s.glowFrom + (s.glowTo - s.glowFrom) * smooth((elapsed - s.glowStart) / s.glowDuration)
        const node = nodes[i], depth = s.depth
        node.setAttribute('transform', `translate(${s.point.x / width * 1000} ${s.point.y / height * 800})`)
        node.style.setProperty('--fly-alpha', String(s.glow * depth.brightness))
        for (const ellipse of node.querySelectorAll('ellipse')) {
          const scale = ellipse.classList.contains('fly-halo') ? depth.halo : 1
          ellipse.setAttribute('rx', String(depth.radius * scale / width * 1000))
          ellipse.setAttribute('ry', String(depth.radius * scale / height * 800))
        }
      })
      raf = requestAnimationFrame(tick)
    }
    const visibility = () => { cancelAnimationFrame(raf); last = null; if (!document.hidden) raf = requestAnimationFrame(tick) }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => { cancelAnimationFrame(raf); resize.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [enabled, caption])
  return <g ref={rootRef} className="fireflies" aria-hidden="true" style={{ display: enabled ? undefined : 'none' }}>
    <defs><radialGradient id={halo}><stop stopColor="#ffe8a8" stopOpacity=".65"/><stop offset=".35" stopColor="#f5c85d" stopOpacity=".22"/><stop offset="1" stopColor="#edb849" stopOpacity="0"/></radialGradient></defs>
    {Array.from({ length: 6 }, (_, i) => <g key={i} data-depth={depths[i % 3].name} className="firefly">
      <ellipse className="fly-halo" fill={`url(#${halo})`}/><ellipse fill="#ffe8a8"/>
    </g>)}
  </g>
}
