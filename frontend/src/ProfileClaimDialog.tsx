import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material'
import {
  ApiError, createProfileInvitation, getProfileInvitation, revokeProfileInvitation, type GroupMember, type Invitation, type ProfileInvitationStatus,
} from './api'
import { CloseIcon } from './MembersDirectory'
import { InvitationQr, ShareFeedback } from './InvitationDialog'
import { useLinkSharing } from './linkSharing'
import { claimUrl, formatExpiry } from './invitationLink'

/**
 * Issuer state. `created` is the only state that holds the one-time code; every other transition drops it.
 * `uncertain` follows a write whose outcome is unknown: an older link may already be revoked and a new code
 * may exist that can never be shown again, so only an explicit read-only status check leads out of it.
 */
type Phase =
  | { kind: 'loading' }
  | { kind: 'loadFailed' }
  | { kind: 'inactive' }
  | { kind: 'active'; expiresAt: string; afterUncertainty?: boolean }
  | { kind: 'created'; invitation: Invitation }
  | { kind: 'uncertain'; write: 'create' | 'revoke' }
type Confirmation = 'replace' | 'revoke'
type StatusResult = { ok: true; value: ProfileInvitationStatus } | { ok: false; error: unknown } | null
type StatusRead = { controller: AbortController; promise: Promise<StatusResult> }
const changedStatus = 'Der Einladungsstatus hat sich geändert. Bitte prüfe den aktuellen Status und bestätige die gewünschte Aktion erneut.'

/** A definite HTTP rejection means the write was not applied; network errors, 5xx and malformed bodies are ambiguous. */
const definite = (error: unknown): error is ApiError => error instanceof ApiError && error.status >= 400 && error.status < 500
const lostTarget = (error: unknown) => error instanceof ApiError && (error.status === 403 || error.status === 404)

