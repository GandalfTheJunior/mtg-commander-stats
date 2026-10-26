import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@mui/material'

import { players, insert } from './ordering'
const gap = 12

type Drag = { id: string; pointer: number; x: number; y: number; dx: number; dy: number; width: number; height: number; preview: string[]; valid: boolean }

export function SortableTable({ order, onChange, reduced }: { order: string[]; onChange: (order: string[]) => void; reduced: boolean }) {
  const list = useRef<HTMLOListElement>(null)
  const cards = useRef(new Map<string, HTMLLIElement>())
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const current = useRef<Drag | null>(null)
  const [announcement, announce] = useState('')
  const update = (next: Drag | null) => { current.current = next; setDrag(next) }
  const cancel = useCallback(() => { current.current = null; setDrag(null); announce('Verschieben abgebrochen. Reihenfolge unverändert.') }, [])
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
    const retire = () => { if (current.current) cancel() }
    window.addEventListener('keydown', key)
    window.addEventListener('blur', retire)
    document.addEventListener('visibilitychange', retire)
    window.addEventListener('resize', retire)
    window.addEventListener('scroll', retire, true)
    return () => {
      current.current = null
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', retire)
      document.removeEventListener('visibilitychange', retire)
      window.removeEventListener('resize', retire)
      window.removeEventListener('scroll', retire, true)
    }
  }, [cancel])
  const positions = (ids: string[]) => {
    let y = 0
    return Object.fromEntries(ids.map(id => { const top = y; y += (heights[id] ?? 0) + gap; return [id, top] }))
  }
  const original = positions(order)
  const proposed = positions(drag?.preview ?? order)
  const tell = (ids: string[], id: string) => announce(`${players.find(p => p.id === id)!.name}: Position ${ids.indexOf(id) + 1} von ${ids.length}.`)
  const start = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || current.current) return
    const rect = cards.current.get(id)!.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    update({ id, pointer: event.pointerId, x: rect.x, y: rect.y, dx: event.clientX - rect.x, dy: event.clientY - rect.y, width: rect.width, height: rect.height, preview: order, valid: true })
    announce('Karte aufgenommen. Escape bricht ab.')
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = current.current
    if (!d || d.pointer !== event.pointerId || !list.current) return
    const bounds = list.current.getBoundingClientRect()
    const valid = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    // Stable thresholds use the compacted list, not the animated DOM bounds.
    const rest = order.filter(id => id !== d.id)
    const compact = positions(rest)
    const index = rest.filter(id => event.clientY - bounds.top > compact[id] + heights[id] / 2).length
    update({ ...d, x: event.clientX - d.dx, y: event.clientY - d.dy, valid, preview: valid ? insert(order, d.id, index) : order })
  }
  const drop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = current.current
    if (!d || d.pointer !== event.pointerId) return
    // Re-evaluate release coordinates as a release can arrive without a final move.
    move(event)
    const final = current.current!
    if (final.valid) { onChange(final.preview); tell(final.preview, final.id); update(null) } else cancel()
  }
  const content = (id: string) => {
    const p = players.find(p => p.id === id)!
    return <><span className={`deck-mark mark-${id}`} aria-hidden="true">{p.symbol}</span><div className="card-copy"><h3>{p.name}</h3><strong>{p.deck}</strong><p>{p.note}</p></div></>
  }
  return <>
    <p id="reorder-help" className="quiet">Am Griff ziehen oder mit ↑ / ↓ verschieben. Nur eine Demo-Reihenfolge.</p>
    <ol ref={list} className="table-cards" aria-label="Demo-Spieler" aria-describedby="reorder-help" style={{ minHeight: Object.values(heights).reduce((a, b) => a + b + gap, 0) }}>
      {order.map((id, index) => <li key={id} ref={node => { if (node) cards.current.set(id, node); else cards.current.delete(id) }} className={`player-card ${drag?.id === id ? 'insertion' : ''}`} style={{ transform: `translateY(${proposed[id] - original[id]}px)`, transition: reduced || !drag ? 'none' : undefined }}>
        <div className="card-face">{content(id)}</div>
        <div className="card-controls">
          <Button className="grip" color="secondary" aria-label={`${players.find(p => p.id === id)!.name} ziehen`} aria-describedby="reorder-help" onPointerDown={e => start(e, id)} onPointerMove={move} onPointerUp={drop} onPointerCancel={cancel} onLostPointerCapture={() => { if (current.current) cancel() }}>⠿</Button>
          <Button color="secondary" aria-label={`${id} nach oben`} disabled={index === 0 || !!drag} onClick={() => { const next = insert(order, id, index - 1); onChange(next); tell(next, id) }}>↑</Button>
          <Button color="secondary" aria-label={`${id} nach unten`} disabled={index === order.length - 1 || !!drag} onClick={() => { const next = insert(order, id, index + 1); onChange(next); tell(next, id) }}>↓</Button>
        </div>
      </li>)}
    </ol>
    {drag && <div className="player-card drag-overlay" aria-hidden="true" style={{ left: drag.x, top: drag.y, width: drag.width, height: drag.height }}><div className="card-face">{content(drag.id)}</div><div className="overlay-controls"><span>⠿</span><span>↑</span><span>↓</span></div><div className="overlay-label">{drag.valid ? 'Hier einfügen' : 'Außerhalb · Abbrechen'}</div></div>}
    <p className="sr-only" role="status">{announcement}</p>
  </>
}
