import { useEffect, useRef, useState } from 'react'
import { ApiError, listArtworks, scryfallUnavailable, type Artwork, type CommanderChoice } from '../api'
import { CommanderSearch } from '../CommanderSearch'
import { CommanderArtwork } from '../CommanderArtwork'
import { safeArtworkUrl } from '../artworkUrl'
import { ArtworkFrame } from './ArtworkFrame'
import { frameFinish } from './frameFinish'
import './commanderArt.css'

export function CommanderArt() {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<CommanderChoice | null>(null)
  const [unauthorized, setUnauthorized] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  return <main className="commander-art">
    <header><p className="overline">Cozy Commander · Atelier</p><h1>Commander-Rahmen</h1>
      <p>Ein Platz für deinen Commander. Originale Illustrationen, gefasst in Metall und Mana.</p>
    </header>
    <div className="art-workspace">
      <section className="art-controls" aria-label="Commander und Illustration wählen">
        <h2>Die Inspiration</h2>
        <p>Suche nach dem englischen Namen, mit mindestens zwei Zeichen.</p>
        <CommanderSearch key={searchAttempt} query={query} selection={selection} inputRef={input} label="Commander suchen" required={false}
          disabled={unauthorized} locked={false} onUnauthorized={() => setUnauthorized(true)}
          onInput={value => { setQuery(value); setSelection(null) }}
          onSelect={choice => { setQuery(choice.name); setSelection(choice) }} />
        {unauthorized && <SignInNotice onRetry={() => { setUnauthorized(false); setSearchAttempt(value => value + 1) }} />}
        <p className="art-note">Live-Suche mit deiner Anmeldung aus der Hauptanwendung. Die Auswahl bleibt nur bis zum Verlassen dieses Experiments erhalten.</p>
      </section>
      {selection ? <ArtworkDiscovery key={JSON.stringify(selection.selectionRef)} commander={selection} />
        : <section className="art-waiting" aria-label="Rahmen-Vorschau"><span aria-hidden="true">◇</span><h2>Welcher Commander zieht ein?</h2><p>Wähle einen Suchtreffer und entdecke seine Illustrationen im manafarbenen Rahmen.</p></section>}
    </div>
    <footer>Illustrationen © Wizards of the Coast · Scryfall</footer>
  </main>
}

function SignInNotice({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="art-feedback"><p>Bitte melde dich zuerst über die Hauptanwendung an. Kehre danach hierher zurück und versuche es erneut.</p>
    <a href="/" target="_blank" rel="noopener noreferrer">Hauptanwendung öffnen (neuer Tab)</a>
    <button onClick={onRetry}>Nach Anmeldung erneut versuchen</button></div>
}

function ArtworkDiscovery({ commander }: { commander: CommanderChoice }) {
  const [attempt, setAttempt] = useState(0)
  return <section className="art-discovery" aria-label={`Illustrationen für ${commander.name}`}>
    <h2>{commander.name}</h2>
    <ArtworkRequest key={attempt} commander={commander} onRetry={() => setAttempt(value => value + 1)} />
  </section>
}

function ArtworkRequest({ commander, onRetry }: { commander: CommanderChoice; onRetry: () => void }) {
  const [result, setResult] = useState<{ options: Artwork[] } | { error: 'auth' | 'unavailable' } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    listArtworks(commander.selectionRef, controller.signal).then(options => {
      if (!controller.signal.aborted) setResult({ options: options.filter(art => safeArtworkUrl(art.artCropUrl)) })
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({ error: cause instanceof ApiError && cause.status === 401 ? 'auth' : 'unavailable' })
    })
    return () => controller.abort()
  }, [commander.selectionRef])
  if (!result) return <p role="status">Illustrationen werden geladen…</p>
  if ('error' in result) return result.error === 'auth' ? <SignInNotice onRetry={onRetry} />
    : <div role="alert" className="art-feedback"><p>{scryfallUnavailable}</p><button onClick={onRetry}>Illustrationen erneut laden</button></div>
  if (!result.options.length) return <div role="status" className="art-feedback"><p>Keine nutzbare Illustration für diesen Commander verfügbar.</p><button onClick={onRetry}>Illustrationen erneut laden</button></div>
  return <ArtworkChoices commander={commander} options={result.options} />
}

function ArtworkChoices({ commander, options }: { commander: CommanderChoice; options: Artwork[] }) {
  const [selected, setSelected] = useState(0)
  const artwork = options[selected]
  const source = safeArtworkUrl(artwork.scryfallUri, true)
  const finish = frameFinish(commander.colorIdentity)
  return <>
    <fieldset className="art-choices"><legend>Illustration wählen · {options.length} verfügbar</legend>
      <div className="art-options">{options.map((option, index) => <label key={`${option.scryfallCardId}-${option.artworkFaceIndex}`}>
        <input type="radio" name="commander-illustration" checked={selected === index} onChange={() => setSelected(index)} />
        <span className="art-option-preview" aria-hidden="true"><CommanderArtwork commander={{ name: commander.name, artCropUrl: option.artCropUrl }} /></span>
        <span>Illustration {index + 1}<small>{option.artist || 'Künstlerangabe nicht verfügbar'}</small></span>
      </label>)}</div>
    </fieldset>
    <figure className="art-portrait">
      <ArtworkFrame colors={commander.colorIdentity}><FramedImage key={JSON.stringify([artwork.scryfallCardId, artwork.artworkFaceIndex, artwork.artCropUrl])} name={commander.name} src={safeArtworkUrl(artwork.artCropUrl)!} /></ArtworkFrame>
      <figcaption><p className="art-identity">Mana-Identität: {finish.identityLabel}</p><h3>{commander.name}</h3><p className="art-finish">Rahmen: {finish.label}</p><p>{artwork.artist ? `Illustration: ${artwork.artist}` : 'Künstlerangabe nicht verfügbar'}</p>
        {source && <a href={source} target="_blank" rel="noopener noreferrer">Original auf Scryfall (neuer Tab)</a>}
      </figcaption>
    </figure>
  </>
}

function FramedImage({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  return failed ? <div role="status" className="art-image-fallback"><p>Bild nicht verfügbar. Es konnte nicht geladen werden oder wurde blockiert.</p>
    <button onClick={() => { setAttempt(value => value + 1); setFailed(false) }}>Bild erneut laden</button></div>
    : <img key={attempt} src={src} alt={`Illustration für ${name}`} decoding="async" onError={() => setFailed(true)} />
}
