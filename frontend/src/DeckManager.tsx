import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
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

function ColorIdentityFields({ selected = [] }: { selected?: MagicColor[] }) {
  return (
    <fieldset>
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
        <input defaultValue={deck?.commander} name="commander" required />
      </label>
      <ColorIdentityFields selected={deck?.colorIdentity} />
    </>
  )
}

export default function DeckManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const handleError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError && error.status === 401) {
      onUnauthorized()
      return
    }
    setNotice({ kind: 'error', message: messageFrom(error, fallback) })
  }, [onUnauthorized])

  useEffect(() => {
    let active = true
    listDecks()
      .then((loadedDecks) => {
        if (active) setDecks(loadedDecks)
      })
      .catch((error: unknown) => {
        if (active) handleError(error, 'Could not load your decks.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [handleError])

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setNotice(null)
    try {
      const created = await createDeck(deckInput(form))
      setDecks((current) => [...current, created])
      setNotice({ kind: 'success', message: `${created.name} created.` })
      form.reset()
    } catch (error) {
      handleError(error, 'Could not create the deck.')
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const updated = await updateDeck(id, deckInput(event.currentTarget))
      setDecks((current) => current.map((deck) => (deck.id === id ? updated : deck)))
      setEditingId(null)
      setNotice({ kind: 'success', message: `${updated.name} updated.` })
    } catch (error) {
      handleError(error, 'Could not update the deck.')
    } finally {
      setBusy(false)
    }
  }

  async function removeDeck(deck: Deck) {
    setBusy(true)
    setNotice(null)
    try {
      await deleteDeck(deck.id)
      setDecks((current) => current.filter((candidate) => candidate.id !== deck.id))
      setNotice({ kind: 'success', message: `${deck.name} deleted.` })
    } catch (error) {
      handleError(error, 'Could not delete the deck.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="decks">
      <h2>My decks</h2>
      {loading ? (
        <p>Loading your decks…</p>
      ) : decks.length === 0 ? (
        <p>You have no decks yet.</p>
      ) : (
        <ul className="deck-list">
          {decks.map((deck) => (
            <li key={deck.id}>
              {editingId === deck.id ? (
                <form onSubmit={(event) => submitEdit(event, deck.id)}>
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
                  <p>Commander: {deck.commander}</p>
                  <p>Color identity: {deck.colorIdentity.join('') || 'Colorless'}</p>
                  <div className="actions">
                    <button disabled={busy} onClick={() => setEditingId(deck.id)} type="button">
                      Edit
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => removeDeck(deck)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Add a deck</h3>
      <form onSubmit={submitCreate}>
        <DeckFields />
        <button disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Create deck'}
        </button>
      </form>
      {notice && (
        <p className={notice.kind} role="status">
          {notice.message}
        </p>
      )}
    </section>
  )
}
