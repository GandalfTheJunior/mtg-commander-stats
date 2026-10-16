import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError, deleteGame, getGroup, listGames, saveGame,
  type Game, type GameInput, type GroupDetails,
} from './api'
import GameEditor from './GameEditor'
import GroupStatistics from './GroupStatistics'

type Props = {
  group: GroupDetails
  actorId: string
  checkingAccessOnMount?: boolean
  onUnauthorized: () => void
  onAccessLost: () => void
  onCheckingAccess: (checking: boolean) => void
  onGroupConfirmed: (group: GroupDetails) => void
  onChanged?: () => void
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The game request failed.'
}

// The parent keys this area by selected group and deck revision; App keys the
// entire group manager by confirmed session. Abort and generation checks retire
// responses (including 401s) before they can affect a different lifetime.
export default function GameManager({ group, actorId, checkingAccessOnMount = false, ...handlers }: Props) {
  const id = group.id
  const callbacks = useRef(handlers)
  useEffect(() => { callbacks.current = handlers })
  const alive = useRef(false)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  // A keyed replacement inherits the parent's pending check and must confirm
  // access itself; the retired instance can no longer settle that check.
  const [revision, setRevision] = useState(checkingAccessOnMount ? 1 : 0)
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'checking' | 'error'; games?: Game[]; error?: string }>({ status: 'loading' })
  const [notice, setNotice] = useState('')
  const noticeElement = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (notice && state.status === 'ready') noticeElement.current?.focus()
  }, [notice, state.status])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current?.abort() }
  }, [])

  const recover = useCallback(async (error: unknown) => {
    if (!alive.current) return
    const version = ++generation.current
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ status: 'checking' })
    setNotice('')
    callbacks.current.onCheckingAccess(true)
    if (error instanceof ApiError && error.status === 401) {
      callbacks.current.onUnauthorized()
      return
    }
    try {
      const confirmed = await getGroup(id, controller.signal)
      if (!alive.current || version !== generation.current) return
      callbacks.current.onGroupConfirmed(confirmed)
      callbacks.current.onCheckingAccess(false)
      setState({ status: 'error', error: `${message(error)} Group access is confirmed. Refresh games to review server state before trying again.` })
    } catch (accessError) {
      if (!alive.current || version !== generation.current) return
      if (accessError instanceof ApiError && accessError.status === 401) callbacks.current.onUnauthorized()
      else if (accessError instanceof ApiError && [403, 404].includes(accessError.status)) callbacks.current.onAccessLost()
      else setState({ status: 'error', error: 'Group access could not be verified. Refresh games or members to try again.' })
    }
  }, [id])

  useEffect(() => {
    const version = ++generation.current
    const controller = new AbortController()
    request.current = controller
    async function load() {
      try {
        if (revision > 0) {
          const confirmed = await getGroup(id, controller.signal)
          if (!alive.current || version !== generation.current) return
          callbacks.current.onGroupConfirmed(confirmed)
          callbacks.current.onCheckingAccess(false)
        }
        const games = await listGames(id, controller.signal)
        if (alive.current && version === generation.current) setState({ status: 'ready', games })
      } catch (error) {
        if (!alive.current || version !== generation.current) return
        await recover(error)
      }
    }
    void load()
    return () => { controller.abort() }
  }, [id, revision, recover])

  function refresh() {
    request.current?.abort()
    generation.current++
    setState({ status: 'loading' })
    callbacks.current.onCheckingAccess(true)
    setRevision((value) => value + 1)
  }

  return <section className="games" aria-labelledby={`games-${id}`}>
    <h3 id={`games-${id}`}>Commander games</h3>
    <button type="button" className="secondary" disabled={state.status === 'loading' || state.status === 'checking'}
      onClick={() => { setNotice(''); refresh() }}>Refresh games</button>
    {state.status === 'loading' && <p role="status">Loading game history…</p>}
    {state.status === 'checking' && <p role="status">Checking group access…</p>}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {notice && <p ref={noticeElement} tabIndex={-1} className="success" role="status">{notice}</p>}
    {state.status === 'ready' && <>
      <GameContent group={group} actorId={actorId} games={state.games!}
        onError={recover} onStart={() => setNotice('')} onSaved={(text) => {
          setNotice(text)
          callbacks.current.onChanged?.()
          refresh()
        }} />
      <GroupStatistics groupId={id} onAccessError={recover} />
    </>}
  </section>
}

