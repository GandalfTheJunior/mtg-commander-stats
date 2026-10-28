import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useMediaQuery } from '@mui/material'
import { ArtworkFrame } from './ArtworkFrame'
import { Firelight } from './Firelight'
import { frameFinish } from './frameFinish'
import { hallFixtures, type HallDeck } from './hallData'
import { HallArtwork, HonorOrnament, type Honor } from './HallArtwork'
import './hall.css'

const honors: [Honor, string][] = [['laurel', 'A — Lorbeer'], ['banner', 'B — Wappen/Banner'], ['crown', 'C — Krone/Runen']]
export function HallOfFame() {
  const [fixture, setFixture] = useState<keyof typeof hallFixtures>('full')
  const [light, setLight] = useState(true)
  const [visible, setVisible] = useState(false)
  const [choices, setChoices] = useState<Honor[]>(['laurel', 'banner', 'crown'])
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
        <div className={`hall-hanging ${winner ? '' : 'hall-aged'}`} style={{ '--hall-tilt': winner ? '0deg' : ['-3deg', '4deg', '-5deg'][slot] } as CSSProperties}>
          <ArtworkFrame colors={deck.colors}><HallArtwork deck={deck}/></ArtworkFrame>
          {winner && <HonorOrnament kind={choices[slot]}/>}
        </div>
        <div className="hall-plaque"><span>{label} · {winner ? 'Geehrt' : 'Verwittert & schief'}</span><h3>{deck.name}</h3><p>{deck.owner} · {frameFinish(deck.colors).identityLabel}</p><p>{deck.games} Spiele · {deck.wins} Siege · {Math.round(deck.wins / deck.games * 100)} % Siegquote</p></div>
        {winner && <label className="hall-selector">Schmuck für {deck.owner}<select value={choices[slot]} onChange={event => setChoices(old => old.map((value, index) => index === slot ? event.target.value as Honor : value))}>{honors.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
      </> : <div className="hall-vacancy"><div aria-hidden="true"/><p>{label} · Freier Platz</p><small>Kein Demo-Deck eingehängt</small></div>}
    </li>
  }
  return <main ref={room} className="hall" data-light={light} data-reduced={reduced} data-animated={light && !reduced && visible}>
    <Firelight enabled={light} animated={!reduced && visible} strong/>
    <header className="hall-header"><p className="hall-eyebrow">Zum wandernden Funken · Gildenstube</p><h1>Die Ruhmeshalle</h1><p>Manche Geschichten glänzen. Andere brauchen noch einen Abend.</p><div className="hall-controls"><label>Demowand<select value={fixture} onChange={event => setFixture(event.target.value as keyof typeof hallFixtures)}><option value="full">Sechs Geschichten</option><option value="sparse">Wenige qualifizierte Decks</option></select></label><button type="button" aria-pressed={light} onClick={() => setLight(value => !value)}>Kaminlicht {light ? 'aus' : 'ein'}</button></div><p role="status">{!light ? 'Kaminlicht aus · neutrales Raumlicht' : reduced ? 'Kaminlicht statisch · reduzierte Bewegung' : 'Kaminlicht ein · sanftes Flackern'}</p></header>
    <div className="hall-wall">{(['legends', 'unlucky'] as const).map(group => <section key={group} aria-labelledby={`hall-${group}`}><div className="hall-section-title"><span aria-hidden="true">✦</span><h2 id={`hall-${group}`}>{group === 'legends' ? 'Die drei Legenden' : 'Die drei Pechvögel'}</h2><p>{group === 'legends' ? 'Auf ihre Siege. Und auf die nächste Runde.' : 'Das Glück findet den Weg zurück.'}</p></div><ol className="hall-gallery">{hallFixtures[fixture][group].map((deck, slot) => portrait(deck, slot, group === 'legends'))}</ol></section>)}</div>
    <footer>Visuelle Studie · Alle Namen, Decks und Ergebnisse sind frei erfunden. Originale lokale SVG-Illustrationen, keine Wizards-/Scryfall-Kunst. Die dünn besetzte Wand ist ein festes Layoutbeispiel, keine Rang- oder Verteilungsregel. Schmuck und Schieflage sind unverbindliche Designproben.</footer>
  </main>
}
