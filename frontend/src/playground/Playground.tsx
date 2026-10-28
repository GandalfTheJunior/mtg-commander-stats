import { useState } from 'react'
import { Lounge } from './Lounge'
import { ManaStatistics } from './ManaStatistics'
import { CommanderArt } from './CommanderArt'

export function Playground() {
  const [view, setView] = useState('lounge')
  return <><nav className="playground-nav" aria-label="Playground-Experimente"><button aria-pressed={view === 'lounge'} onClick={() => setView('lounge')}>Die Lounge</button><button aria-pressed={view === 'mana'} onClick={() => setView('mana')}>Die Farben des Manas</button><button aria-pressed={view === 'art'} onClick={() => setView('art')}>Commander-Rahmen</button></nav>{view === 'lounge' ? <Lounge /> : view === 'mana' ? <ManaStatistics /> : <CommanderArt />}</>
}
