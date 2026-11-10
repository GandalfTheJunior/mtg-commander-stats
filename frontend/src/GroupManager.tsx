import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError, createGroup, listGroups,
  type GroupSummary,
} from './api'
import { Link, useNavigate } from 'react-router'
import { Alert, Box, Button, Card, CardActionArea, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material'

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

// App keys this component by session lifetime. Retire reads and writes on unmount.
export default function GroupManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [groupName, setGroupName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const active = useRef(false)
  const pending = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const suffixes = groupSuffixes(groups)

  useEffect(() => {
    active.current = true
    request.current = new AbortController()
    return () => { active.current = false; request.current?.abort() }
  }, [])

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setGroups([])
      onUnauthorized()
    } else setNotice({ kind: 'error', message: messageFrom(error) })
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
      setGroups([])
      setStatus('error')
      handleError(error)
    })
    return () => { current = false; controller.abort() }
  }, [revision, handleError])

  function closeDialog() {
    if (pending.current) return
    setDialogOpen(false)
    // Reconcile uncertain creation before offering another attempt from the list.
    if (createError) {
      setGroups([])
      setStatus('loading')
      setRevision(value => value + 1)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    // Match backend DisplayText boundaries; further name rules remain server-owned.
    const characters = Array.from(groupName.normalize('NFC'))
    const boundary = (character: string) => /\p{White_Space}/u.test(character) ||
      (character.codePointAt(0)! >= 0x1c && character.codePointAt(0)! <= 0x1f)
    while (characters.length && boundary(characters[0])) characters.shift()
    while (characters.length && boundary(characters[characters.length - 1])) characters.pop()
    const name = characters.join('')
    if (!name) { setNameError(true); return }
    pending.current = true
    setBusy(true)
    setCreateError(null)
    try {
      const group = await createGroup(name, request.current!.signal)
      if (!active.current) return
      setDialogOpen(false)
      void navigate(`/playgroups/${encodeURIComponent(group.id)}`)
    } catch (error) {
      if (!active.current) return
      if (error instanceof ApiError && error.status === 401) {
        setDialogOpen(false)
        handleError(error)
      } else setCreateError(error instanceof ApiError && error.status === 400
        ? 'Der Name wurde nicht akzeptiert. Verwende höchstens 30 Zeichen, keine Emojis und keine mehrfachen Leerzeichen. Prüfe den Namen und versuche es erneut.'
        : 'Die Erstellung konnte nicht bestätigt werden. Prüfe nach dem Schließen des Dialogs zuerst die Playgroups, bevor du es erneut versuchst.')
    } finally {
      if (active.current) { pending.current = false; setBusy(false) }
    }
  }

  return (
    <Stack component="section" aria-labelledby="groups-heading"
      sx={{ gap: 3, minWidth: 0, bgcolor: 'background.default', color: 'text.primary', overflowWrap: 'anywhere' }}>
      <Typography component="h2" variant="h4" id="groups-heading" sx={{ fontWeight: 600 }}>Playgroups</Typography>
      <Stack direction="row" sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography component="h3" variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 600 }}>Meine Playgroups</Typography>
        <IconButton aria-label="Playgroup erstellen" color="secondary" onClick={() => {
          setGroupName(''); setNameError(false); setCreateError(null); setDialogOpen(true)
        }} sx={{ minWidth: 44, minHeight: 44, flexShrink: 0, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1,
          '&:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>
          <Box component="span" aria-hidden="true" sx={{ fontSize: 28, lineHeight: 1 }}>+</Box>
        </IconButton>
      </Stack>
      {status === 'loading' ? <Typography role="status">Playgroups werden geladen…</Typography> : status === 'error' ? (
        <Stack>
          <Typography>Playgroups konnten nicht geladen werden. Nutze „Playgroups aktualisieren“, um es erneut zu versuchen.</Typography>
          <Feedback notice={notice} />
          <Button onClick={() => { setNotice(null); setGroups([]); setStatus('loading'); setRevision(value => value + 1) }}>Playgroups aktualisieren</Button>
        </Stack>
      ) : groups.length === 0 ? <Typography>Du bist noch keiner Playgroup beigetreten. Erstelle eine eigene Playgroup oder öffne einen Einladungslink.</Typography> : (
        <Stack component="ul" aria-label="Deine Playgroups" sx={{ listStyle: 'none', p: 0, m: 0, gap: 2, minWidth: 0 }}>
          {groups.map((group) => (
            <Card component="li" key={group.id} sx={{ minWidth: 0 }}>
              <CardActionArea disableRipple sx={cardAction} onClick={() => { void navigate(`/playgroups/${encodeURIComponent(group.id)}`) }}
                aria-label={group.name} aria-description={`Übersicht, ${group.id}`}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography component="h4" variant="h6" sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
                    {group.name}{suffixes.has(group.id) && <> <Typography component="span" variant="body2"
                      sx={{ display: 'inline-block', maxWidth: '100%', color: 'text.secondary' }}>ID: {suffixes.get(group.id)}</Typography></>}
                  </Typography>
                  <Box component="span" aria-hidden="true" sx={{ flexShrink: 0, fontSize: 32, lineHeight: 1, color: 'text.secondary' }}>›</Box>
                </Box>
              </CardActionArea>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, pb: 2 }}>
                <Button component={Link} to={`/playgroups/${encodeURIComponent(group.id)}/games/new`} variant="outlined"
                  aria-label={`Spiel erfassen: ${group.name}, ${group.id}`}>Spiel erfassen</Button>
              </Box>
            </Card>
          ))}
        </Stack>
      )}
      <Dialog open={dialogOpen} onClose={closeDialog}
        aria-labelledby="create-group-heading" fullWidth maxWidth="xs"
        slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)' } }, transition: { onEntered: () => nameInput.current?.focus() } }}>
        <Box component="form" onSubmit={submit} aria-labelledby="create-group-heading" aria-busy={busy}>
          <DialogTitle id="create-group-heading" sx={{ p: { xs: 2, sm: 3 }, fontWeight: 600 }}>Playgroup erstellen</DialogTitle>
          <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
            <Typography component="label" htmlFor="playgroups-create-name" sx={{ display: 'block', mb: 2, fontWeight: 600 }}>Name der Playgroup</Typography>
            <TextField inputRef={nameInput} id="playgroups-create-name" placeholder="z. B. Friday Commander" name="name" required disabled={busy} fullWidth
              value={groupName} onChange={(event) => { setGroupName(event.target.value); setNameError(false) }}
              error={nameError} helperText={nameError ? 'Bitte gib einen Namen für die Playgroup ein.' : undefined} />
            {busy && <Typography role="status" sx={{ mt: 2 }}>Playgroup wird erstellt…</Typography>}
            {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
          </DialogContent>
          <DialogActions sx={{ p: { xs: 2, sm: 3 }, pt: 3, gap: 1,
            '& .MuiButton-root': { px: 1.5, whiteSpace: 'nowrap', flexShrink: 0 } }}>
            <Button disabled={busy} onClick={closeDialog}>Abbrechen</Button>
            <Button disabled={busy} type="submit" variant="contained">Erstellen</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  )
}
