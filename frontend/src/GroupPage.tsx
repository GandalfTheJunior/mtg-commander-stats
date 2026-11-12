import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material'
import {
  ApiError, acceptOwnership, acknowledgeOwnershipNotice, declineOwnership, getGroup, getOwnershipTransfer, leaveGroup, listOwnershipNotices,
  type CurrentUser, type GroupDetails, type OwnershipTransfer,
} from './api'
import MembersDirectory, { CloseIcon, ConfirmDialog } from './MembersDirectory'
import { directoryMemory } from './membersModel'
import GameManager from './GameManager'
import GroupOverview from './GroupOverview'
import StatisticsLanding from './StatisticsLanding'
import StatisticsChooser from './StatisticsChooser'
import StatisticsReportPage from './StatisticsReportPage'
import { statisticsUrl, type StatisticsView } from './statisticsState'
import type { Notice } from './App'
import { groupUnavailable, groupUrl, type GroupTab } from './groupNavigation'
import { forgetHandoff, handoffToken, offerHandoff, readHandoff } from './gameHandoff'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tabs: { value: GroupTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'games', label: 'Games' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'members', label: 'Members' },
]

type Toast = { key: number; message: string; shown?: () => void }
const noticeMessage = (notice: OwnershipTransfer) => notice.state === 'ACCEPTED'
  ? `${notice.targetUsername} hat die Eigentümerschaft übernommen. Du bist jetzt Mitglied.`
  : `${notice.targetUsername} hat dein Angebot zur Eigentümerübertragung abgelehnt. Du bleibst Owner.`
const canLeave = (details: GroupDetails | null) => details?.role === 'MEMBER' || details?.role === 'ADMIN'

