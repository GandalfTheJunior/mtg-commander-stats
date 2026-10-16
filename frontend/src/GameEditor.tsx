import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, memberDecks, type DeckSelection, type Game, type GameInput, type GroupDetails } from './api'

type Assignment = { key: number; userId: string; deckId: string }
type Choices = { key: string; decks: Record<string, DeckSelection[]>; errors: Record<string, string> }

type Props = {
  group: GroupDetails
  game: Game | null
  busy: boolean
  onSubmit: (input: GameInput) => void
  onCancel: () => void
  onAccessError: (error: unknown) => void
}

export default function GameEditor({ group, game, busy, onSubmit, onCancel, onAccessError }: Props) {
  const [rows, setRows] = useState<Assignment[]>(() => game
    ? game.participants.map((p, key) => ({ key, userId: p.userId, deckId: p.deckId }))
    : [{ key: 0, userId: '', deckId: '' }, { key: 1, userId: '', deckId: '' }])
  const nextKey = useRef(rows.length)
  const heading = useRef<HTMLHeadingElement>(null)
  const callbacks = useRef({ onAccessError })
  useEffect(() => { callbacks.current = { onAccessError } })
  useEffect(() => { heading.current?.focus() }, [])
  const [result, setResult] = useState<'WIN' | 'DRAW'>(game?.result ?? 'WIN')
  const [winner, setWinner] = useState(game?.winnerUserId ?? '')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [choices, setChoices] = useState<Choices | null>(null)
  const selected = JSON.stringify([...new Set(rows.map((row) => row.userId).filter(Boolean))].sort())
  const choiceKey = `${selected}:${retry}`

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const users = JSON.parse(selected) as string[]
    const activeUsers = users.filter((id) => group.members.some((member) => member.userId === id))
    Promise.all(activeUsers.map(async (userId) => {
      try {
        return { userId, decks: await memberDecks(group.id, userId, controller.signal) }
      } catch (error) {
        if (active && error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          callbacks.current.onAccessError(error)
        }
        return { userId, error: error instanceof Error ? error.message : 'Could not load eligible decks.' }
      }
    })).then((loaded) => {
      if (!active) return
      const decks: Choices['decks'] = {}
      const errors: Choices['errors'] = {}
      loaded.forEach((entry) => {
        if ('decks' in entry && entry.decks) decks[entry.userId] = entry.decks
        else errors[entry.userId] = entry.error ?? 'Could not load eligible decks.'
      })
      setChoices({ key: choiceKey, decks, errors })
    })
    return () => { active = false; controller.abort() }
  }, [selected, choiceKey, group])

  function original(userId: string) {
    return game?.participants.find((participant) => participant.userId === userId)
  }
  function label(userId: string) {
    const member = group.members.find((member) => member.userId === userId) ?? original(userId)
    return `${member?.username ?? 'Player'} (${userId})`
  }
  function changeRows(next: Assignment[]) {
    setRows(next)
    setError('')
    if (!next.some((row) => row.userId === winner)) setWinner('')
  }
  function eligible(row: Assignment) {
    const previous = original(row.userId)
    const decks = choices?.key === choiceKey ? choices.decks[row.userId] ?? [] : []
    return previous ? [previous.deck, ...decks.filter((deck) => deck.id !== previous.deckId)] : decks
  }
  const loading = choices?.key !== choiceKey
  const noDecks = rows.some((row) => row.userId && !loading && eligible(row).length === 0)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || loading || noDecks) return
    const distinct = new Set(rows.map((row) => row.userId))
    if (rows.length < 2 || rows.length > 6 || distinct.size !== rows.length ||
      rows.some((row) => !row.userId || !row.deckId || !eligible(row).some((deck) => deck.id === row.deckId)) ||
      (result === 'WIN' && !rows.some((row) => row.userId === winner))) {
      setError('Choose 2–6 different players, one eligible deck each, and a participating winner for WIN.')
      return
    }
    onSubmit({ participants: rows.map(({ userId, deckId }) => ({ userId, deckId })), result,
      winnerUserId: result === 'DRAW' ? null : winner })
  }

  return <form className="game-editor" aria-label={game ? 'Edit game' : 'Record game'} onSubmit={submit} noValidate>
    <h4 tabIndex={-1} ref={heading}>{game ? 'Edit recorded game' : 'Record a Commander game'}</h4>
    <p>Select 2–6 players. You can record a game without participating.</p>
    {game && <p>Game {game.id}. Existing historical assignments can be kept, including former members and archived decks.</p>}
    <fieldset disabled={busy}>
      <legend>Players and decks</legend>
      {rows.map((row, index) => {
        const former = original(row.userId) && !group.members.some((member) => member.userId === row.userId)
        const previous = original(row.userId)
        const available = eligible(row)
        return <div className="game-player" key={row.key}>
          <label>Player {index + 1}
            <select required value={row.userId} onChange={(event) => {
              const userId = event.target.value
              changeRows(rows.map((candidate) => candidate.key === row.key
                ? { ...candidate, userId, deckId: original(userId)?.deckId ?? '' } : candidate))
            }}>
              <option value="">Choose a player</option>
              {group.members.map((member) => <option key={member.userId} value={member.userId}
                disabled={rows.some((candidate) => candidate.key !== row.key && candidate.userId === member.userId)}>
                {member.username} ({member.userId})
              </option>)}
              {game?.participants.filter((p) => !group.members.some((member) => member.userId === p.userId)).map((p) =>
                <option key={p.userId} value={p.userId}
                  disabled={rows.some((candidate) => candidate.key !== row.key && candidate.userId === p.userId)}>
                  {p.username} ({p.userId}) — recorded former member
                </option>)}
            </select>
          </label>
          <label>Deck for player {index + 1}
            <select required value={row.deckId} disabled={!row.userId || loading}
              onChange={(event) => changeRows(rows.map((candidate) => candidate.key === row.key
                ? { ...candidate, deckId: event.target.value } : candidate))}>
              <option value="">Choose a deck</option>
              {available.map((deck) => <option key={deck.id} value={deck.id}>
                {deck.name} — {deck.commander} — {deck.colorIdentity.join('') || 'Colorless'} ({deck.id})
                {previous?.deckId === deck.id ? ' — keep recorded assignment' : ''}
              </option>)}
            </select>
          </label>
          {former && <p>Former member: only the recorded deck assignment can be retained.</p>}
          {previous?.deck.archived && <p>The recorded deck is archived. Keeping this exact assignment is allowed.</p>}
          {row.userId && loading && !former && <p role="status">Loading eligible decks for {label(row.userId)}…</p>}
          {row.userId && !loading && choices?.errors[row.userId] && <p className="error" role="status">{choices.errors[row.userId]}</p>}
          {row.userId && !loading && available.length === 0 && !choices?.errors[row.userId] &&
            <p>No eligible decks for {label(row.userId)}. Ask them to create an unarchived deck or select another player.</p>}
          <button type="button" className="secondary" disabled={rows.length <= 2}
            onClick={() => changeRows(rows.filter((candidate) => candidate.key !== row.key))}>Remove player {index + 1}</button>
        </div>
      })}
      <button type="button" disabled={rows.length >= 6} onClick={() => {
        changeRows([...rows, { key: nextKey.current++, userId: '', deckId: '' }])
      }}>Add player</button>
      <button type="button" className="secondary" onClick={() => setRetry((value) => value + 1)}>Reload eligible decks</button>
    </fieldset>
    <fieldset disabled={busy}>
      <legend>Result</legend>
      <label>Game result<select value={result} onChange={(event) => {
        setResult(event.target.value as 'WIN' | 'DRAW'); setWinner(''); setError('')
      }}><option value="WIN">WIN</option><option value="DRAW">DRAW</option></select></label>
      {result === 'WIN' && <label>Winning player<select required value={winner} onChange={(event) => setWinner(event.target.value)}>
        <option value="">Choose a winner</option>
        {rows.filter((row) => row.userId).map((row) => <option key={row.key} value={row.userId}>{label(row.userId)}</option>)}
      </select></label>}
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions">
      <button type="submit" disabled={busy || loading || noDecks}>{busy ? 'Saving game…' : game ? 'Save game' : 'Record game'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel game</button>
    </div>
  </form>
}
