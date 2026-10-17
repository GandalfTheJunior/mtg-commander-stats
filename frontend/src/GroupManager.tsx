import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError, createGroup, joinGroup, listGroups,
  type GroupSummary,
} from './api'
import { useNavigate } from 'react-router'

type Notice = { kind: 'success' | 'error'; message: string } | null

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'The group request failed. Please try again.'
}

function Feedback({ notice }: { notice: Notice }) {
  return notice && <p className={notice.kind} role="status">{notice.message}</p>
}

// The list is keyed by the confirmed session lifetime in App. Group routes own
// their separate authorization and private-state lifetimes.
export default function GroupManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const request = useRef<AbortController | null>(null)
  const active = useRef(false)
  const pending = useRef(false)

  useEffect(() => {
    active.current = true
    request.current = new AbortController()
    return () => { active.current = false; request.current?.abort() }
  }, [])

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setGroups([])
      onUnauthorized()
    } else {
      setNotice({ kind: 'error', message: messageFrom(error) })
    }
  }, [onUnauthorized])

  useEffect(() => {
    let current = true
    const controller = new AbortController()
    listGroups(controller.signal).then((loaded) => {
      if (!current) return
      setGroups(loaded)
      setStatus('loaded')
    }).catch((error: unknown) => {
      if (!current) return
      setStatus('error')
      handleError(error)
    })
    return () => { current = false; controller.abort() }
  }, [revision, handleError])

  function refreshGroups() {
    setGroups([])
    setStatus('loading')
    setRevision((value) => value + 1)
  }

  async function submit(event: FormEvent<HTMLFormElement>, operation: 'create' | 'join') {
    event.preventDefault()
    if (busy || pending.current || status !== 'loaded') return
    const form = event.currentTarget
    const data = new FormData(form)
    pending.current = true
    setBusy(true)
    setNotice(null)
    try {
      const group = operation === 'create'
        ? await createGroup(String(data.get('name')), request.current!.signal)
        : await joinGroup(String(data.get('code')), request.current!.signal)
      if (!active.current) return
      setGroups((previous) => [...previous.filter((item) => item.id !== group.id), group])
      setNotice({ kind: 'success', message: operation === 'create' ? `${group.name} created.` : `${group.name} joined.` })
      form.reset()
    } catch (error) {
      if (active.current) handleError(error)
    } finally {
      if (active.current) {
        pending.current = false
        setBusy(false)
      }
    }
  }

  return (
    <section className="groups" aria-labelledby="groups-heading">
      <h2 id="groups-heading">My groups</h2>
      {status === 'loading' ? <p role="status">Loading your groups…</p> : status === 'error' ? (
        <p>Your group list is unavailable. Try refreshing your groups.</p>
      ) : groups.length === 0 ? <p>You have no groups yet.</p> : (
        <ul className="group-list" aria-label="Your groups">
          {groups.map((group) => (
            <li key={group.id}>
              <button type="button" disabled={busy} onClick={() => { void navigate(`/playgroups/${encodeURIComponent(group.id)}`) }}>
                {group.name} ({group.role})
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="secondary" disabled={busy || status === 'loading'} onClick={() => { setNotice(null); refreshGroups() }}>
        Refresh groups
      </button>
      {status === 'loaded' && (
        <div className="forms">
          <form onSubmit={(event) => submit(event, 'create')}>
            <h3>Create a group</h3>
            <label>Group name<input name="name" required disabled={busy} /></label>
            <button disabled={busy} type="submit">Create group</button>
          </form>
          <form onSubmit={(event) => submit(event, 'join')}>
            <h3>Join or rejoin a group</h3>
            <label>Invitation code<input name="code" required disabled={busy} autoComplete="off" spellCheck={false} /></label>
            <button disabled={busy} type="submit">Join group</button>
          </form>
        </div>
      )}
      {busy && <p role="status">Working on your group…</p>}
      <Feedback notice={notice} />
    </section>
  )
}
