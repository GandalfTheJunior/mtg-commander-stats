import { useState, type CSSProperties } from 'react'
import { ArtworkFrame } from './ArtworkFrame'
import { frameFinish } from './frameFinish'
import { HallArtwork, HonorOrnament, type Honor } from './HallArtwork'
import type { HallDeck } from './hallData'
import type { HallArtResult } from './hallCommanders'

export function HallFramedArtwork({ deck, result, online, honor, tilt }: { deck: HallDeck; result?: HallArtResult; online: boolean; honor?: Honor; tilt: string }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const art = result && 'commander' in result ? result : undefined
  const showing = art && loaded && !failed
  return <>
    <div className={`hall-hanging ${honor ? '' : 'hall-aged'}`} style={{ '--hall-tilt': tilt } as CSSProperties}>
      <ArtworkFrame colors={showing ? art.commander.colorIdentity : deck.colors}>
        {!showing && <HallArtwork deck={deck}/>}
        {art && !failed && <img className="hall-online-image" src={art.src} alt={`Commander-Illustration: ${art.commander.name}`} hidden={!loaded} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); setLoaded(false) }} />}
      </ArtworkFrame>
      {honor && <HonorOrnament kind={honor}/>}
    </div>
    {online && <div className="hall-art-credit">{showing ? <>
      <p><strong>{art.commander.name}</strong></p><p>Illustration: {art.artwork.artist || 'Künstlerangabe nicht verfügbar'}</p>
      <p>Commander-Mana: {frameFinish(art.commander.colorIdentity).identityLabel}</p>
      <a href={art.source} target="_blank" rel="noopener noreferrer">Original auf Scryfall (neuer Tab)</a>
    </> : <p>{!result || (art && !failed) ? 'Commander-Illustration wird geladen · lokale Vorschau' : 'Commander-Illustration nicht verfügbar · lokale Vorschau'}</p>}</div>}
  </>
}
