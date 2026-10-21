import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError, createGroup, joinGroup, listGroups,
  type GroupSummary,
} from './api'
import { useNavigate } from 'react-router'
import { Alert, Box, Button, Card, CardActionArea, Stack, TextField, Typography } from '@mui/material'

type Notice = { kind: 'success' | 'error'; message: string } | null

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Die Gruppenanfrage ist fehlgeschlagen. Bitte erneut versuchen.'
}

function Feedback({ notice }: { notice: Notice }) {
  return notice && <Alert severity={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}
    sx={{ minWidth: 0, '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}>{notice.message}</Alert>
}

// All identical display names use the same shortest distinguishing UUID prefix.
// Full IDs remain the keys and navigation targets; list order is never changed.
function groupSuffixes(groups: GroupSummary[]) {
  const names = new Map<string, GroupSummary[]>()
  for (const group of groups) names.set(group.name, [...(names.get(group.name) ?? []), group])
  const suffixes = new Map<string, string>()
  for (const peers of names.values()) {
    if (peers.length < 2) continue
    const ids = peers.map(group => group.id.replaceAll('-', ''))
    let length = 8
    while (length < 32 && new Set(ids.map(id => id.slice(0, length))).size < peers.length) length++
    peers.forEach((group, index) => suffixes.set(group.id, ids[index].slice(0, length)))
  }
  return suffixes
}

const cardAction = {
  display: 'block', textAlign: 'left', p: 2, minHeight: 72, color: 'text.primary',
  overflowWrap: 'anywhere',
  '&:hover': { bgcolor: 'interaction.hover' },
  '&:active': { bgcolor: 'interaction.pressed' },
  '&.Mui-focusVisible, &:focus-visible': {
    outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -4,
  },
  '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'text.disabled', opacity: 1 },
} as const

// The list is keyed by the confirmed session lifetime in App. Group routes own
// their separate authorization and private-state lifetimes.
export default function GroupManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [operation, setOperation] = useState<'create' | 'join' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [groupName, setGroupName] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const request = useRef<AbortController | null>(null)
  const active = useRef(false)
  const pending = useRef(false)
  const listPending = useRef(true)
  const busy = operation !== null
  const suffixes = groupSuffixes(groups)

  useEffect(() => {
    active.current = true
    request.current = new AbortController()
    return () => { active.current = false; request.current?.abort() }
  }, [])

  const handleError = useCallback((error: unknown, mutation?: 'create' | 'join') => {
    if (error instanceof ApiError && error.status === 401) {
      setGroups([])
      onUnauthorized()
    } else {
      // A join error may contain a server-reflected secret. Keep its copy local.
      const message = mutation === 'join'
        ? error instanceof ApiError && error.status === 400
          ? 'Beitritt nicht bestätigt. Prüfe, ob der Einladungscode aktuell und gültig ist.'
          : error instanceof ApiError && error.status === 403
            ? 'Beitritt abgelehnt (Berechtigung oder CSRF).'
            : 'Der Beitritt wurde nicht bestätigt; der Ausgang kann ungewiss sein.'
        : messageFrom(error)
      setNotice({ kind: 'error', message: mutation
        ? `${message} Prüfe die Playgroups über „Playgroups aktualisieren“, bevor du die Aktion erneut ausführst.`
        : message })
    }
  }, [onUnauthorized])

  useEffect(() => {
    let current = true
    const controller = new AbortController()
    listGroups(controller.signal).then((loaded) => {
      if (!current) return
      listPending.current = false
      setGroups(loaded)
      setStatus('loaded')
    }).catch((error: unknown) => {
      if (!current) return
      listPending.current = false
      setStatus('error')
      handleError(error)
    })
    return () => { current = false; controller.abort() }
  }, [revision, handleError])

  function refreshGroups() {
    if (pending.current || listPending.current) return
    listPending.current = true
    setNotice(null)
    setGroups([])
    setStatus('loading')
    setRevision((value) => value + 1)
  }

  async function submit(event: FormEvent<HTMLFormElement>, operation: 'create' | 'join') {
    event.preventDefault()
    if (busy || pending.current || listPending.current || status !== 'loaded') return
    const form = event.currentTarget
    const data = new FormData(form)
    pending.current = true
    setOperation(operation)
    setNotice(null)
    try {
      const group = operation === 'create'
        ? await createGroup(String(data.get('name')), request.current!.signal)
        : await joinGroup(String(data.get('code')), request.current!.signal)
      if (!active.current) return
      setGroups((previous) => [...previous.filter((item) => item.id !== group.id), group])
      setNotice({ kind: 'success', message: operation === 'create' ? `${group.name} wurde erstellt.` : `${group.name}: Beitritt bestätigt.` })
      if (operation === 'create') setGroupName('')
      else setInvitationCode('')
    } catch (error) {
      if (active.current) handleError(error, operation)
    } finally {
      if (active.current) {
        pending.current = false
        setOperation(null)
      }
    }
  }

  return (
    <Stack component="section" aria-labelledby="groups-heading"
      sx={{ gap: 3, minWidth: 0, bgcolor: 'background.default', color: 'text.primary', overflowWrap: 'anywhere' }}>
      <Stack direction="row" useFlexGap sx={{ gap: 2, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography component="h2" variant="h4" id="groups-heading">Playgroups</Typography>
        <Button type="button" color="secondary" disabled={busy || status === 'loading'} onClick={refreshGroups}
          sx={{ width: { xs: '100%', sm: 'auto' } }}>Playgroups aktualisieren</Button>
      </Stack>
      {status === 'loading' ? <Typography role="status">Playgroups werden geladen…</Typography> : status === 'error' ? (
        <Typography>Playgroups konnten nicht geladen werden. Nutze „Playgroups aktualisieren“, um es erneut zu versuchen.</Typography>
      ) : groups.length === 0 ? <Typography>Noch keine Playgroups. Erstelle eine Gruppe oder tritt mit einem aktuellen Einladungscode bei.</Typography> : (
        <Stack component="ul" aria-label="Deine Playgroups" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 }}>
          {groups.map((group) => (
            <Card component="li" key={group.id} sx={{ minWidth: 0 }}>
              <CardActionArea disableRipple sx={cardAction} disabled={busy}
                aria-labelledby={`playgroup-name-${group.id}`} aria-describedby={`playgroup-role-${group.id}`}
                onClick={() => { void navigate(`/playgroups/${encodeURIComponent(group.id)}`) }}>
                <Typography component="h3" variant="h6" id={`playgroup-name-${group.id}`}>
                  {group.name}{suffixes.has(group.id) && <> · <Typography component="span" variant="body2"
                    sx={{ color: busy ? 'text.disabled' : 'text.secondary' }}>ID: {suffixes.get(group.id)}</Typography></>}
                </Typography>
                <Typography id={`playgroup-role-${group.id}`} sx={{ color: busy ? 'text.disabled' : 'text.secondary' }}>
                  {group.role === 'OWNER' ? 'Gruppenersteller' : 'Mitglied'}
                </Typography>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      {busy && <Typography role="status">{operation === 'create' ? 'Gruppe wird erstellt…' : 'Beitritt wird bestätigt…'}</Typography>}
      <Feedback notice={notice} />
      {status === 'loaded' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
          <Card component="section" aria-labelledby="create-group-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
            <Typography component="h3" variant="h5" id="create-group-heading">Gruppe erstellen</Typography>
            <Stack component="form" aria-labelledby="create-group-heading" onSubmit={(event) => submit(event, 'create')}
              sx={{ mt: 3, gap: 3, minWidth: 0 }}>
              <TextField id="playgroups-create-name" label="Gruppenname" name="name" required disabled={busy} fullWidth
                value={groupName} onChange={(event) => setGroupName(event.target.value)}
                helperText="Wähle einen Namen für deine Gruppe." slotProps={{ inputLabel: { required: false } }} />
              <Button disabled={busy} type="submit" variant="contained" fullWidth>Gruppe erstellen</Button>
            </Stack>
          </Card>
          <Card component="section" aria-labelledby="join-group-heading" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
            <Typography component="h3" variant="h5" id="join-group-heading">Gruppe beitreten</Typography>
            <Stack component="form" aria-labelledby="join-group-heading" onSubmit={(event) => submit(event, 'join')}
              sx={{ mt: 3, gap: 3, minWidth: 0 }}>
              <TextField id="playgroups-join-code" label="Einladungscode" name="code" required disabled={busy} fullWidth
                value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)}
                autoComplete="off" helperText="Verwende einen aktuellen Einladungscode, auch für einen erneuten Beitritt."
                slotProps={{ inputLabel: { required: false }, htmlInput: { spellCheck: false } }} />
              <Button disabled={busy} type="submit" variant="contained" fullWidth>Gruppe beitreten</Button>
            </Stack>
          </Card>
        </Box>
      )}
    </Stack>
  )
}
