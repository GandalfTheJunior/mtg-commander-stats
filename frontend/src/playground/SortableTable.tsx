import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@mui/material'

import { players, insert } from './ordering'
import { startEdgeScroll } from './edgeScroll'
const gap = 12

type Settling = { drag: Drag; before: Map<string, DOMRect>; order: string[]; scrollX: number; scrollY: number }
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
  const stopAnimations = useCallback(() => {
    for (const animation of animations.current) { animation.onfinish = null; animation.cancel() }
    animations.current = []
    settlingRef.current = null
  }, [])
  const finishSettling = useCallback(() => { stopAnimations(); setSettling(null) }, [stopAnimations])
  useLayoutEffect(() => {
    if (!settling) return
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
      if (Math.abs(x) + Math.abs(y) > .5) animations.current.push(node.animate([
        { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0px, 0px)' },
      ], settleOptions))
    }
    // Same overlay DOM node survives pointer release/DOM reorder. The real card
    // remains hidden until this whole-card visual lands precisely on its slot.
    const landing = overlay.current.animate([
      { transform: 'translate(0px, 0px) rotate(-1deg)' },
      { transform: `translate(${target.left - settling.drag.x}px, ${target.top - settling.drag.y}px) rotate(0deg)` },
    ], settleOptions)
    animations.current.push(landing)
    landing.onfinish = () => { if (settlingRef.current === settling) finishSettling() }
  }, [settling, reduced, order, finishSettling])
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
    window.addEventListener('resize', retire)
    return () => {
      stopScroll.current?.()
      stopAnimations()
      current.current = null
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', retire)
      document.removeEventListener('visibilitychange', retire)
      window.removeEventListener('resize', retire)
    }
  }, [cancel, finishSettling, stopAnimations])
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
    const valid = d.px >= bounds.left && d.px <= bounds.right && d.py >= bounds.top && d.py <= bounds.bottom
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
      if (pending && (pending.scrollX !== window.scrollX || pending.scrollY !== window.scrollY)) finishSettling()
      refresh()
    }
    window.addEventListener('scroll', scroll, true)
    return () => window.removeEventListener('scroll', scroll, true)
  }, [refresh, finishSettling])
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
    move(event)
    const final = current.current!
    stopScroll.current?.()
    stopScroll.current = null
    if (!final.active) { update(null); return }
    if (final.valid) {
      if (!reduced && overlay.current?.animate) {
        const next: Settling = { drag: final, order: final.preview, before: new Map(Array.from(cards.current, ([id, node]) => [id, node.getBoundingClientRect()])), scrollX: window.scrollX, scrollY: window.scrollY }
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
    <ol ref={list} className="table-cards" aria-label="Demo-Spieler" aria-describedby="reorder-help" style={{ minHeight: Object.values(heights).reduce((a, b) => a + b + gap, 0) }}>
      {order.map((id, index) => <li key={id} ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id) }} className={`player-card ${(drag?.active && drag.id === id) || settling?.drag.id === id ? 'insertion' : ''}`} style={{ transform: `translateY(${proposed[id] - original[id]}px)`, transition: reduced || !drag ? 'none' : undefined }}>
        <div className="card-face">{content(id)}</div>
        <div className="card-controls">
          <Button className="grip" color="secondary" aria-label={`${players.find(p => p.id === id)!.name} ziehen`} aria-describedby="reorder-help" onPointerDown={e => start(e, id)} onPointerMove={move} onPointerUp={drop} onPointerCancel={() => { if (current.current) cancel(); else finishSettling() }} onLostPointerCapture={() => { if (current.current) cancel() }}>⠿</Button>
          <Button color="secondary" data-move="up" aria-label={`${id} nach oben`} disabled={index === 0 || !!drag?.active} onClick={() => moveByButton(id, index - 1, 'up')}>↑</Button>
          <Button color="secondary" data-move="down" aria-label={`${id} nach unten`} disabled={index === order.length - 1 || !!drag?.active} onClick={() => moveByButton(id, index + 1, 'down')}>↓</Button>
        </div>
      </li>)}
    </ol>
    {visualDrag && <div ref={overlay} className={`player-card drag-overlay ${settling ? 'settling-overlay' : ''}`} aria-hidden="true" style={{ left: visualDrag.x, top: visualDrag.y, width: visualDrag.width, height: visualDrag.height }}><div className="card-face">{content(visualDrag.id)}</div><div className="overlay-controls"><span>⠿</span><span>↑</span><span>↓</span></div><div className="overlay-label">{visualDrag.valid ? 'Hier einfügen' : 'Außerhalb · Abbrechen'}</div></div>}
    <p className="sr-only" role="status">{announcement}</p>
  </>
}
