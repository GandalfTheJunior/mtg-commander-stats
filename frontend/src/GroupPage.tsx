import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Menu, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { ApiError, getGroup, getJoinCode, leaveGroup, type CurrentUser, type GroupDetails, type GroupMember } from './api'
import GameManager from './GameManager'
import type { Notice } from './App'

import { groupUrl, groupUnavailable, type GroupTab } from './groupNavigation'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uncertainCode = 'Die Codeänderung wurde nicht bestätigt; der Ausgang kann ungewiss sein. Zeige den aktuellen Einladungscode erneut an, um den Serverstand zu prüfen.'
const deniedCode = 'Die Codeaktion wurde abgelehnt (Berechtigung oder CSRF). Zeige den aktuellen Code nach bestätigter Gruppenberechtigung bei Bedarf erneut an.'

// Only colliding names need an ID. Grow a suffix until it distinguishes every
// namesake, including IDs that differ only near their beginning.
function memberSuffix(member: GroupMember, members: GroupMember[]) {
  const peers = members.filter(other => other.username === member.username && other.userId !== member.userId)
  if (!peers.length) return null
  let length = 4
  while (length < member.userId.length && peers.some(other => other.userId.slice(-length) === member.userId.slice(-length))) length++
  return member.userId.slice(-length)
}

