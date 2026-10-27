import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useMediaQuery } from '@mui/material'
import { appTheme } from '../theme/theme'
import { manaDataset, manaNames, manaPercent, type ManaFilter } from './manaData'
import './mana.css'

export function ManaStatistics() {
  const [filter, setFilter] = useState<ManaFilter>('all')
  const [hidden, setHidden] = useState(document.hidden)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const list = useRef<HTMLOListElement>(null)
  const displayed = useRef<Record<string, number>>({})
  const positions = useRef<Record<string, number>>({})
  const moves = useRef<Animation[]>([])
  const rows = manaDataset(filter)
  useEffect(() => {
    const change = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  // Snapshot the actual visual position, including any interrupted WAAPI transform.
  function select(next: ManaFilter) {
    if (next === filter) return
    positions.current = Object.fromEntries(Array.from(list.current!.children).map(el => [el.getAttribute('data-color')!, el.getBoundingClientRect().top]))
    setFilter(next)
  }
  useLayoutEffect(() => {
    const elements = Array.from(list.current!.children) as HTMLElement[]
    moves.current.forEach(animation => animation.cancel())
    moves.current = []
    const targets = manaDataset(filter)
    const start = { ...displayed.current }
    const paint = (progress: number) => elements.forEach(el => {
      const row = targets.find(row => row.color === el.dataset.color)!
      const target = row.winRatePercent ?? 0
      const from = start[row.color] ?? target
      const value = from + (target - from) * progress
      // Missing observations have no visual numerical value, even in transition.
      const visible = row.games ? value : 0
      displayed.current[row.color] = visible
      el.querySelector<HTMLElement>('.mana-volume')!.style.width = `${visible}%`
      el.querySelector<HTMLElement>('.mana-counter')!.textContent = row.games ? manaPercent(value) : '—'
    })
    elements.forEach(el => {
      const old = positions.current[el.dataset.color!]
      const delta = old === undefined ? 0 : old - el.getBoundingClientRect().top
      if (!reduced && !hidden && delta && el.animate) {
        moves.current.push(el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }))
      }
    })
    positions.current = {}
    let frame = 0
    if (reduced || hidden) paint(1)
    else {
      paint(0)
      let began: number | undefined
      const tick = (now: number) => {
        began ??= now
        const t = Math.min(1, (now - began) / 550)
        paint(1 - (1 - t) ** 3)
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    return () => { cancelAnimationFrame(frame); moves.current.forEach(animation => animation.cancel()) }
  }, [filter, hidden, reduced])

  return <main className="mana-page" data-paused={hidden || reduced}>
    <header className="mana-brand"><span className="mana-monogram">CC</span><span>COZY COMMANDER<small>Ein Blick in eure Spielchronik</small></span><span aria-hidden="true">✧</span></header>
    <section className="mana-parchment" aria-labelledby="mana-title">
      <div className="mana-eyebrow">DIE CHRONIK · STATISTIK-EXPERIMENT</div>
      <h1 id="mana-title">Die Farben des Manas</h1>
      <p className="mana-subtitle">Siegrate nach Farbidentität</p>
      <details className="mana-info"><summary>Wie werden die Farben gezählt?</summary><p>Mehrfarbige Decks zählen bei jeder enthaltenen Farbe mit. Die Prozente müssen zusammen nicht 100 % ergeben. Farblos zählt nur bei leerer Farbidentität. Spiele sind Deck-/Farbauftritte, keine eindeutigen Partien.</p></details>
      <fieldset className="mana-filters"><legend>Spieler pro Partie</legend><div>{(['all', '2', '3', '4', '5', '6'] as const).map(value => <label key={value}><input type="radio" name="mana-players" value={value} checked={filter === value} onChange={() => select(value)} /><span>{value === 'all' ? 'Alle' : value}</span></label>)}</div></fieldset>
      <div className="mana-list-label"><span>FARBIDENTITÄT</span><span>SIEGRATE</span></div>
      <ol className="mana-list" ref={list} aria-label="Manafarben nach Siegrate">{rows.map(row => <li key={row.color} data-color={row.color} className="mana-row" style={{ '--mana-color': appTheme.palette.mana[row.color] } as CSSProperties}>
        <span className="mana-seal" aria-hidden="true">{row.color}</span>
        <div className="mana-data"><div className="mana-row-heading"><h2>{manaNames[row.color]}</h2><span className="mana-counter" aria-hidden="true">{row.games ? manaPercent(row.winRatePercent!) : '—'}</span><span className="mana-sr">{row.games ? manaPercent(row.winRatePercent!) : 'Keine Daten vorhanden'}</span></div>
          <div className="mana-channel" aria-hidden="true"><div className="mana-volume"><div className="mana-liquid" />{[0, 1, 2].map(bubble => <i key={bubble} className="mana-bubble" style={{ left: `${17 + bubble * 31}%`, '--delay': `${-(bubble * 1.7 + row.color.charCodeAt(0) % 7)}s`, '--duration': `${3.9 + bubble * 1.3 + row.color.charCodeAt(0) % 3 * .4}s` } as CSSProperties} />)}</div></div>
          <p className="mana-counts">{row.games} Spiele <span aria-hidden="true">·</span> {row.wins} Siege{!row.games && <span className="mana-empty">Keine Daten vorhanden</span>}</p>
        </div>
      </li>)}</ol>
      <p role="status" className="mana-sr">{filter === 'all' ? 'Alle Spielerzahlen' : `${filter} Spieler`}: Statistik aktualisiert, nach Siegrate sortiert.</p>
      <footer className="mana-footnote">Sechs Farben. Unzählige Geschichten.<span>Lokale Beispieldaten · Keine Speicherung</span></footer>
    </section>
  </main>
}