type ContentProps = {
  group: GroupDetails
  actorId: string
  games: Game[]
  onError: (error: unknown) => void
  onStart: () => void
  onSaved: (message: string) => void
}

function GameContent({ group, actorId, games, onError, onStart, onSaved }: ContentProps) {
  const [editor, setEditor] = useState<Game | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Game | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const alive = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const confirmation = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    alive.current = true
    controller.current = new AbortController()
    return () => { alive.current = false; controller.current?.abort() }
  }, [])
  useEffect(() => { if (deleting) confirmation.current?.focus() }, [deleting])

  useEffect(() => {
    if (!editor && !deleting && restoreFocus.current) {
      trigger.current?.focus()
      restoreFocus.current = false
    }
  }, [editor, deleting])

  function cancel() {
    restoreFocus.current = true
    setEditor(null); setDeleting(null)
  }

  async function write(input?: GameInput) {
    if (pending.current || busy) return
    pending.current = true
    setBusy(true)
    try {
      if (deleting) await deleteGame(group.id, deleting.id, controller.current!.signal)
      else if (input && editor) await saveGame(group.id, input, editor === 'new' ? undefined : editor.id, controller.current!.signal)
      else return
      if (!alive.current) return
      onSaved(deleting ? 'Game deleted.' : editor === 'new' ? 'Game recorded.' : 'Game updated.')
    } catch (error) {
      if (alive.current) onError(error)
    } finally {
      if (alive.current) { pending.current = false; setBusy(false) }
    }
  }

  const publicNames = new Map([...group.members, ...games.flatMap((game) => game.participants)]
    .map((person) => [person.userId, person.username]))
  const username = (userId: string) => publicNames.get(userId) ?? 'User'

  return <>
    {!editor && !deleting && <button type="button" onClick={(event) => {
      trigger.current = event.currentTarget; onStart(); setEditor('new')
    }}>Record a game</button>}
    {editor && <GameEditor group={group} game={editor === 'new' ? null : editor} busy={busy}
      onSubmit={write} onCancel={cancel} onAccessError={onError} />}
    {deleting && <div className="confirmation" ref={confirmation} tabIndex={-1} role="group" aria-label="Confirm game deletion">
      <p>Delete game {deleting.id}, recorded {new Date(deleting.recordedAt).toLocaleString()}?
        This permanently removes the game. Decks remain used.</p>
      <button type="button" className="danger" disabled={busy} onClick={() => write()}>{busy ? 'Deleting game…' : 'Confirm game deletion'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={cancel}>Cancel game deletion</button>
    </div>}
    <h4>Game history</h4>
    {games.length === 0 ? <p>No recorded games yet.</p> : <ol className="game-history" aria-label="Game history">
      {games.map((game) => <li key={game.id}>
        <article aria-label={`Game ${game.id}`}>
          <h4>{game.result === 'DRAW' ? 'DRAW' : `WIN — ${game.participants.find((participant) => participant.userId === game.winnerUserId)!.username}`}</h4>
          <p>Recorded <time dateTime={game.recordedAt}>{new Date(game.recordedAt).toLocaleString()}</time></p>
          <p>Creator: {username(game.creatorId)} <span className="member-id">({game.creatorId})</span></p>
          <p className="member-id">Game ID: {game.id}</p>
          <ul>{game.participants.map((participant) => <li key={participant.userId}>
            <strong>{participant.username}</strong> <span className="member-id">({participant.userId})</span>
            {participant.userId === game.winnerUserId && ' — Winner'}
            <p>{participant.deck.name} — {participant.deck.commander} — {participant.deck.colorIdentity.join('') || 'Colorless'}
              {participant.deck.archived && ' — Archived deck'}<br />
              <span className="member-id">Deck ID: {participant.deckId}</span></p>
          </li>)}</ul>
          {(group.role === 'OWNER' || game.creatorId === actorId) && <div className="actions">
            <button type="button" disabled={busy || editor !== null || deleting !== null} onClick={(event) => {
              trigger.current = event.currentTarget; onStart(); setEditor(game)
            }}>Edit game</button>
            <button type="button" className="danger" disabled={busy || editor !== null || deleting !== null} onClick={(event) => {
              trigger.current = event.currentTarget; onStart(); setDeleting(game)
            }}>Delete game</button>
          </div>}
        </article>
      </li>)}
    </ol>}
  </>
}