const overline = { color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' } as const
function Overline({ children, id }: { children: ReactNode; id?: string }) {
  return <Typography id={id} variant="caption" component="p" sx={overline}>{children}</Typography>
}
function ProfileSection({ name }: { name: string }) {
  return <Box sx={{ display: 'grid', gap: 0.5, py: 1.5, borderBlock: '1px solid', borderColor: 'divider' }}>
    <Overline>Schnellprofil</Overline>
    {/* Server-provided name rendered as escaped text only. */}
    <Typography sx={{ fontSize: '1.25rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{name}</Typography>
  </Box>
}
function StatusBox({ active, title, titleRef, children }: { active: boolean; title: string; titleRef?: Ref<HTMLElement>; children?: ReactNode }) {
  return <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.raised', display: 'grid', gap: 0.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, border: '2px solid', borderColor: 'text.primary',
        bgcolor: active ? 'text.primary' : 'transparent' }} />
      <Typography ref={titleRef} tabIndex={titleRef ? -1 : undefined} sx={{ fontWeight: 600, '&:focus': { outline: 'none' } }}>{title}</Typography>
    </Box>
    {children}
  </Box>
}
const Expiry = ({ at }: { at: string }) => <Typography>Gültig bis <time dateTime={at}>{formatExpiry(at)}</time></Typography>
const Chevron = ({ up }: { up: boolean }) => <Box component="svg" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
  sx={{ width: 20, height: 20, ml: 'auto', flexShrink: 0, transform: up ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6" /></Box>

const buttonSx = { minHeight: 48 } as const
const longest = 2 ** 31 - 1
/**
 * While the device clock says expired but the server still reports the invitation active, re-check with backoff:
 * 1 s, 2 s, 4 s … at most once a minute. A timer firing just before the server's instant thus costs about a second,
 * and a badly skewed clock causes at most one read per minute.
 */
const expiryRecheckMs = (round: number) => Math.min(60_000, 1_000 * 2 ** (round - 1))

/**
 * #247 issuer dialog for one active quick profile. Opening only reads the status (GET); creating, replacing and
 * revoking happen exclusively from deliberate presses, at most one request at a time, and are never retried
 * automatically. Unmounting (close, profile/group/identity change) aborts requests and discards the code.
 */
export default function ProfileClaimDialog({ groupId, profile, onClose, onUnauthorized, onTargetLost }: {
  groupId: string
  profile: GroupMember
  onClose: () => void
  /** 401: the session ended. */
  onUnauthorized: (error: unknown) => void
  /** 403/404: the viewer may no longer manage this profile, or it is gone; the roster must be re-read. */
  onTargetLost: (error: unknown) => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [confirm, setConfirm] = useState<{ kind: Confirmation; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const life = useRef<AbortController | null>(null)
  const statusRead = useRef<StatusRead | null>(null)
  const intent = useRef<AbortController | null>(null)
  const mutating = useRef(false)
  const heading = useRef<HTMLElement>(null)
  const qrId = useId()
  const linkId = useId()
  const callbacks = useRef({ onUnauthorized, onTargetLost })
  useEffect(() => { callbacks.current = { onUnauthorized, onTargetLost } })
  const code = phase.kind === 'created' ? phase.invitation.code : null
  const sharing = useLinkSharing(code ? claimUrl(code) : null, 'Profilübernahme')

  /** Share an in-flight read without locking controls. Canceled/retired reads cannot publish even if fetch ignores abort. */
  const fetchStatus = useCallback((): Promise<StatusResult> => {
    const lifetime = life.current?.signal
    if (!lifetime || lifetime.aborted) return Promise.resolve(null)
    if (statusRead.current) return statusRead.current.promise
    const controller = new AbortController()
    const signal = AbortSignal.any([lifetime, controller.signal])
    setChecking(true)
    const request: StatusRead = { controller, promise: getProfileInvitation(groupId, profile.userId, signal).then(
      value => signal.aborted ? null : { ok: true as const, value },
      (error: unknown) => signal.aborted ? null : { ok: false as const, error },
    ).finally(() => {
      if (statusRead.current === request) {
        statusRead.current = null
        if (!lifetime.aborted) setChecking(false)
      }
    }) }
    statusRead.current = request
    return request.promise
  }, [groupId, profile.userId])

  /** Hands access-level outcomes to the roster. Returns true when the dialog is being retired. */
  const escalate = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) { callbacks.current.onUnauthorized(error); return true }
    if (lostTarget(error)) { callbacks.current.onTargetLost(error); return true }
    return false
  }, [])

  /** Read-only, authoritative status. Never creates or reveals a code. */
  const readStatus = useCallback(async (afterUncertainty = false) => {
    setError(null)
    const result = await fetchStatus()
    if (!result) return
    if (result.ok) {
      setPhase(result.value.active ? { kind: 'active', expiresAt: result.value.expiresAt, afterUncertainty } : { kind: 'inactive' })
      return
    }
    if (escalate(result.error)) return
    if (afterUncertainty) setError('Der Status konnte nicht geprüft werden. Bitte versuche es erneut.')
    else setPhase({ kind: 'loadFailed' })
  }, [fetchStatus, escalate])

  useEffect(() => {
    const controller = new AbortController()
    life.current = controller
    statusRead.current = null
    intent.current = null
    mutating.current = false
    // Opening only reads the status; the GET is idempotent, so a StrictMode re-run is harmless.
    getProfileInvitation(groupId, profile.userId, controller.signal).then(status => {
      if (!controller.signal.aborted) setPhase(status.active ? { kind: 'active', expiresAt: status.expiresAt } : { kind: 'inactive' })
    }, (error: unknown) => {
      if (!controller.signal.aborted && !escalate(error)) setPhase({ kind: 'loadFailed' })
    })
    return () => controller.abort()
  }, [groupId, profile.userId, escalate])

  /**
   * Expiry is server-authoritative (#247 §2, PR #309 review): reaching `expiresAt` on the device clock only triggers a
   * read-only status GET. The dialog shows what the server reports and never asserts expiry itself, so a skewed clock
   * can neither hide a still-redeemable link nor turn a replacement into an unconfirmed POST. No countdown is shown.
   */
  const expiresAt = phase.kind === 'created' ? phase.invitation.expiresAt : phase.kind === 'active' ? phase.expiresAt : null
  const [expiryRound, setExpiryRound] = useState<{ at: string; round: number } | null>(null)
  const round = expiryRound !== null && expiryRound.at === expiresAt ? expiryRound.round : 0
  const checkExpiry = useCallback(async (at: string) => {
    const again = () => setExpiryRound(current => ({ at, round: (current?.at === at ? current.round : 0) + 1 }))
    if (life.current?.signal.aborted) return
    if (intent.current) { again(); return }
    const lifetime = life.current
    const result = await fetchStatus()
    if (lifetime?.signal.aborted) return
    // A user action owns the result while verifying; a background response must not overwrite its state.
    if (intent.current) { again(); return }
    if (!result) { again(); return }
    if (result.ok) {
      const status = result.value
      if (!status.active) {
        setConfirm(null)
        setPhase({ kind: 'inactive' })
        setNotice('Die Einladung ist nicht mehr aktiv.')
        return
      }
      // Still active on the server: keep the shown invitation (and its code) only if it is that same invitation.
      if (status.expiresAt !== at) { setConfirm(null); setNotice(changedStatus) }
      setPhase(current => (current.kind === 'created' && current.invitation.expiresAt === status.expiresAt) ||
        (current.kind === 'active' && current.expiresAt === status.expiresAt) ? current : { kind: 'active', expiresAt: status.expiresAt })
      again()
      return
    }
    if (escalate(result.error)) return
    setConfirm(null)
    setPhase({ kind: 'loadFailed' })
  }, [fetchStatus, escalate])
  useEffect(() => {
    if (!expiresAt) return
    const delay = round === 0 ? Math.min(longest, Math.max(0, Date.parse(expiresAt) - Date.now())) : expiryRecheckMs(round)
    const timer = window.setTimeout(() => { void checkExpiry(expiresAt) }, delay)
    return () => window.clearTimeout(timer)
  }, [expiresAt, round, checkExpiry])

  useEffect(() => { if (phase.kind === 'created' || phase.kind === 'uncertain') heading.current?.focus() }, [phase.kind])

  async function submit(write: 'create' | 'revoke', expectedExpiry: string | null) {
    const lifetime = life.current?.signal
    if (!lifetime || lifetime.aborted || intent.current) return
    const action = new AbortController()
    const signal = AbortSignal.any([lifetime, action.signal])
    // Pair aria-disabled with this synchronous guard: repeated activation is ignored without dropping focus or Escape.
    intent.current = action
    setVerifying(true)
    setError(null)
    setNotice(null)
    const before = phase
    try {
      // An accepted click waits for the ongoing read, or starts a fresh one. Failed verification never queues a retry.
      const result = await fetchStatus()
      if (signal.aborted || !result) return
      if (!result.ok) {
        if (!escalate(result.error)) setError('Der Status konnte nicht geprüft werden. Es wurde nichts geändert. Bitte versuche die Aktion erneut.')
        return
      }
      const status = result.value
      if (status.expiresAt !== expectedExpiry) {
        setConfirm(null)
        setPhase(status.active ? { kind: 'active', expiresAt: status.expiresAt } : { kind: 'inactive' })
        setNotice(changedStatus)
        return
      }
      // Only the actual write locks dismissal. Verification and background reads remain cancelable.
      setVerifying(false)
      mutating.current = true
      setBusy(true)
      try {
        if (write === 'create') {
          const invitation = await createProfileInvitation(groupId, profile.userId, signal)
          if (!signal.aborted) { setQrOpen(false); setPhase({ kind: 'created', invitation }) }
        } else {
          await revokeProfileInvitation(groupId, profile.userId, signal)
          if (!signal.aborted) { setPhase({ kind: 'inactive' }); setNotice('Die Einladung wurde widerrufen.') }
        }
      } catch (error) {
        if (signal.aborted || escalate(error)) return
        if (definite(error)) {
          setPhase(before)
          setError(write === 'create' ? 'Die Einladung konnte nicht erstellt werden. Es wurde kein neuer Link erstellt.'
            : 'Die Einladung konnte nicht widerrufen werden. Der bestehende Link bleibt gültig.')
        } else setPhase({ kind: 'uncertain', write })
      }
      if (!signal.aborted) setConfirm(null)
    } finally {
      if (intent.current === action) {
        intent.current = null
        mutating.current = false
        if (!lifetime.aborted) { setVerifying(false); setBusy(false) }
      }
    }
  }

  const cancelVerification = () => {
    intent.current?.abort()
    intent.current = null
    statusRead.current?.controller.abort()
    statusRead.current = null
    setChecking(false)
    setVerifying(false)
    setError(null)
  }
  const cancelConfirmation = () => {
    if (mutating.current) return
    cancelVerification()
    setConfirm(null)
  }
  const close = () => {
    if (mutating.current) return
    cancelVerification()
    life.current?.abort()
    onClose()
  }
  const locked = busy || verifying
  const title = (text: string) => <Typography ref={heading} tabIndex={-1} sx={{ fontWeight: 600, '&:focus': { outline: 'none' } }}>{text}</Typography>
  const closeButton = <Button variant="outlined" color="secondary" fullWidth onClick={close} disabled={busy} sx={buttonSx}>Schließen</Button>

  let body: ReactNode
  if (phase.kind === 'loading') {
    body = <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
      <CircularProgress size={24} color="secondary" aria-hidden="true" /><Typography>Einladungsstatus wird geladen…</Typography>
    </Box>
  } else if (phase.kind === 'loadFailed') {
    body = <>
      <Typography role="alert" sx={{ fontWeight: 600 }}>Der Einladungsstatus konnte nicht geladen werden.</Typography>
      <Typography sx={{ color: 'text.secondary' }}>Ob eine Einladung aktiv ist, lässt sich gerade nicht feststellen.</Typography>
      <Button variant="contained" fullWidth disabled={checking} onClick={() => { setPhase({ kind: 'loading' }); void readStatus() }} sx={buttonSx}>Erneut versuchen</Button>
      {closeButton}
    </>
  } else if (phase.kind === 'inactive') {
    body = <>
      <StatusBox active={false} title="Keine aktive Einladung" />
      <Typography>Erstelle einen einmalig verwendbaren Einladungslink. Er ist ab Erstellung 1 Stunde gültig.</Typography>
      <Button variant="contained" fullWidth disabled={busy} aria-disabled={verifying || undefined} onClick={() => { void submit('create', null) }} sx={buttonSx}>
        {busy ? 'Einladung wird erstellt…' : 'Einladung erstellen'}
      </Button>
      {closeButton}
    </>
  } else if (phase.kind === 'active') {
    body = <>
      <StatusBox active title="Aktive Einladung">
        <Expiry at={phase.expiresAt} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Einmalig verwendbar</Typography>
      </StatusBox>
      <Typography>Der bestehende Link kann nicht erneut angezeigt werden.</Typography>
      {phase.afterUncertainty && <Typography role="status" sx={{ color: 'text.secondary' }}>
        Ein möglicherweise gerade erstellter Link lässt sich nicht abrufen. Eine neue Einladung macht den aktiven Link ungültig.
      </Typography>}
      <Stack sx={{ gap: 0.75 }}>
        <Button variant="contained" fullWidth disabled={locked} onClick={() => { setError(null); setConfirm({ kind: 'replace', expiresAt: phase.expiresAt }) }} sx={buttonSx}>Neue Einladung erstellen</Button>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Der bisherige Link wird dadurch ungültig.</Typography>
      </Stack>
      <Button variant="outlined" color="error" fullWidth disabled={locked} onClick={() => { setError(null); setConfirm({ kind: 'revoke', expiresAt: phase.expiresAt }) }} sx={buttonSx}>Einladung widerrufen</Button>
      {closeButton}
    </>
  } else if (phase.kind === 'uncertain') {
    body = <>
      <Box role="alert" sx={{ display: 'grid', gap: 1 }}>
        {title(phase.write === 'create' ? 'Erstellung nicht bestätigt' : 'Widerruf nicht bestätigt')}
        <Typography>{phase.write === 'create'
          ? 'Es ist unklar, ob eine neue Einladung erstellt wurde. Ein bisheriger Link ist möglicherweise bereits ungültig, und ein neuer Link kann nicht angezeigt werden.'
          : 'Es ist unklar, ob die Einladung widerrufen wurde.'}</Typography>
      </Box>
      <Typography sx={{ color: 'text.secondary' }}>Prüfe den aktuellen Status. Es wird nichts automatisch wiederholt.</Typography>
      <Button variant="contained" fullWidth disabled={checking} onClick={() => { void readStatus(true) }} sx={buttonSx}>Status prüfen</Button>
      {closeButton}
    </>
  } else {
    const url = sharing.url!
    body = <>
      <StatusBox active title="Neue Einladung erstellt" titleRef={heading}>
        <Expiry at={phase.invitation.expiresAt} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Einmalig verwendbar · 1 Stunde</Typography>
      </StatusBox>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography component="label" htmlFor={linkId} variant="caption" sx={overline}>Einladungslink</Typography>
        <TextField id={linkId} inputRef={sharing.manualField} value={url} fullWidth size="small"
          onFocus={event => event.target.select()}
          slotProps={{ htmlInput: { readOnly: true, spellCheck: false, style: { textOverflow: 'ellipsis' } } }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', '& > *': { flex: '1 1 120px', minHeight: 48 } }}>
        {sharing.shareable && <Button variant="contained" onClick={() => { void sharing.share() }}>Teilen</Button>}
        <Button variant={sharing.shareable ? 'outlined' : 'contained'} color={sharing.shareable ? 'secondary' : 'primary'}
          onClick={() => { void sharing.copyLink() }}>Link kopieren</Button>
      </Box>
      <ShareFeedback sharing={sharing} field={false} />
      <Button variant="outlined" color="secondary" aria-expanded={qrOpen} aria-controls={qrOpen ? qrId : undefined} onClick={() => setQrOpen(open => !open)}
        sx={{ ...buttonSx, justifyContent: 'flex-start', textAlign: 'left' }}>
        {qrOpen ? 'QR-Code verbergen' : 'QR-Code anzeigen'}<Chevron up={qrOpen} />
      </Button>
      {qrOpen && <InvitationQr url={url} id={qrId} />}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Link jetzt weitergeben. Nach dem Schließen kann er nicht erneut angezeigt werden.</Typography>
      {closeButton}
    </>
  }

  return <>
    <Dialog open onClose={close} aria-labelledby="claim-invite-title" fullWidth maxWidth="xs" scroll="paper"
      slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } } }}>
      <DialogTitle id="claim-invite-title" sx={{ pr: 7, fontWeight: 600 }}>Profilübernahme einladen</DialogTitle>
      <IconButton aria-label="Schließen" onClick={close} disabled={busy} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}><CloseIcon /></IconButton>
      <DialogContent sx={{ display: 'grid', gap: 2, pb: 3 }}>
        <ProfileSection name={profile.username} />
        {checking && <Typography role="status" sx={{ color: 'text.secondary' }}>Einladungsstatus wird geprüft…</Typography>}
        {notice && <Typography role="status" sx={{ color: notice === changedStatus ? 'text.secondary' : 'success.main' }}>{notice}</Typography>}
        {error && <Typography role="alert" sx={{ color: 'error.main' }}>{error}</Typography>}
        {body}
      </DialogContent>
    </Dialog>
    <ManagementConfirmation kind={confirm?.kind ?? null} name={profile.username} busy={busy} verifying={verifying}
      checking={checking} error={error} onCancel={cancelConfirmation}
      onConfirm={() => { if (confirm) void submit(confirm.kind === 'revoke' ? 'revoke' : 'create', confirm.expiresAt) }} />
  </>
}

