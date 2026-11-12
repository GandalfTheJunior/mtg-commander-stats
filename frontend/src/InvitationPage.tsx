import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Box, Button, Card, CircularProgress, IconButton, Typography } from '@mui/material'
import { ApiError, joinGroup, previewInvitation, type CurrentUser } from './api'
import { offerHandoff } from './gameHandoff'
import { groupUrl } from './groupNavigation'
import { inviteAuthKey, inviteCode, type InviteAuthIntent } from './invitationLink'
import type { Notice } from './App'

type Preview =
  | { status: 'loading' }
  | { status: 'ready'; groupName: string }
  | { status: 'unavailable' }
  | { status: 'failed'; retryAfter: number | null }
type Join =
  | { status: 'idle' }
  | { status: 'joining' }
  | { status: 'member' }
  | { status: 'failed'; retryAfter: number | null }

const defaultRetryAfter = 60
/** Retry-After seconds for a 429 (default one minute); null when another attempt is allowed at once. */
function retryDelay(error: unknown): number | null {
  return error instanceof ApiError && error.status === 429 ? Math.max(1, error.retryAfterSeconds ?? defaultRetryAfter) : null
}
const waitHint = (seconds: number) => seconds >= 60
  ? `Bitte warte etwa ${Math.round(seconds / 60)} ${Math.round(seconds / 60) === 1 ? 'Minute' : 'Minuten'}, bevor du es erneut versuchst.`
  : `Bitte warte etwa ${seconds} Sekunden, bevor du es erneut versuchst.`

/** Keeps a manual retry disabled until its Retry-After window has passed; nothing is resent automatically. */
function useRetryWindow(delay: number | null, attempt: unknown) {
  const [elapsed, setElapsed] = useState<unknown>(null)
  useEffect(() => {
    if (delay === null) return
    const timer = window.setTimeout(() => setElapsed(attempt), delay * 1000)
    return () => window.clearTimeout(timer)
  }, [delay, attempt])
  const waiting = delay !== null && elapsed !== attempt
  return { waiting, hint: waiting ? waitHint(delay) : null }
}

const iconSx = { width: 56, height: 56, color: 'text.secondary', justifySelf: 'center' } as const
const GroupIcon = () => <Box component="svg" aria-hidden="true" focusable="false" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.75} sx={iconSx}>
  <circle cx="18" cy="17" r="6" /><path d="M6 37c0-7 5-11 12-11s12 4 12 11" /><circle cx="33" cy="20" r="4.5" /><path d="M28 30c1.5-1.5 3-2 5-2 5 0 9 3 9 9" />
</Box>
const AlertIcon = () => <Box component="svg" aria-hidden="true" focusable="false" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.75} sx={iconSx}>
  <circle cx="24" cy="24" r="18" /><path d="M24 14v13" /><circle cx="24" cy="33" r="1.5" fill="currentColor" />
</Box>
const MemberIcon = () => <Box component="svg" aria-hidden="true" focusable="false" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.75} sx={iconSx}>
  <circle cx="22" cy="15" r="6" /><path d="M9 35c0-7 6-11 13-11 3 0 5 .5 7 1.5" /><circle cx="34" cy="33" r="6" /><path d="m31 33 2 2 4-4" />
</Box>
const OfflineIcon = () => <Box component="svg" aria-hidden="true" focusable="false" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.75} sx={iconSx}>
  <path d="M8 19a23 23 0 0 1 32 0M14 25a15 15 0 0 1 20 0M19 31a7 7 0 0 1 10 0" /><circle cx="24" cy="37" r="1.5" fill="currentColor" /><path d="m10 10 28 28" />
</Box>

function Note({ children }: { children: ReactNode }) {
  return <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'background.raised', textAlign: 'center', display: 'grid', gap: 0.75 }}>{children}</Box>
}

function GroupCard({ name, compact = false }: { name: string; compact?: boolean }) {
  return <Card component="section" aria-label="Eingeladene Playgroup" sx={{ p: compact ? 2 : 3, textAlign: 'center', display: 'grid', gap: 0.5, border: '1px solid', borderColor: 'interaction.border' }}>
    {/* Server-provided name rendered as escaped text only. */}
    <Typography component={compact ? 'p' : 'h2'} variant={compact ? 'h6' : 'h5'} sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{name}</Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Playgroup</Typography>
    {!compact && <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>Nur der Playgroup-Name ist öffentlich</Typography>}
  </Card>
}

/**
 * Public invitation deep link (#200). Shows only the group name for a valid token,
 * reuses the existing auth screen for signed-out visitors and joins exclusively on
 * an explicit “Playgroup beitreten”. The component is keyed by session and path,
 * so an account change discards every invitation-specific state.
 */
