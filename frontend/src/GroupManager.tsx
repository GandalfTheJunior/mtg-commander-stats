import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError, createGroup, getGroup, getJoinCode, joinGroup, leaveGroup, listGroups,
  type CurrentUser, type GroupDetails, type GroupSummary,
} from './api'
import GameManager from './GameManager'

type Notice = { kind: 'success' | 'error'; message: string } | null

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'The group request failed. Please try again.'
}

function Feedback({ notice }: { notice: Notice }) {
  return notice && <p className={notice.kind} role="status">{notice.message}</p>
}

// This component is keyed by the confirmed session lifetime in App. Each selected group
// is also a separate lifetime, so old requests cannot restore protected content.
export default function GroupManager({ onUnauthorized, currentUser, deckRevision = 0, onGamesChanged }: {
  onUnauthorized: () => void
  currentUser?: CurrentUser
  deckRevision?: number
  onGamesChanged?: () => void
}) {
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const active = useRef(false)
  const pending = useRef(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setGroups([])
      setSelected(null)
      onUnauthorized()
    } else {
      setNotice({ kind: 'error', message: messageFrom(error) })
    }
  }, [onUnauthorized])

  useEffect(() => {
    let current = true
    listGroups().then((loaded) => {
      if (!current) return
      setGroups(loaded)
      setStatus('loaded')
    }).catch((error: unknown) => {
      if (!current) return
      setStatus('error')
      handleError(error)
    })
    return () => { current = false }
  }, [revision, handleError])

  function refreshGroups() {
    setGroups([])
    setSelected(null)
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
        ? await createGroup(String(data.get('name')))
        : await joinGroup(String(data.get('code')))
      if (!active.current) return
      setGroups((previous) => [...previous.filter((item) => item.id !== group.id), group])
      // Reopening after a join always obtains fresh active members and role.
      setSelected(null)
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
              <button type="button" disabled={busy} aria-pressed={selected === group.id} onClick={() => setSelected(group.id)}>
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
      {selected && (
        <GroupView key={selected} id={selected} busy={busy} setBusy={setBusy}
          currentUser={currentUser} deckRevision={deckRevision} onGamesChanged={onGamesChanged}
          onUnauthorized={onUnauthorized}
          onClose={() => setSelected(null)}
          onAccessLost={() => {
            setNotice({ kind: 'error', message: 'Group access is unavailable. Your groups have been refreshed.' })
            refreshGroups()
          }}
          onLeft={() => {
            setGroups((previous) => previous.filter((group) => group.id !== selected))
            setSelected(null)
            setNotice({ kind: 'success', message: 'You left the group. Your historical games and statistics remain associated with you.' })
          }} />
      )}
    </section>
  )
}

type GroupViewProps = {
  currentUser?: CurrentUser
  deckRevision: number
  onGamesChanged?: () => void
  id: string
  busy: boolean
  setBusy: (busy: boolean) => void
  onUnauthorized: () => void
  onAccessLost: () => void
  onLeft: () => void
  onClose: () => void
}