export default function GroupPage({ tab, statisticsView = 'landing', currentUser, onUnauthorized, onNotice }: {
  tab: GroupTab
  /** Statistics landing, chooser or focused report (#197); only used with the Statistics tab. */
  statisticsView?: StatisticsView
  currentUser: CurrentUser
  onUnauthorized: () => void
  onNotice: (notice: Notice) => void
}) {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Capture the post-save panel for this mount only and retire its token at once,
  // so leaving and traversing back to this history entry cannot restore it.
  const [savedToken] = useState(() => tab === 'games' ? handoffToken(location.state, 'gameSaved') : undefined)
  const [savedMembers, setSavedMembers] = useState(() => readHandoff(savedToken, 'saved', currentUser.id, groupId))
  useEffect(() => { forgetHandoff(savedToken) }, [savedToken])
  const [details, setDetails] = useState<GroupDetails | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transfer, setTransfer] = useState<OwnershipTransfer | null>(null)
  const [transferDialog, setTransferDialog] = useState<'info' | 'accept' | null>(null)
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  // True while the latest transfer-status read failed: the last confirmed status is kept but cannot be trusted for new offers.
  const [transferStale, setTransferStale] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastKey = useRef(0)
  const [restoring] = useState(() => tab === 'members' && directoryMemory(location.state, currentUser.id, groupId) !== null)
  const request = useRef<AbortController | null>(null)
  const life = useRef<AbortController | null>(null)
  /** Shared ordering for every read or confirmed write that sets transfer state; older results are discarded. */
  const transferGeneration = useRef(0)
  /** Set while the leave write is pending or confirmed: no late read may re-show or retire the group. */
  const departing = useRef(false)
  const refreshRef = useRef<() => Promise<GroupDetails | null>>(() => Promise.resolve(null))
  const drained = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const generation = useRef(0)
  const alive = useRef(false)
  const callbacks = useRef({ onUnauthorized, onNotice, navigate })
  useEffect(() => { callbacks.current = { onUnauthorized, onNotice, navigate } })
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    life.current = controller
    return () => { alive.current = false; request.current?.abort(); controller.abort() }
  }, [])
  // Back to a restored Members directory keeps its scroll position instead of scrolling to the heading.
  useEffect(() => { if (status === 'ready') heading.current?.focus({ preventScroll: restoring }) }, [status, restoring])
  const showToast = useCallback((message: string, shown?: () => void) => {
    // Durable ownership notices (with `shown`) each stay queued; newer action feedback replaces older action feedback.
    setToasts(current => [...(shown ? current : current.filter(toast => toast.shown)), { key: ++toastKey.current, message, ...(shown ? { shown } : {}) }])
  }, [])
  const currentToast = toasts[0]
  useEffect(() => { currentToast?.shown?.() }, [currentToast])

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
      // Pending transfer status is only visible to the OWNER requester and its ADMIN target.
      if (group.role !== 'MEMBER') {
        const order = ++transferGeneration.current
        const current = () => alive.current && version === generation.current && order === transferGeneration.current && !controller.signal.aborted
        void getOwnershipTransfer(groupId, controller.signal).then(pending => {
          if (current()) { setTransfer(pending); setTransferStale(false) }
        }).catch(error => {
          if (!current()) return
          if (error instanceof ApiError && error.status === 401) handleError(error)
          // 403 is authoritative (demoted or inactive): re-read the group at once instead of waiting for a retry.
          else if (error instanceof ApiError && error.status === 403) void refreshRef.current()
          else setTransferStale(true)
        })
      }
    }).catch(error => {
      if (alive.current && version === generation.current && !controller.signal.aborted) handleError(error)
    })
    return () => { controller.abort() }
  }, [groupId, revision, accessLost, handleError])

  /** Authoritative re-read after writes, conflicts and stale responses; keeps the current view on transient failures. */
  const refresh = useCallback(() => {
    const read = async (afterDenial: boolean): Promise<GroupDetails | null> => {
      const signal = life.current?.signal
      if (!signal || signal.aborted || departing.current) return null
      const version = ++transferGeneration.current
      const current = () => !signal.aborted && !departing.current && version === transferGeneration.current
      let group: GroupDetails
      try {
        group = await getGroup(groupId, signal)
      } catch (error) {
        if (current() && error instanceof ApiError && [401, 403, 404].includes(error.status)) handleError(error)
        return null
      }
      if (!current()) return null
      setDetails(group)
      if (group.role === 'MEMBER') {
        // An ordinary member can neither request nor receive a transfer: authoritative absence.
        setTransfer(null)
        setTransferStale(false)
        return group
      }
      try {
        const pending = await getOwnershipTransfer(groupId, signal)
        if (!current()) return null
        setTransfer(pending)
        setTransferStale(false)
        return group
      } catch (error) {
        if (!current()) return null
        // Only an authoritative 404 clears the transfer; keep the last confirmed status otherwise.
        if (error instanceof ApiError && error.status === 401) handleError(error)
        // A 403 means the role or membership changed since the details read: re-read once authoritatively.
        else if (error instanceof ApiError && error.status === 403 && !afterDenial) return read(true)
        else setTransferStale(true)
        return null
      }
    }
    return read(false)
  }, [groupId, handleError])
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  // The original requester sees each persisted ACCEPTED/DECLINED outcome once, then acknowledges it
  // explicitly; batches of up to 20 are read until drained. GET alone never consumes a notice.
  useEffect(() => {
    if (status !== 'ready' || drained.current) return
    drained.current = true
    const signal = life.current?.signal
    if (!signal) return
    void (async () => {
      const presented = new Set<string>()
      try {
        for (;;) {
          const batch = (await listOwnershipNotices(groupId, signal)).filter(notice => !presented.has(notice.id.toLowerCase()))
          if (!batch.length || signal.aborted) return
          for (const notice of batch) {
            presented.add(notice.id.toLowerCase())
            await new Promise<void>(shown => showToast(noticeMessage(notice), shown))
            if (signal.aborted) return
            await acknowledgeOwnershipNotice(groupId, notice.id, signal)
          }
        }
      } catch (error) {
        // A failed read or acknowledgement stays safely retryable on the next visit.
        if (signal.aborted || !(error instanceof ApiError)) return
        if (error.status === 401) handleError(error)
        // 403 means inactive membership: confirm authoritatively and retire the group if so.
        else if (error.status === 403) void refreshRef.current()
      }
    })()
  }, [status, groupId, showToast, handleError])

  /** A server-confirmed transfer state supersedes every read issued before it. */
  const confirmTransfer = useCallback((value: OwnershipTransfer | null) => {
    transferGeneration.current++
    setTransfer(value)
    setTransferStale(false)
  }, [])

  async function respond(answer: 'accept' | 'decline') {
    const pending = transfer
    const signal = life.current?.signal
    if (!pending || !signal || transferBusy) return
    setTransferBusy(true)
    setTransferError(null)
    try {
      // The request ID binds the answer to exactly this offer, never to a newer one.
      await (answer === 'accept' ? acceptOwnership : declineOwnership)(groupId, pending.id, signal)
      if (signal.aborted) return
      setTransferDialog(null)
      confirmTransfer(null)
      showToast(answer === 'accept' ? 'Du bist jetzt Owner dieser Playgroup.' : 'Du hast das Angebot abgelehnt. Deine Rolle bleibt unverändert.')
      if (!await refresh() && !signal.aborted) setTransferError('Die Antwort wurde bestätigt, aber die Gruppe konnte nicht aktualisiert werden. Lade die Gruppe neu.')
    } catch (error) {
      if (signal.aborted) return
      setTransferDialog(null)
      if (error instanceof ApiError && error.status === 401) { handleError(error); return }
      const fresh = await refresh()
      if (signal.aborted) return
      setTransferError(!fresh ? 'Die Antwort wurde nicht bestätigt und der aktuelle Stand konnte nicht geladen werden. Lade die Gruppe neu.'
        : error instanceof ApiError && [404, 409].includes(error.status) ? 'Dieses Angebot ist nicht mehr gültig. Der aktuelle Stand wurde geladen.'
          : error instanceof ApiError && error.status === 403 ? 'Diese Aktion ist für dich nicht mehr erlaubt. Der aktuelle Stand wurde geladen.'
            : 'Die Antwort wurde nicht bestätigt. Der aktuelle Stand wurde geladen; prüfe ihn vor einem erneuten Versuch.')
    } finally {
      if (!signal.aborted) setTransferBusy(false)
    }
  }

  function recheck() {
    generation.current++
    request.current?.abort()
    setDetails(null)
    setStatus('loading')
    setRevision(value => value + 1)
  }
  async function depart() {
    if (busy || !confirmLeave || !canLeave(details)) return
    setBusy(true)
    setConfirmLeave(false)
    // Retire every pending authoritative read before hiding private details.
    departing.current = true
    transferGeneration.current++
    setDetails(null)
    const controller = request.current!
    try {
      await leaveGroup(groupId, controller.signal)
      if (!alive.current || controller.signal.aborted) return
      callbacks.current.onNotice({ kind: 'success', message: 'Du hast die Playgroup erfolgreich verlassen.' })
      void navigate('/playgroups', { replace: true, state: null })
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return
      departing.current = false
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
      {transfer && details.role === 'ADMIN' && transfer.targetUserId.toLowerCase() === currentUser.id.toLowerCase() &&
        <TransferBanner transfer={transfer} busy={transferBusy} onInfo={() => setTransferDialog('info')}
          onDecline={() => { void respond('decline') }} onAccept={() => setTransferDialog('accept')} />}
      {transferError && <Alert severity="error" role="alert" onClose={() => setTransferError(null)}>{transferError}</Alert>}
      {transferStale && details.role !== 'MEMBER' && <Alert severity="warning" role="status"
        action={<Button color="inherit" size="small" onClick={() => { void refresh() }} sx={{ minHeight: 44 }}>Erneut versuchen</Button>}>
        Der Status der Eigentümerübertragung konnte nicht geprüft werden.
      </Alert>}
      <Tabs value={tab} variant="fullWidth" textColor="secondary" indicatorColor="secondary" aria-label="Playgroup-Bereiche"
        onChange={(_event, value: GroupTab) => { void navigate(groupUrl(groupId, value)) }}
        sx={{ '& .MuiTab-root': { minHeight: 48, minWidth: 0, px: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' }, '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } } }}>
        {tabs.map(({ value, label }) => <Tab key={value} value={value} label={label} id={`group-tab-${value}`} aria-controls={`group-panel-${value}`}
          // Deliberately selecting Statistics always lands on its teaser page, even from a report.
          onClick={value === 'statistics' && tab === 'statistics' && statisticsView !== 'landing' ? () => { void navigate(statisticsUrl(groupId)) } : undefined} />)}
      </Tabs>
      {tab === 'overview' && <Box role="tabpanel" id="group-panel-overview" aria-labelledby="group-tab-overview">
        <GroupOverview groupId={groupId} onAccessError={handleError} />
      </Box>}
      {tab === 'statistics' && <Box role="tabpanel" id="group-panel-statistics" aria-labelledby="group-tab-statistics" sx={{ minWidth: 0 }}>
        {statisticsView === 'landing' ? <StatisticsLanding groupId={groupId} onAccessError={handleError} />
          : statisticsView === 'chooser' ? <StatisticsChooser groupId={groupId} />
            : <StatisticsReportPage groupId={groupId} report={statisticsView} onAccessError={handleError} />}
      </Box>}
      {tab === 'members' && <Box role="tabpanel" id="group-panel-members" aria-labelledby="group-tab-members" sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <MembersDirectory groupId={groupId} details={details} currentUser={currentUser} transfer={transfer} transferStale={transferStale} refresh={refresh}
          onAccessError={handleError} onToast={showToast} onTransfer={confirmTransfer} />
        {canLeave(details) && <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
          <Button color="secondary" disabled={busy} onClick={() => setConfirmLeave(true)} sx={{ minHeight: 48, px: 0 }}>Playgroup verlassen</Button>
        </Box>}
      </Box>}
      </>}
      {tab === 'games' && <GameManager group={details}
        savedPanel={savedMembers && <SavedGamePanel
          onAgain={() => {
            const repeatGame = offerHandoff({ kind: 'repeat', userId: currentUser.id, groupId, memberIds: savedMembers })
            void navigate(`${groupUrl(groupId, 'games')}/new`, { state: { repeatGame } })
          }}
          onOverview={() => { void navigate(groupUrl(groupId)) }}
          onDismiss={() => {
            setSavedMembers(undefined)
            void navigate(location.pathname, { replace: true, state: null })
            heading.current?.focus()
          }} />}
        onUnauthorized={() => { setDetails(null); onUnauthorized() }} onAccessLost={accessLost}
        onCheckingAccess={setCheckingAccess} onGroupConfirmed={group => { setDetails(group); setCheckingAccess(false) }} />}
    </>}
    <ConfirmDialog open={confirmLeave && canLeave(details)} id="leave" title="Playgroup verlassen?" confirm="Gruppe verlassen" busy={busy}
      onClose={() => setConfirmLeave(false)} onConfirm={() => { void depart() }}>
      <Typography>Möchtest du diese Playgroup wirklich verlassen?</Typography>
      <Typography>Du verlierst sofort den Zugriff auf die Gruppe. Historische Spiele und Statistiken bleiben erhalten.</Typography>
    </ConfirmDialog>
    <Dialog open={transferDialog === 'info'} onClose={() => setTransferDialog(null)} aria-labelledby="transfer-info-title" fullWidth maxWidth="xs"
      slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)' } } }}>
      <DialogTitle id="transfer-info-title" sx={{ pr: 7, fontWeight: 600 }}>Was bedeutet das?</DialogTitle>
      <IconButton aria-label="Schließen" onClick={() => setTransferDialog(null)} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}><CloseIcon /></IconButton>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography>Wenn du annimmst, wirst du neuer Owner dieser Playgroup.</Typography>
        <Typography>Du erhältst alle Verwaltungsrechte. {transfer?.requesterUsername} wird zu einem normalen Mitglied.</Typography>
        <Typography>Alle Spiele, Decks, Mitglieder und Statistiken bleiben erhalten.</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Diese Information nimmt das Angebot nicht an.</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button variant="contained" onClick={() => setTransferDialog(null)} sx={{ minHeight: 48, minWidth: '50%' }}>Verstanden</Button>
      </DialogActions>
    </Dialog>
    <ConfirmDialog open={transferDialog === 'accept' && Boolean(transfer)} id="transfer-accept" title="Eigentümerschaft übernehmen?" confirm="Übernahme bestätigen"
      busy={transferBusy} onClose={() => setTransferDialog(null)} onConfirm={() => { void respond('accept') }}>
      <Typography>Du wirst neuer Owner mit vollständigen Verwaltungsrechten.</Typography>
      <Typography>{transfer?.requesterUsername} wird zu einem normalen Mitglied. Alle Spiele, Decks, Mitglieder und Statistiken bleiben erhalten.</Typography>
    </ConfirmDialog>
    <Snackbar key={currentToast?.key} open={Boolean(currentToast)} autoHideDuration={6000} message={currentToast?.message}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      onClose={(_event, reason) => { if (reason !== 'clickaway') setToasts(current => current.slice(1)) }}
      slotProps={{ content: { role: 'status' } }}
      sx={{ bottom: { xs: 'calc(88px + env(safe-area-inset-bottom, 0px))', sm: 24 } }} />
  </Stack>
}

