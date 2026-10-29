import { useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '@mui/material'
import { Firelight } from './Firelight'
import { frameFinish } from './frameFinish'
import { hallFixtures, type HallDeck } from './hallData'
import type { Honor } from './HallArtwork'
import { HallFramedArtwork } from './HallFramedArtwork'
import { drawHallCommanders, loadHallCommanders, type HallArtResult } from './hallCommanders'
import './hall.css'

const honors: [Honor, string][] = [['laurel', 'A — Lorbeer'], ['banner', 'B — Wappen/Banner'], ['crown', 'C — Krone/Runen']]
export function HallOfFame() {
  const [fixture, setFixture] = useState<keyof typeof hallFixtures>('full')
  const [light, setLight] = useState(true)
  const [visible, setVisible] = useState(false)
  const [choices, setChoices] = useState<Honor[]>(['laurel', 'banner', 'crown'])
  const [request, setRequest] = useState<{ online: boolean; names: string[] }>({ online: false, names: [] })
  const [batch, setBatch] = useState<{ request: typeof request; entries: (HallArtResult | undefined)[] } | null>(null)
  const entries = batch?.request === request ? batch.entries : []
  useEffect(() => {
    if (!request.online) return
    const controller = new AbortController()
    const results: (HallArtResult | undefined)[] = []
    void loadHallCommanders(request.names, controller.signal, (index, result) => {
      if (controller.signal.aborted) return
      results[index] = result
      setBatch({ request, entries: [...results] })
    })
    return () => controller.abort()
  }, [request])
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const room = useRef<HTMLElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)))
    observer.observe(room.current!)
    return () => observer.disconnect()
  }, [])
  function portrait(deck: HallDeck | null, slot: number, winner: boolean) {
    const label = `${winner ? 'Legende' : 'Pechvogel'} ${slot + 1}`
    return <li key={label} className="hall-slot">
      <div className="hall-hook" aria-hidden="true"/>
      {deck ? <>
        <HallFramedArtwork key={`${request.online}-${request.names.join('|')}-${entries[winner ? slot : slot + 3] ? 'resolved' : 'pending'}`} deck={deck} online={request.online} result={entries[winner ? slot : slot + 3]} honor={winner ? choices[slot] : undefined} tilt={winner ? '0deg' : ['-3deg', '4deg', '-5deg'][slot]}/>
        <div className="hall-plaque"><span>{label} · {winner ? 'Geehrt' : 'Verwittert & schief'}</span><h3>{deck.name}</h3><p>{request.online ? `Fiktives Demo-Deck · ${deck.owner}` : `${deck.owner} · ${frameFinish(deck.colors).identityLabel}`}</p><p>{deck.games} Spiele · {deck.wins} Siege · {Math.round(deck.wins / deck.games * 100)} % Siegquote</p></div>
        {winner && <label className="hall-selector">Schmuck für {deck.owner}<select value={choices[slot]} onChange={event => setChoices(old => old.map((value, index) => index === slot ? event.target.value as Honor : value))}>{honors.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
      </> : <div className="hall-vacancy"><div aria-hidden="true"/><p>{label} · Freier Platz</p><small>Kein Demo-Deck eingehängt</small></div>}
    </li>
  }
  return <main ref={room} className="hall" data-light={light} data-reduced={reduced} data-animated={light && !reduced && visible}>
    <Firelight enabled={light} animated={!reduced && visible} strong/>
    <header className="hall-header"><p className="hall-eyebrow">Zum wandernden Funken · Gildenstube</p><h1>Die Ruhmeshalle</h1><p>Manche Geschichten glänzen. Andere brauchen noch einen Abend.</p><div className="hall-controls"><label>Demowand<select value={fixture} onChange={event => setFixture(event.target.value as keyof typeof hallFixtures)}><option value="full">Sechs Geschichten</option><option value="sparse">Wenige qualifizierte Decks</option></select></label><label className="hall-mode"><input type="checkbox" checked={request.online} onChange={event => setRequest(old => ({ online: event.target.checked, names: old.names.length ? old.names : drawHallCommanders() }))}/>Echte Commander-Artworks</label>{request.online && <button type="button" onClick={() => setRequest(old => ({ online: true, names: drawHallCommanders(old.names) }))}>Neu mischen</button>}<button type="button" aria-pressed={light} onClick={() => setLight(value => !value)}>Kaminlicht {light ? 'aus' : 'ein'}</button></div><p role="status">{!light ? 'Kaminlicht aus · neutrales Raumlicht' : reduced ? 'Kaminlicht statisch · reduzierte Bewegung' : 'Kaminlicht ein · sanftes Flackern'}</p></header>
    {request.online && <div className="hall-online-notice"><p>Die zufälligen Commander sind reine Artwork-Proben. Spieler, Decknamen und Ergebnisse bleiben fiktive Demo-Daten; sie gehören nicht zu den angezeigten Karten. Rahmenfarben folgen nur dem geladenen Artwork-Commander.</p><p role="status">{entries.some(entry => entry && 'error' in entry && entry.error === 'auth') ? 'Für echte Artworks über die Hauptanwendung anmelden. Die lokale Vorschau bleibt verfügbar.' : `${entries.filter(Boolean).length} / 6 Artwork-Slots geprüft · bei Ladefehlern bleibt die lokale Vorschau.`}</p><a href="/" target="_blank" rel="noopener noreferrer">Hauptanwendung öffnen (neuer Tab)</a></div>}
    <div className="hall-wall">{(['legends', 'unlucky'] as const).map(group => <section key={group} aria-labelledby={`hall-${group}`}><div className="hall-section-title"><span aria-hidden="true">✦</span><h2 id={`hall-${group}`}>{group === 'legends' ? 'Die drei Legenden' : 'Die drei Pechvögel'}</h2><p>{group === 'legends' ? 'Auf ihre Siege. Und auf die nächste Runde.' : 'Das Glück findet den Weg zurück.'}</p></div><ol className="hall-gallery">{hallFixtures[fixture][group].map((deck, slot) => portrait(deck, slot, group === 'legends'))}</ol></section>)}</div>
    <footer>Visuelle Studie · Alle Spielernamen, Demo-Decks und Ergebnisse sind frei erfunden. {request.online ? 'Online-Illustrationen © Wizards of the Coast · Quellen: Scryfall. Inoffizieller Fan-Content, nicht von Wizards unterstützt. Lokale SVGs dienen als Fallback.' : 'Originale lokale SVG-Illustrationen, keine Wizards-/Scryfall-Kunst.'} Die dünn besetzte Wand ist ein festes Layoutbeispiel, keine Rang- oder Verteilungsregel. Schmuck und Schieflage sind unverbindliche Designproben.</footer>
  </main>
}