export default function GroupPage({ currentUser, onUnauthorized, onNotice, onOpenCode, getCodeReturn }: {
  currentUser: CurrentUser
  onUnauthorized: () => void
  onNotice: (notice: Notice) => void
  onOpenCode: (id: string, tab: GroupTab) => void
  getCodeReturn: () => GroupTab
}) {
  const [codeReturn] = useState(getCodeReturn)
  const { groupId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isCode = location.pathname.endsWith('/invitation-code')
  const rawTab = params.get('tab')
  const tab: GroupTab = rawTab === 'statistics' || rawTab === 'members' ? rawTab : 'games'
  const [details, setDetails] = useState<GroupDetails | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [checkingGames, setCheckingGames] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const cancelLeave = useRef<HTMLButtonElement>(null)
  const alive = useRef(false)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const callbacks = useRef({ onUnauthorized, onNotice, navigate })
  useEffect(() => { callbacks.current = { onUnauthorized, onNotice, navigate } })
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current?.abort() }
  }, [])

  useEffect(() => {
    if (!isCode && rawTab !== null && (tab === 'games' || params.getAll('tab').length !== 1)) {
      void navigate(groupUrl(groupId, tab), { replace: true, state: null })
    }
  }, [groupId, isCode, navigate, params, rawTab, tab])

  const unavailable = useCallback(() => {
    setDetails(null)
    setMenu(null)
    setConfirmLeave(false)
    callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
    void callbacks.current.navigate('/playgroups', { replace: true, state: null })
  }, [])
  // Callbacks are refs so ordinary tab/menu renders never restart verification.
  const handleVerificationError = useCallback((error: unknown) => {
    setDetails(null)
    if (error instanceof ApiError && error.status === 401) callbacks.current.onUnauthorized()
    else if (error instanceof ApiError && [400, 403, 404].includes(error.status)) unavailable()
    else {
      setStatus('error')
      setNotice({ kind: 'error', message: 'Die Gruppenberechtigung konnte nicht geprüft werden. Bitte erneut laden.' })
    }
  }, [unavailable])
  useEffect(() => {
    if (!validId.test(groupId)) {
      callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
      void callbacks.current.navigate('/playgroups', { replace: true, state: null })
      return
    }
    const version = ++generation.current
    const controller = new AbortController()
    request.current = controller
    getGroup(groupId, controller.signal).then(group => {
      if (!alive.current || version !== generation.current) return
      if (isCode && group.role !== 'OWNER') {
        callbacks.current.onNotice({ kind: 'error', message: 'Nur Gruppenersteller können den Einladungscode verwalten.' })
        void callbacks.current.navigate(groupUrl(groupId), { replace: true, state: null })
        return
      }
      setDetails(group)
      setStatus('ready')
    }).catch((error: unknown) => { if (alive.current && version === generation.current) handleVerificationError(error) })
    return () => { controller.abort() }
  }, [groupId, isCode, revision, handleVerificationError])

  useEffect(() => { if (status === 'ready') heading.current?.focus() }, [status])

  useEffect(() => {
    document.getElementById(`group-tab-${tab}`)?.focus()
  }, [tab])

  function recheck(message?: string) {
    generation.current++
    request.current?.abort()
    setDetails(null)
    setCheckingGames(false)
    setMenu(null)
    setConfirmLeave(false)
    setNotice(message ? { kind: 'error', message } : null)
    setStatus('loading')
    setRevision(value => value + 1)
  }
  function codeFailure(error: unknown, regenerate: boolean) {
    if (error instanceof ApiError && error.status === 401) { setDetails(null); onUnauthorized(); return }
    recheck(regenerate ? uncertainCode : error instanceof ApiError && error.status === 403 ? deniedCode : 'Der aktuelle Einladungscode konnte nicht bestätigt werden. Prüfe die Gruppenberechtigung und zeige den Code erneut an.')
  }
  async function depart() {
    if (pending.current || details?.role !== 'MEMBER' || !confirmLeave) return
    pending.current = true
    setBusy(true)
    setDetails(null)
    setMenu(null)
    setConfirmLeave(false)
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    const version = ++generation.current
    try {
      await leaveGroup(groupId, controller.signal)
      if (!alive.current || version !== generation.current) return
      setDetails(null)
      onNotice({ kind: 'success', message: 'Du hast die Gruppe verlassen. Historische Spiele und Statistiken bleiben erhalten.' })
      void navigate('/playgroups', { replace: true, state: null })
    } catch (error) {
      if (!alive.current || version !== generation.current) return
      if (error instanceof ApiError && error.status === 401) { setDetails(null); onUnauthorized() }
      else recheck('Der Austritt wurde nicht bestätigt; der Ausgang kann ungewiss sein. Die Gruppenberechtigung wird vor einem weiteren Versuch erneut geprüft. Historische Spiele bleiben erhalten.')
    } finally {
      if (alive.current) { pending.current = false; setBusy(false) }
    }
  }

  return <Stack component="section" aria-label={isCode ? 'Einladungscode verwalten' : 'Group details'} sx={{ gap: 2, minWidth: 0 }}>
    <Button component={Link} to={isCode ? groupUrl(groupId, codeReturn) : '/playgroups'} color="secondary" sx={{ alignSelf: 'flex-start' }}>
      {isCode ? 'Zurück zur Gruppe' : 'Zurück zu Playgroups'}
    </Button>
    {busy && <Typography role="status">Austritt wird bestätigt…</Typography>}
    {status === 'loading' && <Typography role="status">Gruppenberechtigung wird geprüft…</Typography>}
    {notice && <Alert severity={notice.kind} role="status">{notice.message}</Alert>}
    {status === 'error' && <Button onClick={() => recheck()}>Gruppe erneut laden</Button>}
    {details && <>
      {!checkingGames && <>
        <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" variant="h4" ref={heading} tabIndex={-1} sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, overflowWrap: 'anywhere', '&:focus': { outline: '2px solid', outlineColor: 'interaction.focus', outlineOffset: 3 } }}>
              {isCode ? 'Einladungscode verwalten' : details.name}
            </Typography>
            {isCode && <Typography sx={{ color: 'text.secondary', mt: 1 }}>{details.name}</Typography>}
          </Box>
          {!isCode && <IconButton ref={menuTrigger} aria-label="Gruppenaktionen" aria-haspopup="menu" aria-controls={menu ? 'group-actions' : undefined}
            aria-expanded={Boolean(menu)} disabled={busy} onClick={event => setMenu(event.currentTarget)} sx={{ width: 48, height: 48, flexShrink: 0, '&:focus-visible, &.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 } }}>⋮</IconButton>}
        </Stack>
        {!isCode && <>
          <Menu id="group-actions" anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} slotProps={{ list: { 'aria-label': 'Gruppenaktionen', sx: { '& .MuiMenuItem-root': { minHeight: 48, whiteSpace: 'normal' }, '& .MuiMenuItem-root.Mui-focusVisible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } } } }}>
            {details.role === 'OWNER' ? <MenuItem onClick={() => {
              setMenu(null)
              onOpenCode(groupId, tab)
            }}>Einladungscode verwalten</MenuItem> : <MenuItem onClick={() => { setMenu(null); setConfirmLeave(true) }}>Gruppe verlassen</MenuItem>}
          </Menu>
          <Tabs value={tab} variant="fullWidth" textColor="secondary" indicatorColor="secondary" aria-label="Playgroup-Bereiche" onChange={(_event, value: GroupTab) => {
            void navigate(groupUrl(groupId, value), { state: null })
          }} sx={{ minWidth: 0, '& .MuiTab-root': { minWidth: 0, px: 0.5, minHeight: 48, fontSize: '0.875rem', '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } } }}>
            {(['games', 'statistics', 'members'] as const).map((value, index) => <Tab key={value} value={value} id={`group-tab-${value}`}
              aria-controls={`group-panel-${value}`} label={['Spiele', 'Statistiken', 'Mitglieder'][index]} />)}
          </Tabs>
          <Box role="tabpanel" id="group-panel-members" aria-labelledby="group-tab-members" hidden={tab !== 'members'} tabIndex={0}>
            <Button color="secondary" onClick={() => recheck()} disabled={busy}>Mitglieder aktualisieren</Button>
            <Stack component="ul" aria-label="Aktive Mitglieder" sx={{ listStyle: 'none', p: 0, m: 0, mt: 2, gap: 1 }}>
              {details.members.map(member => {
                const suffix = memberSuffix(member, details.members)
                return <Card component="li" key={member.userId} sx={{ p: 2, overflowWrap: 'anywhere' }}>
                  <Typography component="p" sx={{ fontWeight: 600, mb: 0.5 }}>{member.username}{member.userId === currentUser.id && ' · Du'}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{member.role === 'OWNER' ? <><Box component="span" aria-hidden="true" sx={{ color: 'secondary.main' }}>◆ </Box>Gruppenersteller</> : 'Mitglied'}</Typography>
                  {suffix && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Kennung: …{suffix}</Typography>}
                </Card>
              })}
            </Stack>
          </Box>
        </>}
      </>}
      {isCode ? <InvitationCode groupId={groupId} onFailure={codeFailure} /> : <Box className="legacy-view" sx={{ bgcolor: tab === 'members' && !checkingGames ? 'transparent' : '#fff', borderRadius: 2, px: 2, pb: tab === 'members' && !checkingGames ? 0 : 2, minWidth: 0 }}><GameManager group={details} actorId={currentUser.id} tab={tab}
        onUnauthorized={() => { setDetails(null); onUnauthorized() }} onAccessLost={unavailable}
        onCheckingAccess={checking => { setCheckingGames(checking); if (checking) { setMenu(null); setConfirmLeave(false) } }}
        onGroupConfirmed={group => setDetails(group)} /></Box>}
    </>}
    <Dialog open={confirmLeave && details?.role === 'MEMBER'} onClose={() => setConfirmLeave(false)} aria-labelledby="leave-title"
      slotProps={{ transition: { onEntered: () => cancelLeave.current?.focus(), onExited: () => menuTrigger.current?.focus() } }}>
      <DialogTitle id="leave-title">Gruppe verlassen?</DialogTitle>
      <DialogContent><DialogContentText>Du verlierst sofort den aktiven Zugriff auf diese Gruppe. Historische Spiele und Statistiken bleiben erhalten.
        Zum erneuten Beitreten brauchst du den aktuellen gültigen Einladungscode.</DialogContentText></DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button ref={cancelLeave} autoFocus onClick={() => setConfirmLeave(false)}>Abbrechen</Button>
        <Button color="error" disabled={busy} onClick={() => { void depart() }}>Verlassen bestätigen</Button>
      </DialogActions>
    </Dialog>
  </Stack>
}

function InvitationCode({ groupId, onFailure }: { groupId: string; onFailure: (error: unknown, regenerate: boolean) => void }) {
  const [code, setCode] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const alive = useRef(false)
  const pending = useRef(false)
  const request = useRef<AbortController | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const codeField = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    alive.current = true
    request.current = new AbortController()
    return () => { alive.current = false; request.current?.abort() }
  }, [])

  useLayoutEffect(() => { if (code) codeField.current?.focus() }, [code])

  async function load(regenerate: boolean) {
    if (pending.current || (regenerate && !confirm)) return
    pending.current = true
    cancelled.current = false
    setBusy(true)
    setConfirm(false)
    setCode(null)
    setNotice(null)
    const controller = request.current!
    try {
      const fresh = await getJoinCode(groupId, regenerate, controller.signal)
      if (!alive.current || controller.signal.aborted) return
      setCode(fresh)
      if (regenerate) setNotice({ kind: 'success', message: 'Der neue Einladungscode wurde bestätigt. Der alte Code ist jetzt ungültig.' })
    } catch (error) {
      if (alive.current && !controller.signal.aborted) { setCode(null); onFailure(error, regenerate) }
    } finally {
      if (alive.current) { pending.current = false; setBusy(false) }
    }
  }
  async function copy() {
    if (!code || pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await navigator.clipboard.writeText(code)
      if (alive.current) setNotice({ kind: 'success', message: 'Einladungscode kopiert.' })
    } catch {
      if (alive.current) setNotice({ kind: 'error', message: 'Kopieren nicht möglich. Bitte den sichtbaren Code im Feld auswählen und manuell kopieren.' })
    } finally {
      if (alive.current) { pending.current = false; setBusy(false) }
    }
  }
  return <Stack sx={{ gap: 2 }}>
    <Typography>Nur Gruppenersteller können den aktuellen Einladungscode anzeigen und erneuern. Der Code ist vertraulich und unterscheidet Groß- und Kleinschreibung.</Typography>
    <Button variant="contained" disabled={busy} onClick={() => { void load(false) }}>Einladungscode anzeigen</Button>
    {code && <>
      <TextField inputRef={codeField} label="Aktueller Einladungscode" value={code} slotProps={{ input: { readOnly: true }, htmlInput: { spellCheck: false, autoComplete: 'off' } }}
        sx={{ '& input': { fontFamily: 'monospace', fontSize: '0.875rem' }, '& input[readonly]': { bgcolor: 'background.paper', color: 'text.primary' } }} />
      <Button color="secondary" disabled={busy} onClick={() => { void copy() }}>Kopieren</Button>
    </>}
    <Button ref={trigger} color="secondary" variant="outlined" disabled={busy} onClick={() => { cancelled.current = true; setConfirm(true) }}>Code regenerieren</Button>
    {busy && <Typography role="status">Codeaktion läuft…</Typography>}
    {notice && <Alert role="status" severity={notice.kind}>{notice.message}</Alert>}
    <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="regenerate-title"
      slotProps={{ transition: { onEntered: () => cancelButton.current?.focus(), onExited: () => { if (cancelled.current) trigger.current?.focus() } } }}>
      <DialogTitle id="regenerate-title">Einladungscode regenerieren?</DialogTitle>
      <DialogContent><DialogContentText>Der alte Code wird nach erfolgreicher Regenerierung sofort ungültig. Bestehende Mitglieder bleiben in der Gruppe.
        Für zukünftiges Beitreten und erneutes Beitreten funktioniert nur der neue Code.</DialogContentText></DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button ref={cancelButton} autoFocus onClick={() => setConfirm(false)}>Abbrechen</Button>
        <Button disabled={busy} onClick={() => { void load(true) }}>Regenerieren bestätigen</Button>
      </DialogActions>
    </Dialog>
  </Stack>
}
