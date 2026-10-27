import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@mui/material'

import { players, insert } from './ordering'
import { startEdgeScroll } from './edgeScroll'
import { startLandingClock } from './landingClock'
import { measureOverlay, withinDropZone } from './landingGeometry'
import type { OverlayPose } from './landingGeometry'
const gap = 12

type Settling = { drag: Drag; before: Map<string, DOMRect>; order: string[]; release: OverlayPose; viewportWidth: number }
const settleOptions = { duration: 260, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' as const }

type Drag = { active: boolean; px: number; py: number; originX: number; originY: number; id: string; pointer: number; x: number; y: number; dx: number; dy: number; width: number; height: number; preview: string[]; valid: boolean }

export function SortableTable({ order, onChange, reduced }: { order: string[]; onChange: (order: string[]) => void; reduced: boolean }) {
  const list = useRef<HTMLOListElement>(null)
  const cards = useRef(new Map<string, HTMLLIElement>())
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const current = useRef<Drag | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const [settling, setSettling] = useState<Settling | null>(null)
  const settlingRef = useRef<Settling | null>(null)
  const animations = useRef<Animation[]>([])
  const landing = useRef<Animation | null>(null)
  const stopLandingClock = useRef<(() => void) | null>(null)
  const landingTime = useRef({ elapsed: 0, start: 0, duration: settleOptions.duration, endpoint: null as Animation | null })
  const stopAnimations = useCallback(() => {
    stopLandingClock.current?.(); stopLandingClock.current = null
    if (landing.current) { landing.current.onfinish = null; landing.current.cancel(); landing.current = null }
    for (const animation of animations.current) { animation.onfinish = null; animation.cancel() }
    animations.current = []
    settlingRef.current = null
  }, [])
  // Hold the filled endpoint until React reveals the real card. Cancelling here
  // would restore the release transform for a frame before the state commit.
  const finishSettling = useCallback(() => { settlingRef.current = null; setSettling(null) }, [])
  const animateLanding = useCallback((initial: boolean) => {
    const pending = settlingRef.current, node = overlay.current
    if (!pending || !node) return
    const target = cards.current.get(pending.drag.id)?.getBoundingClientRect()
    if (!target) { finishSettling(); return }
    const pose = initial ? pending.release : measureOverlay(node)
    // Rebase from the CURRENT displayed matrix on scroll/toolbar movement instead
    // of cancelling and revealing the real card at a different viewport position.
    node.style.transform = pose.transform
    if (landing.current) { landing.current.onfinish = null; landing.current.cancel() }
    if (initial) landingTime.current.elapsed = 0
    const time = landingTime.current
    time.start = time.elapsed; time.duration = initial ? settleOptions.duration : Math.max(80, settleOptions.duration - time.elapsed)
    time.endpoint = null
    const animation = node.animate([
      { transform: pose.transform },
      { transform: `translate(${target.left - pose.baseX}px, ${target.top - pose.baseY}px) rotate(0deg)` },
    ], { ...settleOptions, duration: time.duration })
    animation.pause(); animation.currentTime = 0
    landing.current = animation
    animation.onfinish = () => { if (settlingRef.current === pending) finishSettling() }
  }, [finishSettling])
  useLayoutEffect(() => {
    if (!settling) { stopAnimations(); return }
    if (reduced || settling.order.some((id, i) => id !== order[i]) || !overlay.current?.animate) {
      finishSettling()
      return
    }
    const target = cards.current.get(settling.drag.id)?.getBoundingClientRect()
    if (!target) { finishSettling(); return }
    // Invert the measured pre-commit visuals BEFORE paint after React reorders
    // keyed nodes. Intervening cards retain any in-flight preview displacement.
    for (const [id, node] of cards.current) {
      if (id === settling.drag.id) continue
      const before = settling.before.get(id), after = node.getBoundingClientRect()
      if (!before) continue
      const x = before.left - after.left, y = before.top - after.top
      if (Math.abs(x) + Math.abs(y) > .5) {
        const animation = node.animate([
          { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0px, 0px)' },
        ], settleOptions)
        animation.pause(); animation.currentTime = 0
        animations.current.push(animation)
      }
    }
    animateLanding(true)
    stopLandingClock.current = startLandingClock(elapsed => {
      const animation = landing.current, time = landingTime.current
      if (!animation || !settlingRef.current) return false
      // Paint the endpoint before handing ownership back to React.
      if (time.endpoint === animation) { finishSettling(); return false }
      time.elapsed = elapsed
      for (const effect of animations.current) effect.currentTime = Math.min(elapsed, settleOptions.duration)
      const progress = Math.min(time.duration, elapsed - time.start)
      animation.currentTime = progress
      if (progress === time.duration) time.endpoint = animation
      return true
    })
  }, [settling, reduced, order, finishSettling, animateLanding, stopAnimations])
  const stopScroll = useRef<(() => void) | null>(null)
  const focusAfterMove = useRef<{ id: string; direction: 'up' | 'down' } | null>(null)
  const geometry = useRef({ order, heights })
  useLayoutEffect(() => { geometry.current = { order, heights } }, [order, heights])
  useLayoutEffect(() => {
    const pending = focusAfterMove.current
    if (!pending) return
    const card = cards.current.get(pending.id)
    const intended = card?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction}"]`)
    const fallback = card?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction === 'up' ? 'down' : 'up'}"]`)
    const target = intended?.disabled ? fallback : intended
    target?.focus()
    focusAfterMove.current = null
  }, [order])
  const [announcement, announce] = useState('')
  const update = (next: Drag | null) => { current.current = next; setDrag(next) }
  const cancel = useCallback(() => { stopScroll.current?.(); stopScroll.current = null; current.current = null; setDrag(null); announce('Verschieben abgebrochen. Reihenfolge unverändert.') }, [])
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      const next: Record<string, number> = {}
      cards.current.forEach((node, id) => { next[id] = node.getBoundingClientRect().height })
      setHeights(next)
    })
    cards.current.forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && current.current) cancel() }
    const retire = () => { if (current.current) cancel(); finishSettling() }
    window.addEventListener('keydown', key)
    window.addEventListener('blur', retire)
    document.addEventListener('visibilitychange', retire)
    const resize = () => {
      if (current.current) cancel()
      const pending = settlingRef.current
      if (!pending) return
      if (window.innerWidth !== pending.viewportWidth) finishSettling()
      else animateLanding(false)
    }
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    const viewportScroll = () => { if (settlingRef.current) animateLanding(false) }
    window.visualViewport?.addEventListener('scroll', viewportScroll)
    return () => {
      stopScroll.current?.()
      stopAnimations()
      current.current = null
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', retire)
      document.removeEventListener('visibilitychange', retire)
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', viewportScroll)
    }
  }, [cancel, finishSettling, stopAnimations, animateLanding])
  const positions = (ids: string[]) => {
    let y = 0
    return Object.fromEntries(ids.map(id => { const top = y; y += (heights[id] ?? 0) + gap; return [id, top] }))
  }
  const original = positions(order)
  const proposed = positions(drag?.active ? drag.preview : order)
  const tell = (ids: string[], id: string) => announce(`${players.find(p => p.id === id)!.name}: Position ${ids.indexOf(id) + 1} von ${ids.length}.`)
  const refresh = useCallback(() => {
    const d = current.current
    if (!d?.active || !list.current) return
    const bounds = list.current.getBoundingClientRect()
    const valid = withinDropZone(d.px, d.py, bounds)
    const { order: ids, heights: measured } = geometry.current
    const rest = ids.filter(id => id !== d.id)
    let top = 0, index = 0
    for (const id of rest) {
      if (d.py - bounds.top > top + measured[id] / 2) index++
      top += measured[id] + gap
    }
    const next = { ...d, x: d.px - d.dx, y: d.py - d.dy, valid, preview: valid ? insert(ids, d.id, index) : ids }
    current.current = next
    setDrag(next)
  }, [])
  useEffect(() => {
    const scroll = () => {
      const pending = settlingRef.current
      if (pending) animateLanding(false)
      refresh()
    }
    window.addEventListener('scroll', scroll, true)
    return () => window.removeEventListener('scroll', scroll, true)
  }, [refresh, animateLanding])
  const start = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || current.current) return
    finishSettling()
    const rect = cards.current.get(id)!.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    update({ active: false, px: event.clientX, py: event.clientY, originX: event.clientX, originY: event.clientY, id, pointer: event.pointerId, x: rect.x, y: rect.y, dx: event.clientX - rect.x, dy: event.clientY - rect.y, width: rect.width, height: rect.height, preview: order, valid: true })
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = current.current
    if (!d || d.pointer !== event.pointerId) return
    const active = d.active || Math.hypot(event.clientX - d.originX, event.clientY - d.originY) >= 6
    current.current = { ...d, px: event.clientX, py: event.clientY, active }
    if (active && !d.active) {
      announce('Karte aufgenommen. Escape bricht ab.')
      stopScroll.current = startEdgeScroll(() => {
        const currentDrag = current.current
        const bounds = list.current?.getBoundingClientRect()
        return currentDrag?.active && bounds && currentDrag.px >= bounds.left && currentDrag.px <= bounds.right ? { y: currentDrag.py, upLimit: Math.max(0, currentDrag.py - bounds.top), downLimit: Math.max(0, bounds.bottom - currentDrag.py) } : null
      }, refresh)
    }
    refresh()
  }
  const drop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = current.current
    if (!d || d.pointer !== event.pointerId) return
    const release = overlay.current ? measureOverlay(overlay.current) : null
    move(event)
    const final = current.current!
    stopScroll.current?.()
    stopScroll.current = null
    if (!final.active) { update(null); return }
    if (final.valid) {
      if (!reduced && release && overlay.current?.animate) {
        const next: Settling = { drag: final, order: final.preview, before: new Map(Array.from(cards.current, ([id, node]) => [id, node.getBoundingClientRect()])), release, viewportWidth: window.innerWidth }
        settlingRef.current = next
        setSettling(next)
      }
      if (final.preview.some((id, i) => id !== order[i])) onChange(final.preview)
      tell(final.preview, final.id)
      update(null)
    } else cancel()
  }
  const moveByButton = (id: string, index: number, direction: 'up' | 'down') => {
    finishSettling()
    focusAfterMove.current = { id, direction }
    const next = insert(order, id, index)
    onChange(next)
    tell(next, id)
  }
  const content = (id: string) => {
    const p = players.find(p => p.id === id)!
    return <><span className={`deck-mark mark-${id}`} aria-hidden="true">{p.symbol}</span><div className="card-copy"><h3>{p.name}</h3><strong>{p.deck}</strong><p>{p.note}</p></div></>
  }
  const visualDrag = drag?.active ? drag : settling?.drag
  return <>
    <p id="reorder-help" className="quiet">Am Griff ziehen oder mit ↑ / ↓ verschieben. Nur eine Demo-Reihenfolge.</p>
    <ol ref={list} className="table-cards" aria-label="Demo-Spieler" aria-describedby="reorder-help" style={{ overflowAnchor: 'none', minHeight: Object.values(heights).reduce((a, b) => a + b + gap, 0) }}>
      {order.map((id, index) => <li key={id} ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id) }} className={`player-card ${(drag?.active && drag.id === id) || settling?.drag.id === id ? 'insertion' : ''}`} style={{ transform: `translateY(${proposed[id] - original[id]}px)`, transition: reduced || !drag ? 'none' : undefined }}>
        <div className="card-face">{content(id)}</div>
        <div className="card-controls">
          <Button className="grip" color="secondary" aria-label={`${players.find(p => p.id === id)!.name} ziehen`} aria-describedby="reorder-help" onPointerDown={e => start(e, id)} onPointerMove={move} onPointerUp={drop} onPointerCancel={event => { if (current.current?.pointer === event.pointerId) cancel() }} onLostPointerCapture={() => { if (current.current) cancel() }}>⠿</Button>
          <Button color="secondary" data-move="up" aria-label={`${id} nach oben`} disabled={index === 0 || !!drag?.active} onClick={() => moveByButton(id, index - 1, 'up')}>↑</Button>
          <Button color="secondary" data-move="down" aria-label={`${id} nach unten`} disabled={index === order.length - 1 || !!drag?.active} onClick={() => moveByButton(id, index + 1, 'down')}>↓</Button>
        </div>
      </li>)}
    </ol>
    {visualDrag && <div ref={overlay} className={`player-card drag-overlay ${settling ? 'settling-overlay' : ''}`} aria-hidden="true" style={{ left: settling?.release.left ?? visualDrag.x, top: settling?.release.top ?? visualDrag.y, width: settling?.release.width ?? visualDrag.width, height: settling?.release.height ?? visualDrag.height, transform: settling?.release.transform ?? (reduced ? 'none' : undefined), transformOrigin: settling?.release.transformOrigin }}><div className="card-face">{content(visualDrag.id)}</div><div className="overlay-controls"><span>⠿</span><span>↑</span><span>↓</span></div><div className="overlay-label">{visualDrag.valid ? 'Hier einfügen' : 'Außerhalb · Abbrechen'}</div></div>}
    <p className="sr-only" role="status">{announcement}</p>
  </>
}
