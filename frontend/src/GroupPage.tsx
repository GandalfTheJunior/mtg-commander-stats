import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material'
import { ApiError, getGroup, leaveGroup, type CurrentUser, type GroupDetails, type GroupMember } from './api'
import GameManager from './GameManager'
import GroupOverview from './GroupOverview'
import type { Notice } from './App'
import { groupUnavailable, groupUrl, type GroupTab } from './groupNavigation'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tabs: { value: GroupTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'games', label: 'Games' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'members', label: 'Members' },
]

function memberSuffix(member: GroupMember, members: GroupMember[]) {
  const peers = members.filter(other => other.username === member.username && other.userId !== member.userId)
  if (!peers.length) return null
  let length = 4
  while (length < member.userId.length && peers.some(other => other.userId.slice(-length) === member.userId.slice(-length))) length++
  return member.userId.slice(-length)
}

export default function GroupPage({ tab, currentUser, onUnauthorized, onNotice }: {
  tab: GroupTab
  currentUser: CurrentUser
  onUnauthorized: () => void
  onNotice: (notice: Notice) => void
}) {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const [details, setDetails] = useState<GroupDetails | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const generation = useRef(0)
  const alive = useRef(false)
  const callbacks = useRef({ onUnauthorized, onNotice, navigate })
  useEffect(() => { callbacks.current = { onUnauthorized, onNotice, navigate } })
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current?.abort() }
  }, [])
  useEffect(() => { if (status === 'ready') heading.current?.focus() }, [status])

  const accessLost = useCallback(() => {
    setDetails(null)
    callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
    void callbacks.current.navigate('/playgroups', { replace: true, state: null })
  }, [])
  const handleError = useCallback((error: unknown) => {
    setDetails(null)
    if (error instanceof ApiError && error.status === 401) callbacks.current.onUnauthorized()
    else if (error instanceof ApiError && [403, 404].includes(error.status)) accessLost()
    else setStatus('error')
  }, [accessLost])
  useEffect(() => {
    if (!validId.test(groupId)) {
      void Promise.resolve().then(accessLost)
      return
    }
    const version = ++generation.current
    const controller = new AbortController()
    request.current = controller
    getGroup(groupId, controller.signal).then(group => {
      if (!alive.current || version !== generation.current || controller.signal.aborted) return
      setDetails(group)
      setStatus('ready')
    }).catch(error => {
      if (alive.current && version === generation.current && !controller.signal.aborted) handleError(error)
    })
    return () => { controller.abort() }
  }, [groupId, revision, accessLost, handleError])

  function recheck() {
    generation.current++
    request.current?.abort()
    setDetails(null)
    setStatus('loading')
    setRevision(value => value + 1)
  }
  async function depart() {
    if (busy || !confirmLeave || details?.role !== 'MEMBER') return
    setBusy(true)
    setConfirmLeave(false)
    setDetails(null)
    const controller = request.current!
    try {
      await leaveGroup(groupId, controller.signal)
      if (!alive.current || controller.signal.aborted) return
      callbacks.current.onNotice({ kind: 'success', message: 'Du hast die Gruppe verlassen. Historische Spiele und Statistiken bleiben erhalten.' })
      void navigate('/playgroups', { replace: true, state: null })
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return
      if (error instanceof ApiError && error.status === 401) { handleError(error); return }
      callbacks.current.onNotice({ kind: 'error', message: 'Der Austritt wurde nicht bestätigt. Prüfe den aktuellen Gruppenzugriff vor einem erneuten Versuch.' })
      try {
        const fresh = await getGroup(groupId, controller.signal)
        if (!alive.current || controller.signal.aborted) return
        setDetails(fresh)
        setStatus('ready')
      } catch (checkError) {
        if (alive.current && !controller.signal.aborted) handleError(checkError)
      }
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return <Stack component="section" aria-label="Group details" sx={{ gap: 2, minWidth: 0 }}>
    <Button component={Link} to="/playgroups" color="secondary" sx={{ alignSelf: 'flex-start' }}>Zurück zu Playgroups</Button>
    {status === 'loading' && <Typography role="status">Gruppenberechtigung wird geprüft…</Typography>}
    {status === 'error' && <>
      <Alert severity="error">Die Gruppenberechtigung konnte nicht geprüft werden.</Alert>
      <Button onClick={recheck}>Gruppe erneut laden</Button>
    </>}
    {details && <>
      {!checkingAccess && <>
      <Typography component="h2" variant="h4" ref={heading} tabIndex={-1} sx={{ overflowWrap: 'anywhere' }}>{details.name}</Typography>
      <Tabs value={tab} variant="fullWidth" textColor="secondary" indicatorColor="secondary" aria-label="Playgroup-Bereiche"
        onChange={(_event, value: GroupTab) => { void navigate(groupUrl(groupId, value)) }}
        sx={{ '& .MuiTab-root': { minHeight: 48, minWidth: 0, px: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' }, '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } } }}>
        {tabs.map(({ value, label }) => <Tab key={value} value={value} label={label} id={`group-tab-${value}`} aria-controls={`group-panel-${value}`} />)}
      </Tabs>
      {tab === 'overview' && <Box role="tabpanel" id="group-panel-overview" aria-labelledby="group-tab-overview">
        <GroupOverview groupId={groupId} onAccessError={handleError} />
      </Box>}
      {tab === 'members' && <Box role="tabpanel" id="group-panel-members" aria-labelledby="group-tab-members">
        <Button color="secondary" onClick={recheck} disabled={busy}>Mitglieder aktualisieren</Button>
        <Stack component="ul" aria-label="Aktive Mitglieder" sx={{ listStyle: 'none', p: 0, m: 0, mt: 2, gap: 1 }}>
          {details.members.map(member => {
            const suffix = memberSuffix(member, details.members)
            return <Card component="li" key={member.userId} sx={{ p: 2, overflowWrap: 'anywhere' }}>
              <Typography sx={{ fontWeight: 600 }}>{member.username}{member.userId === currentUser.id && ' · Du'}</Typography>
              <Typography sx={{ color: 'text.secondary' }}>{member.role === 'OWNER' ? 'Gruppenersteller' : member.role === 'ADMIN' ? 'Admin' : 'Mitglied'}</Typography>
              {suffix && <Typography variant="body2">Kennung: …{suffix}</Typography>}
            </Card>
          })}
        </Stack>
      </Box>}
      </>}
      {(tab === 'games' || tab === 'statistics') && <GameManager group={details} tab={tab}
        onUnauthorized={() => { setDetails(null); onUnauthorized() }} onAccessLost={accessLost}
        onCheckingAccess={setCheckingAccess} onGroupConfirmed={group => { setDetails(group); setCheckingAccess(false) }} />}
      {!checkingAccess && details.role === 'MEMBER' && <Button color="secondary" onClick={() => setConfirmLeave(true)}>Gruppe verlassen</Button>}
    </>}
    <Dialog open={confirmLeave && details?.role === 'MEMBER'} onClose={() => setConfirmLeave(false)} aria-labelledby="leave-title">
      <DialogTitle id="leave-title">Gruppe verlassen?</DialogTitle>
      <DialogContent><DialogContentText>Du verlierst sofort den aktiven Zugriff auf diese Gruppe. Historische Spiele und Statistiken bleiben erhalten.</DialogContentText></DialogContent>
      <DialogActions><Button onClick={() => setConfirmLeave(false)}>Abbrechen</Button><Button color="error" disabled={busy} onClick={() => { void depart() }}>Verlassen bestätigen</Button></DialogActions>
    </Dialog>
  </Stack>
}
