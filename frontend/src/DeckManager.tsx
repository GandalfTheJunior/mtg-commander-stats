import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  archiveDeck,
  createDeck,
  deleteDeck,
  listDecks,
  magicColors,
  updateDeck,
  type Deck,
  type DeckInput,
  type MagicColor,
} from './api'

type Notice = { kind: 'success' | 'error'; message: string } | null
type LoadStatus = 'loading' | 'loaded' | 'error'

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function deckInput(form: HTMLFormElement): DeckInput {
  const data = new FormData(form)
  return {
    name: String(data.get('name')),
    commander: String(data.get('commander')),
    colorIdentity: data.getAll('colorIdentity').map(String) as MagicColor[],
  }
}

function ColorIdentityFields({ selected = [], disabled = false }: { selected?: MagicColor[]; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend>Color identity</legend>
      <p>Select none for a colorless deck.</p>
      <div className="colors">
        {magicColors.map((color) => (
          <label key={color}>
            <input
              defaultChecked={selected.includes(color)}
              name="colorIdentity"
              type="checkbox"
              value={color}
            />
            {color}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function DeckFields({ deck }: { deck?: Deck }) {
  return (
    <>
      <label>
        Deck name
        <input defaultValue={deck?.name} name="name" required />
      </label>
      <label>
        Commander
        <input defaultValue={deck?.commander} name="commander" required readOnly={deck?.everUsed} />
      </label>
      <ColorIdentityFields selected={deck?.colorIdentity} disabled={deck?.everUsed} />
      {deck?.everUsed && <p>Used in a recorded game: commander and colors are permanently locked. You can still rename this deck.</p>}
    </>
  )
}

export default function DeckManager({ onUnauthorized, onChanged }: { onUnauthorized: () => void; onChanged?: () => void }) {
  const active = useRef(false)
  const request = useRef<AbortController | null>(null)
  const deleting = useRef(false)
  const deleteTrigger = useRef<HTMLButtonElement | null>(null)
  const deletionConfirmation = useRef<HTMLDivElement | null>(null)
  const noticeElement = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    active.current = true
    request.current = new AbortController()
    return () => { active.current = false; request.current?.abort() }
  }, [])

  const [revision, setRevision] = useState(0)
  const [decks, setDecks] = useState<Deck[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  useLayoutEffect(() => {
    if (deletingId !== null) {
      // The named group stays focusable while its action buttons are disabled.
      deletionConfirmation.current?.focus()
    } else if (deleteTrigger.current) {
      // Restore focus in the commit that enables the trigger or mounts feedback.
      // Keep the request until that target exists; async state updates can commit separately.
      const target = deleteTrigger.current.isConnected ? deleteTrigger.current : noticeElement.current
      if (!target?.isConnected || (target instanceof HTMLButtonElement && target.disabled)) return
      target.focus()
      deleteTrigger.current = null
    }
  }, [deletingId, busy, notice])

  const handleError = useCallback((error: unknown, fallback: string) => {
    if (!active.current) return
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized()
      return
    }
    setNotice({ kind: 'error', message: messageFrom(error, fallback) })
  }, [onUnauthorized])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    listDecks(controller.signal)
      .then((loadedDecks) => {
        if (active) {
          setDecks(loadedDecks)
          setLoadStatus('loaded')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadStatus('error')
          handleError(error, 'Could not load your decks.')
        }
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [handleError, revision])

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loadStatus !== 'loaded' || busy || deleting.current) return
    deleting.current = true
    const form = event.currentTarget
    setBusy(true)
    setNotice(null)
    try {
      const created = await createDeck(deckInput(form), request.current!.signal)
      if (!active.current) return
      setDecks((current) => [...current, created])
      setNotice({ kind: 'success', message: `${created.name} created.` })
      form.reset()
      onChanged?.()
    } catch (error) {
      handleError(error, 'Could not create the deck.')
    } finally {
      deleting.current = false
      if (active.current) setBusy(false)
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    if (loadStatus !== 'loaded' || busy || deleting.current) return
    deleting.current = true
    setBusy(true)
    setNotice(null)
    try {
      const deck = decks.find((candidate) => candidate.id === id)!
      const input = deckInput(event.currentTarget)
      const updated = await updateDeck(id, deck.everUsed
        ? { ...input, commander: deck.commander, colorIdentity: deck.colorIdentity } : input, request.current!.signal)
      if (!active.current) return
      setDecks((current) => current.map((deck) => (deck.id === id ? updated : deck)))
      setEditingId(null)
      setNotice({ kind: 'success', message: `${updated.name} updated.` })
      onChanged?.()
    } catch (error) {
      handleError(error, 'Could not update the deck.')
    } finally {
      deleting.current = false
      if (active.current) setBusy(false)
    }
  }

  async function removeDeck(deck: Deck) {
    if (loadStatus !== 'loaded' || deleting.current) return
    deleting.current = true
    setBusy(true)
    setNotice(null)
    try {
      let archived: Deck | null = null
      if (deck.everUsed) archived = await archiveDeck(deck.id, request.current!.signal)
      else await deleteDeck(deck.id, request.current!.signal)
      if (!active.current) return
      setDecks((current) => archived ? current.map((candidate) => candidate.id === deck.id ? archived : candidate)
        : current.filter((candidate) => candidate.id !== deck.id))
      setDeletingId(null)
      onChanged?.()
      setNotice({ kind: 'success', message: `${deck.name} ${deck.everUsed ? 'archived' : 'deleted'}.` })
    } catch (error) {
      handleError(error, 'Could not delete the deck. Try again or cancel.')
    } finally {
      deleting.current = false
      if (active.current) setBusy(false)
    }
  }

  return (
    <section className="decks">
      <h2>My decks</h2>
      <button type="button" className="secondary" disabled={busy || loadStatus === 'loading'} onClick={() => {
        setDecks([]); setEditingId(null); setDeletingId(null); setNotice(null); setLoadStatus('loading')
        setRevision((value) => value + 1)
      }}>Refresh decks</button>
      {loadStatus === 'loading' ? (
        <p>Loading your decks…</p>
      ) : loadStatus === 'error' ? (
        <p>Your deck list is unavailable. Reload the page to try again.</p>
      ) : decks.length === 0 ? (
        <p>You have no decks yet.</p>
      ) : (
        <ul className="deck-list">
          {decks.map((deck) => (
            <li key={deck.id}>
              {editingId === deck.id ? (
                <form aria-label={`Edit ${deck.name}`} onSubmit={(event) => submitEdit(event, deck.id)}>
                  <DeckFields deck={deck} />
                  <div className="actions">
                    <button disabled={busy} type="submit">Save deck</button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <h3>{deck.name}</h3>
                  <p>{deck.archived ? 'Archived — unavailable for new games' : deck.everUsed ? 'Used — commander and colors locked' : 'Unused'}</p>
                  <p>Commander: {deck.commander}</p>
                  <p>Color identity: {deck.colorIdentity.join('') || 'Colorless'}</p>
                  <div className="actions">
                    <button disabled={busy || deletingId !== null} onClick={() => setEditingId(deck.id)} type="button">
                      Edit
                    </button>
                    {!(deck.everUsed && deck.archived) && <button
                      className="danger"
                      disabled={busy || deletingId !== null}
                      onClick={(event) => {
                        deleteTrigger.current = event.currentTarget
                        setNotice(null)
                        setDeletingId(deck.id)
                      }}
                      type="button"
                    >
                      {deck.everUsed ? 'Archive' : 'Delete'}
                    </button>}
                  </div>
                  {deletingId === deck.id && (
                    <div ref={deletionConfirmation} role="group" aria-label={`${deck.everUsed ? 'Archive' : 'Delete'} ${deck.name}?`} tabIndex={-1}>
                      <p>{deck.everUsed ? `Archive ${deck.name}? It will remain in history and cannot be selected for new games. Archival cannot be undone.` : `Permanently delete ${deck.name}? This cannot be undone.`}</p>
                      <button className="danger" disabled={busy} type="button" onClick={() => removeDeck(deck)}>
                        {busy ? (deck.everUsed ? 'Archiving…' : 'Deleting…') : deck.everUsed ? 'Confirm archival' : 'Confirm deletion'}
                      </button>
                      <button disabled={busy} type="button" onClick={() => { setDeletingId(null); setNotice(null) }}>
                        {deck.everUsed ? 'Cancel archival' : 'Cancel deletion'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {loadStatus === 'loaded' && (
        <>
          <h3>Add a deck</h3>
          <form aria-label="Add a deck" onSubmit={submitCreate}>
            <DeckFields />
            <button disabled={busy || deletingId !== null} type="submit">
              {busy ? 'Saving…' : 'Create deck'}
            </button>
          </form>
        </>
      )}
      {notice && (
        <p ref={noticeElement} className={notice.kind} role="status" tabIndex={-1}>
          {notice.message}
        </p>
      )}
    </section>
  )
}