export default function InvitationPage({ segment, user, checking, notice, onUnauthorized }: {
  /** Raw path segment from `/invite/:segment`. */
  segment: string
  user: CurrentUser | null
  /** The initial session check is still running; account actions wait for it. */
  checking: boolean
  notice: Notice
  onUnauthorized: () => void
}) {
  const navigate = useNavigate()
  const code = inviteCode(segment)
  const [preview, setPreview] = useState<Preview>(() => code ? { status: 'loading' } : { status: 'unavailable' })
  const [join, setJoin] = useState<Join>({ status: 'idle' })
  const joining = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const life = useRef<AbortController | null>(null)
  const previewRequest = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    life.current = controller
    return () => { controller.abort(); previewRequest.current?.abort() }
  }, [])

  const request = useCallback(() => {
    if (!code) return
    previewRequest.current?.abort()
    const controller = new AbortController()
    previewRequest.current = controller
    previewInvitation(code, controller.signal).then(({ groupName }) => {
      if (!controller.signal.aborted) setPreview({ status: 'ready', groupName })
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      setPreview(error instanceof ApiError && error.status === 400 ? { status: 'unavailable' } : { status: 'failed', retryAfter: retryDelay(error) })
    })
  }, [code])
  // The public GET is idempotent and never consumes the token, so a StrictMode re-run is harmless.
  useEffect(() => { request(); return () => previewRequest.current?.abort() }, [request])
  /** Explicit retry with the same original token. */
  const reload = () => { setPreview({ status: 'loading' }); request() }

  const shownState = join.status === 'member' ? 'member' : preview.status
  // Announce exceptional outcomes by moving focus to their heading; the ordinary preview keeps the reading order.
  useEffect(() => { if (shownState !== 'loading' && shownState !== 'ready') heading.current?.focus() }, [shownState])

  async function confirmJoin() {
    if (!code || !user || joining.current) return
    joining.current = true
    setJoin({ status: 'joining' })
    const signal = life.current?.signal
    try {
      const group = await joinGroup(code, signal)
      if (signal?.aborted) return
      const groupJoined = offerHandoff({ kind: 'joined', userId: user.id, groupId: group.id, memberIds: [] })
      // Replace the consumed invitation entry; Back must not offer it again.
      void navigate(groupUrl(group.id), { replace: true, state: { groupJoined } })
    } catch (error) {
      if (signal?.aborted) return
      if (error instanceof ApiError && error.status === 401) { onUnauthorized(); return }
      if (error instanceof ApiError && error.status === 409) setJoin({ status: 'member' })
      else if (error instanceof ApiError && error.status === 400) { setJoin({ status: 'idle' }); setPreview({ status: 'unavailable' }) }
      else setJoin({ status: 'failed', retryAfter: retryDelay(error) })
    } finally {
      joining.current = false
    }
  }

  const exit = user ? { to: '/playgroups', label: 'Zu meinen Playgroups' } : { to: '/', label: 'Zurück zur Startseite' }
  const previewRetry = useRetryWindow(preview.status === 'failed' ? preview.retryAfter : null, preview)
  const joinRetry = useRetryWindow(join.status === 'failed' ? join.retryAfter : null, join)
  const authenticate = (intent: InviteAuthIntent) => { void navigate({ pathname: `/invite/${segment}` }, { state: { [inviteAuthKey]: intent } }) }
  const title = (text: string) => <Typography component="h2" variant="h5" ref={heading} tabIndex={-1}
    sx={{ fontWeight: 700, textAlign: 'center', '&:focus': { outline: 'none' } }}>{text}</Typography>

  let body: ReactNode
  if (preview.status === 'loading') {
    body = <Box role="status" sx={{ display: 'grid', justifyItems: 'center', gap: 2, py: 6 }}>
      <CircularProgress color="secondary" aria-hidden="true" /><Typography>Einladung wird geprüft…</Typography>
    </Box>
  } else if (join.status === 'member' && preview.status === 'ready') {
    body = <>
      <MemberIcon />
      {title('Du bist bereits Mitglied')}
      <GroupCard name={preview.groupName} compact />
      <Typography sx={{ textAlign: 'center' }}>Du gehörst dieser Playgroup bereits an.</Typography>
      <Button component={Link} to="/playgroups" variant="outlined" color="secondary" fullWidth sx={{ minHeight: 52 }}>Zu meinen Playgroups</Button>
      <Note><Typography variant="body2" sx={{ color: 'text.secondary' }}>Die Einladung wurde nicht verwendet. Sie bleibt für andere gültig.</Typography></Note>
    </>
  } else if (preview.status === 'unavailable') {
    body = <>
      <AlertIcon />
      {title('Einladung nicht verfügbar')}
      <Typography sx={{ textAlign: 'center' }}>Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.</Typography>
      <Typography sx={{ textAlign: 'center', color: 'text.secondary' }}>Bitte lass dir einen neuen Einladungslink schicken.</Typography>
      <Button component={Link} to={exit.to} variant="outlined" color="secondary" fullWidth sx={{ minHeight: 52 }}>{exit.label}</Button>
    </>
  } else if (preview.status === 'failed') {
    body = <>
      <OfflineIcon />
      {title('Einladung konnte nicht geladen werden')}
      <Typography sx={{ textAlign: 'center' }}>Die Einladung ist momentan nicht erreichbar.</Typography>
      <Typography role="alert" sx={{ textAlign: 'center', color: 'text.secondary' }}>{previewRetry.hint ?? 'Bitte versuche es erneut.'}</Typography>
      <Button variant="contained" fullWidth disabled={previewRetry.waiting} onClick={reload} sx={{ minHeight: 52 }}>Erneut versuchen</Button>
      <Button component={Link} to={exit.to} variant="outlined" color="secondary" fullWidth sx={{ minHeight: 52 }}>{exit.label}</Button>
      <Note><Typography variant="body2" sx={{ color: 'text.secondary' }}>Derselbe Einladungslink bleibt erhalten.</Typography></Note>
    </>
  } else {
    body = <>
      <GroupIcon />
      <Typography sx={{ textAlign: 'center' }}>Du wurdest eingeladen, dieser Playgroup beizutreten:</Typography>
      <GroupCard name={preview.groupName} />
      {checking ? <Typography role="status" sx={{ textAlign: 'center' }}>Sitzung wird geprüft…</Typography> : user ? <>
        <Typography sx={{ textAlign: 'center', fontWeight: 600 }}>Du bist angemeldet.</Typography>
        <Button variant="contained" fullWidth disabled={join.status === 'joining' || joinRetry.waiting} onClick={() => { void confirmJoin() }}
          sx={{ minHeight: 52 }}>Playgroup beitreten</Button>
        {join.status === 'joining' && <Typography role="status" sx={{ textAlign: 'center' }}>Beitritt läuft…</Typography>}
        {join.status === 'failed' && <Typography role="alert" sx={{ textAlign: 'center', color: 'error.main' }}>
          Der Beitritt konnte nicht bestätigt werden. {joinRetry.hint ?? 'Bitte versuche es erneut.'}
        </Typography>}
        <Note>
          <Typography sx={{ color: 'text.secondary' }}>Erst nach deiner Bestätigung wirst du Mitglied.</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Das Öffnen dieser Seite verbraucht die Einladung nicht.</Typography>
        </Note>
      </> : <>
        <Typography sx={{ textAlign: 'center', fontWeight: 600 }}>Du bist nicht angemeldet.</Typography>
        <Button variant="contained" fullWidth onClick={() => authenticate('login')} sx={{ minHeight: 52 }}>Anmelden</Button>
        <Button variant="outlined" color="secondary" fullWidth onClick={() => authenticate('register')} sx={{ minHeight: 52 }}>Registrieren</Button>
        <Note>
          <Typography sx={{ color: 'text.secondary' }}>Danach kehrst du zu dieser Einladung zurück.</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nach der Registrierung ist eine Anmeldung erforderlich.</Typography>
        </Note>
      </>}
    </>
  }

  return <Box component="main" sx={{
    bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
    boxSizing: 'border-box', pl: 'max(16px, env(safe-area-inset-left, 0px))', pr: 'max(16px, env(safe-area-inset-right, 0px))',
    pt: 'max(8px, env(safe-area-inset-top, 0px))', pb: 'calc(24px + env(safe-area-inset-bottom, 0px))', overflowWrap: 'anywhere',
  }}>
    <Box sx={{ maxWidth: 480, mx: 'auto', display: 'grid', gap: 3 }}>
      <Box component="header" sx={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', py: 1 }}>
        <IconButton component={Link} to={exit.to} aria-label="Zurück" sx={{ width: 48, height: 48 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
        </IconButton>
        <Typography component="h1" sx={{ fontWeight: 700, textAlign: 'center', fontSize: '1.125rem' }}>Playgroup-Einladung</Typography>
      </Box>
      {notice && <Typography role={notice.kind === 'error' ? 'alert' : 'status'}
        sx={{ textAlign: 'center', color: notice.kind === 'error' ? 'error.main' : 'success.main' }}>{notice.message}</Typography>}
      <Box sx={{ display: 'grid', gap: 2.5 }}>{body}</Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        Eine Einladung · Eine Verwendung · 24 Stunden gültig
      </Typography>
    </Box>
  </Box>
}