/** Recipient-only offer banner shown above all four group tabs (#198 wireframe 06a). */
function TransferBanner({ transfer, busy, onInfo, onDecline, onAccept }: {
  transfer: OwnershipTransfer; busy: boolean; onInfo: () => void; onDecline: () => void; onAccept: () => void
}) {
  return <Box component="section" aria-labelledby="transfer-banner-title"
    sx={{ p: 2, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1, bgcolor: 'background.raised', display: 'grid', gap: 1.5 }}>
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 1, mt: -1 }}>
        <Typography component="h3" id="transfer-banner-title" sx={{ fontWeight: 600, overflowWrap: 'break-word', minWidth: 0 }}>Eigentümerübertragung</Typography>
        <Button size="small" color="secondary" onClick={onInfo} sx={{ ml: 'auto', flexShrink: 0, minHeight: 44, mr: -1, px: 1, fontSize: '0.8125rem' }}>Was bedeutet das?</Button>
      </Box>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{transfer.requesterUsername} möchte dir die Eigentümerschaft übertragen.</Typography>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
      <Button variant="outlined" color="secondary" disabled={busy} onClick={onDecline} sx={{ minHeight: 48 }}>Ablehnen</Button>
      <Button variant="contained" disabled={busy} onClick={onAccept} sx={{ minHeight: 48 }}>Annehmen</Button>
    </Box>
  </Box>
}