function GroupView({ id, busy, setBusy, onUnauthorized, onAccessLost, onLeft, onClose, currentUser, deckRevision, onGamesChanged }: GroupViewProps) {
  const [checkingGames, setCheckingGames] = useState(false)
  const [details, setDetails] = useState<GroupDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [code, setCode] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<'leave' | 'regenerate' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const active = useRef(false)
  const pending = useRef(false)
  // Use current callbacks without making a parent's render restart a request.
  const callbacks = useRef({ onUnauthorized, onAccessLost })
  useEffect(() => { callbacks.current = { onUnauthorized, onAccessLost } })

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      setDetails(null)
      setCode(null)
      if (error.status === 401) callbacks.current.onUnauthorized()
      else callbacks.current.onAccessLost()
    } else {
      setNotice({ kind: 'error', message: messageFrom(error) })
    }
  }, [])

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    let current = true
    getGroup(id).then((group) => {
      if (current) setDetails(group)
    }).catch((error: unknown) => {
      if (current) handleError(error)
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [id, revision, handleError])

  function refresh() {
    setCheckingGames(false)
    setDetails(null)
    setCode(null)
    setConfirmation(null)
    setNotice(null)
    setLoading(true)
    setRevision((value) => value + 1)
  }

  async function handleActionError(error: unknown) {
    if (!active.current) return
    if (!(error instanceof ApiError) || error.status !== 403) {
      handleError(error)
      return
    }

    // Unsafe requests (including CSRF preparation) may be denied while the
    // membership is still active. Hide protected data until a safe GET verifies
    // access; only its 403/404 establishes that group access was lost.
    setDetails(null)
    setCode(null)
    setNotice({ kind: 'error', message: 'The action was denied (authorization or CSRF). Checking group access…' })
    try {
      const group = await getGroup(id)
      if (!active.current) return
      setDetails(group)
      if (group.role === 'OWNER') setCode(code)
      setNotice({ kind: 'error', message: 'The action was denied (authorization or CSRF). Please try again.' })
    } catch (accessError) {
      if (active.current) handleError(accessError)
    }
  }

  async function act(operation: 'retrieve' | 'regenerate' | 'leave' | 'copy') {
    if (busy || pending.current || !details) return
    pending.current = true
    setBusy(true)
    setNotice(null)
    setConfirmation(null)
    try {
      if (operation === 'leave') {
        await leaveGroup(id)
        if (active.current) onLeft()
      } else if (operation === 'copy') {
        try {
          await navigator.clipboard.writeText(code!)
          if (active.current) setNotice({ kind: 'success', message: 'Invitation code copied.' })
        } catch {
          if (active.current) setNotice({ kind: 'error', message: 'Could not copy the code. Select and copy the visible code manually.' })
        }
      } else {
        const returned = await getJoinCode(id, operation === 'regenerate')
        if (active.current) {
          setCode(returned)
          if (operation === 'regenerate') setNotice({ kind: 'success', message: 'Invitation code regenerated. The old code no longer works.' })
        }
      }
    } catch (error) {
      await handleActionError(error)
    } finally {
      // The parent may have removed this view after a successful leave/denial.
      if (active.current) pending.current = false
      setBusy(false)
    }
  }

  return (
    <section className="group-details" aria-label="Group details">
      <div className="actions">
        <button type="button" disabled={busy || loading} onClick={refresh}>Refresh members</button>
        <button type="button" disabled={busy} className="secondary" onClick={onClose}>Close details</button>
      </div>
      {loading && <p role="status">Loading group details…</p>}
      {details && <>
        {!checkingGames && <>
        <h3>{details.name}</h3>
        <p>Your role: {details.role}</p>
        <h4>Active members</h4>
        <ul>
          {details.members.map((member) => <li key={member.userId}>
            <strong>{member.username}</strong> — {member.role}<br />
            <span className="member-id">User ID: {member.userId}</span>
          </li>)}
        </ul>
        {details.role === 'OWNER' ? <>
          <p>As OWNER you cannot leave this group.</p>
          <div className="actions">
            <button type="button" disabled={busy || confirmation !== null} onClick={() => act('retrieve')}>Show invitation code</button>
            <button type="button" disabled={busy || confirmation !== null} onClick={() => setConfirmation('regenerate')}>Regenerate code</button>
          </div>
          {code && <>
            <label>Current invitation code<input readOnly value={code} /></label>
            <button type="button" disabled={busy || confirmation !== null} onClick={() => act('copy')}>Copy code</button>
          </>}
        </> : <button type="button" className="danger" disabled={busy || confirmation !== null} onClick={() => setConfirmation('leave')}>Leave group</button>}
        {confirmation && <div role="group" aria-label={confirmation === 'leave' ? 'Confirm departure' : 'Confirm code regeneration'} className="confirmation">
          <p>{confirmation === 'leave'
            ? 'Leaving loses active access. Your historical games and statistics remain associated with you. Rejoining requires a current valid invitation code.'
            : 'Regenerating the invitation code will stop the old code from working immediately.'}</p>
          <div className="actions">
            <button type="button" className="danger" disabled={busy} onClick={() => act(confirmation)}>
              {confirmation === 'leave' ? 'Confirm leave' : 'Confirm regeneration'}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
          </div>
        </div>}
        </>}
        {currentUser && <GameManager key={`${id}-${deckRevision}`} group={details} actorId={currentUser.id}
          checkingAccessOnMount={checkingGames}
          onUnauthorized={onUnauthorized} onAccessLost={onAccessLost} onCheckingAccess={setCheckingGames}
          onGroupConfirmed={(group) => { setDetails(group); if (group.role !== 'OWNER') setCode(null) }}
          onChanged={onGamesChanged} />}
      </>}
      <Feedback notice={notice} />
    </section>
  )
}