/** #247 wireframe 03: separate, named confirmation before replacing or revoking an existing link. */
function ManagementConfirmation({ kind, name, busy, verifying, checking, error, onCancel, onConfirm }: {
  kind: Confirmation | null; name: string; busy: boolean; verifying: boolean; checking: boolean; error: string | null
  onCancel: () => void; onConfirm: () => void
}) {
  // Keep the last copy while the closing transition runs.
  const [shown, setShown] = useState(kind)
  if (kind && kind !== shown) setShown(kind)
  const showReplace = (kind ?? shown) === 'replace'
  const cancel = busy ? undefined : onCancel
  return <Dialog open={Boolean(kind)} onClose={cancel} aria-labelledby="claim-confirm-title" aria-describedby="claim-confirm-body" fullWidth maxWidth="xs"
    slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } } }}>
    <DialogTitle id="claim-confirm-title" sx={{ pr: 7, fontWeight: 600 }}>{showReplace ? 'Einladung ersetzen?' : 'Einladung widerrufen?'}</DialogTitle>
    <IconButton aria-label="Schließen" onClick={onCancel} disabled={busy} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}><CloseIcon /></IconButton>
    <DialogContent sx={{ display: 'grid', gap: 2, pb: 3 }}>
      <ProfileSection name={name} />
      <Box id="claim-confirm-body" sx={{ display: 'grid', gap: 1.5 }}>
        {showReplace ? <>
          <Typography>Der bisherige Einladungslink wird sofort ungültig – auch wenn du ihn bereits geteilt hast.</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Anschließend wird ein neuer einmaliger Link erstellt. Er ist 1 Stunde gültig und wird nur einmal angezeigt.</Typography>
        </> : <>
          <Typography>Der vorhandene Einladungslink wird sofort ungültig. Er kann danach nicht mehr zur Profilübernahme genutzt werden.</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Das Schnellprofil, seine Decks und seine Spiele bleiben unverändert.</Typography>
        </>}
      </Box>
      {checking && <Typography role="status" sx={{ color: 'text.secondary' }}>Einladungsstatus wird geprüft…</Typography>}
      {error && <Typography role="alert" sx={{ color: 'error.main' }}>{error}</Typography>}
      {showReplace
        ? <Button variant="contained" fullWidth disabled={busy} aria-disabled={verifying || undefined} onClick={onConfirm} sx={buttonSx}>{busy ? 'Neuer Link wird erstellt…' : 'Neuen Link erstellen'}</Button>
        : <Button variant="outlined" color="error" fullWidth disabled={busy} aria-disabled={verifying || undefined} onClick={onConfirm} sx={buttonSx}>{busy ? 'Einladung wird widerrufen…' : 'Einladung widerrufen'}</Button>}
      <Button variant="outlined" color="secondary" fullWidth disabled={busy} onClick={onCancel} sx={buttonSx}>Abbrechen</Button>
    </DialogContent>
  </Dialog>
}