/** Nonblocking, non-auto-dismissing confirmation after an acknowledged save. */
function SavedGamePanel({ onAgain, onOverview, onDismiss }: { onAgain: () => void; onOverview: () => void; onDismiss: () => void }) {
  return <Card component="section" aria-labelledby="game-saved-title" sx={{ p: 2, mb: 3, display: 'grid', gap: 2, border: '1px solid', borderColor: 'interaction.border' }}>
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <Box aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0, borderRadius: '50%', border: '2px solid', borderColor: 'success.main', color: 'success.main' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 5 5 9-10" /></svg>
      </Box>
      <Box role="status" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h3" variant="h6" id="game-saved-title">Spiel erfolgreich gespeichert</Typography>
        <Typography sx={{ color: 'text.secondary' }}>Deine Partie ist jetzt in der Spielehistorie dieser Playgroup sichtbar.</Typography>
      </Box>
      <IconButton aria-label="Hinweis schließen" onClick={onDismiss} sx={{ width: 48, height: 48, mt: -1, mr: -1 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </IconButton>
    </Box>
    <Button variant="contained" onClick={onAgain} sx={{ minHeight: 52 }}><Box component="span" aria-hidden="true" sx={{ mr: 1, fontSize: 22 }}>+</Box>Noch ein Spiel – gleiche Spieler</Button>
    <Button variant="outlined" color="secondary" onClick={onOverview} sx={{ minHeight: 52 }}><Box component="span" aria-hidden="true" sx={{ mr: 1 }}>←</Box>Zur Playgroup-Übersicht</Button>
  </Card>
}
