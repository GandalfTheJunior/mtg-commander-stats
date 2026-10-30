import { useEffect, useState } from 'react'
import { Button, FormControlLabel, Switch, ToggleButton, ToggleButtonGroup, useMediaQuery } from '@mui/material'
import { LoungeWindow } from './LoungeWindow'
import { Firelight } from './Firelight'
import { StoneWall } from './StoneWall'
import { initialOrder } from './ordering'
import { SortableTable } from './SortableTable'

export function Lounge() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [hidden, setHidden] = useState(document.hidden)
  const [fire, setFire] = useState(true)
  const [flies, setFlies] = useState(true)
  const [intensity, setIntensity] = useState('quiet')
  const [order, setOrder] = useState(initialOrder)
  const [selected, setSelected] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const change = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  const reset = () => { setOrder(initialOrder); setSelected(false); setRound(0); setFire(true); setFlies(true); setIntensity('quiet') }
  return <div className="lounge" data-intensity={intensity} data-reduced={reduced} data-hidden={hidden} data-fire={fire}>
    <StoneWall />
    <Firelight enabled={fire} animated={!reduced} strong={intensity === 'strong'} />
    <main className="lounge-main">
      <header className="lounge-header"><a href="/dev/lounge.html" className="lounge-wordmark">CC <span>COZY COMMANDER</span></a><span className="prototype">MOTION PLAYGROUND · NUR DEMO</span></header>
      <div className="lounge-intro"><span className="overline">Ein Tisch. Vier Geschichten.</span><h1>Bleib noch eine Runde.</h1><p>Ein ruhiger Ort für große Züge und kleine Experimente.</p></div>
      <div className="lounge-grid">
        <section className="table-section" aria-labelledby="table-title"><div className="section-heading"><h2 id="table-title">Euer Tisch</h2><span>04 / 04 Plätze</span></div>
          <SortableTable order={order} onChange={next => { setOrder(next); setSelected(false) }} reduced={reduced} />
          <div className="demo-actions"><Button variant="contained" color="secondary" aria-pressed={selected} onClick={() => setSelected(s => !s)}>{selected ? '✓ Auswahl bestätigt' : 'Auswahl bestätigen'}</Button><Button variant="outlined" color="secondary" disabled={!selected} onClick={() => setRound(r => r + 1)}>Spiel starten</Button></div>
          <p className="demo-feedback" role="status">{round ? `Demo-Runde ${round} gestartet. Es wird kein Spiel gespeichert.` : selected ? 'Reihenfolge bestätigt. Bereit für eine Demo-Runde.' : 'Macht es euch gemütlich. Welche Reihenfolge fühlt sich gut an?'}</p>
        </section>
        <aside className="room-aside">
          <LoungeWindow flies={flies && !reduced} />
          <section className="ambience-controls" aria-labelledby="ambience-title"><span className="overline">Die Stimmung im Raum</span><h2 id="ambience-title">Ein wenig Atmosphäre</h2><div className="switches"><FormControlLabel control={<Switch color="secondary" checked={fire} onChange={(_, checked) => setFire(checked)} />} label="Kaminlicht"/><FormControlLabel control={<Switch color="secondary" checked={flies} onChange={(_, checked) => setFlies(checked)} />} label="Glühwürmchen"/></div>
            <ToggleButtonGroup size="small" color="secondary" exclusive value={intensity} onChange={(_, value: string | null) => { if (value) setIntensity(value) }} aria-label="Intensität"><ToggleButton value="quiet">Dezent</ToggleButton><ToggleButton value="strong">Deutlich</ToggleButton></ToggleButtonGroup>
            <p className="quiet">{reduced ? 'Reduzierte Bewegung aktiv: statisches Licht, keine Glühwürmchen.' : 'Sanftes Licht, freie Gedanken. Alles bleibt lokal.'}</p><Button color="secondary" variant="text" onClick={reset}>↺ Demo zurücksetzen</Button>
          </section>
        </aside>
      </div>
      <footer>Ein Designexperiment · Fiktive Spieler · Keine Speicherung<br/><span>Zieh eine Karte. Probier das Licht. Nimm dir Zeit.</span></footer>
    </main>
  </div>
}
