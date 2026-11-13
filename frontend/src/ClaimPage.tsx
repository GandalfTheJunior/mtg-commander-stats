import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Box, Button, Card, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material'
import { ApiError, acceptProfileInvitation, previewProfileInvitation, profileClaimSameGame, type CurrentUser } from './api'
import { inviteAuthKey, inviteCode, type InviteAuthIntent } from './invitationLink'
import { CloseIcon } from './MembersDirectory'
import { retryDelay, useRetryWindow } from './retryWindow'
import type { Notice } from './App'

/** Exact PO-approved success copy shown on the fresh Playgroups collection (#247 §4). */
export const claimSuccessMessage = 'Schnellprofil erfolgreich übernommen.'

type Preview =
  | { status: 'loading' }
  | { status: 'ready'; groupName: string; profileName: string }
  | { status: 'unavailable' }
  | { status: 'failed' }
  | { status: 'limited'; retryAfter: number }
/**
 * `rejected`: a definite non-conflict refusal (e.g. CSRF 403); nothing changed. `uncertain`: the accept POST was
 * sent but its outcome is unknown; only a read-only preview GET may follow, never an automatic POST.
 */
type Accept = 'idle' | 'confirming' | 'accepting' | 'conflict' | 'rejected' | 'uncertain'

const overlineSx = { fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' } as const
function Overline({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'error' }) {
  return <Typography variant="caption" component="p" sx={{ ...overlineSx, color: tone === 'error' ? 'error.main' : 'text.secondary' }}>{children}</Typography>
}
const nameSx = { fontWeight: 700, overflowWrap: 'anywhere' } as const
const buttonSx = { minHeight: 52 } as const
const sectionSx = { display: 'grid', gap: 0.75, pb: 2, borderBottom: '1px solid', borderColor: 'divider' } as const

function Hint({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gap: 0.5, px: 0.5 }}>
    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>Hinweis</Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{children}</Typography>
  </Box>
}
function Account({ name }: { name: string }) {
  return <Box sx={{ px: 2, py: 1.5, borderRadius: 1, bgcolor: 'background.raised', border: '1px solid', borderColor: 'divider' }}>
    {/* The current confirmed account, rendered as escaped text. */}
    <Typography sx={{ ...nameSx, fontSize: '1.125rem' }}>{name}</Typography>
  </Box>
}

/**
 * Public quick-profile claim deep link (#247). Shows only `groupName` and `profileName` for a usable token, reuses
 * the existing auth screen for signed-out visitors and merges exclusively after the separate final confirmation.
 * App keys this page by session epoch and path: login, logout or an account switch discards every claim state
 * (names, open confirmation, in-flight requests), so a confirmation never carries over to another account.
 */
export default function ClaimPage({ segment, user, checking, notice, onUnauthorized, onClaimed, onSwitchAccount }: {
  /** Raw path segment from `/claim/:segment`. */
  segment: string
  user: CurrentUser | null
  /** The initial session check is still running; account actions wait for it. */
  checking: boolean
  notice: Notice
  onUnauthorized: () => void
  /** Only after an acknowledged 204: show the success notice on a fresh `/playgroups`. */
  onClaimed: () => void
  /** Explicit logout that returns to this same claim link for another sign-in. */
  onSwitchAccount: () => void
}) {
  const navigate = useNavigate()
  const code = inviteCode(segment)
  const [preview, setPreview] = useState<Preview>(() => code ? { status: 'loading' } : { status: 'unavailable' })
  const [accept, setAccept] = useState<Accept>('idle')
  // After an unconfirmed accept, a later unusable link must not be read as either success or failure.
  const [outcomeUnknown, setOutcomeUnknown] = useState(false)
  const accepting = useRef(false)
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
    previewProfileInvitation(code, controller.signal).then(({ groupName, profileName }) => {
      if (controller.signal.aborted) return
      setPreview({ status: 'ready', groupName, profileName })
      setOutcomeUnknown(false)
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      const wait = retryDelay(error)
      setPreview(error instanceof ApiError && error.status === 400 ? { status: 'unavailable' }
        : wait !== null ? { status: 'limited', retryAfter: wait } : { status: 'failed' })
    })
  }, [code])
  // The public GET is idempotent and never consumes the token, so a StrictMode re-run is harmless.
  useEffect(() => { request(); return () => previewRequest.current?.abort() }, [request])
  /** Explicit, read-only re-check with the same token. Any later accept needs a new confirmation. */
  const recheck = () => { setAccept('idle'); setPreview({ status: 'loading' }); request() }

  const shown = preview.status === 'ready' && (accept === 'conflict' || accept === 'uncertain') ? accept : preview.status
  // Announce exceptional outcomes by moving focus to their heading; the ordinary preview keeps the reading order.
  useEffect(() => { if (shown !== 'loading' && shown !== 'ready') heading.current?.focus() }, [shown])

  async function confirmClaim() {
    if (!code || !user || accepting.current) return
    accepting.current = true
    setAccept('accepting')
    const signal = life.current?.signal
    try {
      await acceptProfileInvitation(code, signal)
      // Route or identity changed meanwhile: this page is retired and must not announce anything.
      if (signal?.aborted) return
      onClaimed()
    } catch (error) {
      if (signal?.aborted) return
      if (!(error instanceof ApiError)) { setAccept('uncertain'); setOutcomeUnknown(true); return }
      if (error.status === 401) { onUnauthorized(); return }
      const wait = retryDelay(error)
      if (error.status === 400) { setAccept('idle'); setPreview({ status: 'unavailable' }) }
      else if (wait !== null) { setAccept('idle'); setPreview({ status: 'limited', retryAfter: wait }) }
      else if (error.status === 409 && error.code === profileClaimSameGame) setAccept('conflict')
      else if (error.status >= 500) { setAccept('uncertain'); setOutcomeUnknown(true) }
      else setAccept('rejected')
    } finally {
      accepting.current = false
    }
  }

  const home = user ? '/dashboard' : '/'
  const retry = useRetryWindow(preview.status === 'limited' ? preview.retryAfter : null, preview)
  const authenticate = (intent: InviteAuthIntent) => { void navigate({ pathname: `/claim/${segment}` }, { state: { [inviteAuthKey]: intent } }) }
  const title = (text: string, tone: 'neutral' | 'error' = 'neutral') => <Typography component="h2" ref={heading} tabIndex={-1}
    sx={{ fontWeight: 700, fontSize: '1.25rem', color: tone === 'error' ? 'error.main' : 'text.primary', '&:focus': { outline: 'none' } }}>{text}</Typography>
  const exitButton = (to: string, label: string) => <Button component={Link} to={to} variant="outlined" color="secondary" fullWidth sx={buttonSx}>{label}</Button>

  let card: ReactNode
  let after: ReactNode = null
  if (preview.status === 'loading') {
    card = <Box role="status" sx={{ display: 'grid', justifyItems: 'center', gap: 2, py: 4 }}>
      <CircularProgress color="secondary" aria-hidden="true" /><Typography>Einladung wird geprüft…</Typography>
    </Box>
  } else if (preview.status === 'unavailable') {
    card = <>
      <Box sx={sectionSx}><Overline>Einladung</Overline>{title('Einladung nicht verfügbar', 'error')}</Box>
      <Typography>Dieser Link ist ungültig, abgelaufen oder kann nicht mehr verwendet werden.</Typography>
      {outcomeUnknown ? <Typography role="status" sx={{ color: 'text.secondary' }}>
        Ob deine letzte Übernahme ausgeführt wurde, lässt sich hier nicht feststellen. Prüfe deine Playgroups.
      </Typography> : <Typography sx={{ color: 'text.secondary' }}>
        Wenn du das Schnellprofil noch übernehmen möchtest, bitte einen Owner oder Admin um einen neuen Link.
      </Typography>}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Aus diesem Link werden keine Informationen zur Playgroup angezeigt.</Typography>
      {outcomeUnknown && user ? exitButton('/playgroups', 'Zur Playgroups-Übersicht') : exitButton(home, 'Zur Startseite')}
    </>
  } else if (preview.status === 'failed') {
    card = <>
      <Box sx={sectionSx}><Overline>Vorschau nicht geladen</Overline>{title('Einladung konnte nicht geladen werden')}</Box>
      <Typography role="alert">Die Einladung konnte gerade nicht geprüft werden. Das kann an der Verbindung oder einem vorübergehenden Serverproblem liegen.</Typography>
      <Typography sx={{ color: 'text.secondary' }}>Du kannst denselben Link erneut prüfen. Die Vorschau verbraucht ihn nicht.</Typography>
      <Button variant="contained" fullWidth onClick={recheck} sx={buttonSx}>Erneut versuchen</Button>
      {exitButton(home, 'Zur Startseite')}
    </>
  } else if (preview.status === 'limited') {
    card = <>
      <Box sx={sectionSx}><Overline tone="error">Zu viele Anfragen</Overline>{title('Bitte später erneut versuchen')}</Box>
      <Typography role="alert">Zurzeit gehen zu viele Anfragen über diese Verbindung ein. Bitte warte, bevor du es erneut versuchst.</Typography>
      <Typography sx={{ color: 'text.secondary' }}>{retry.hint ?? 'Die Wartezeit ist abgelaufen.'}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Der Link bleibt in der Adresse erhalten. Er wird nur auf Wunsch neu geprüft.</Typography>
      <Button variant="contained" fullWidth disabled={retry.waiting} onClick={recheck} sx={buttonSx}>Erneut versuchen</Button>
      {exitButton(home, 'Zur Startseite')}
    </>
    if (retry.waiting) after = <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5 }}>Wiederholen erst nach Ablauf der Wartezeit</Typography>
  } else if (accept === 'uncertain') {
    card = <>
      <Box sx={sectionSx}><Overline tone="error">Status unklar</Overline>{title('Übernahme konnte nicht bestätigt werden')}</Box>
      <Typography role="alert">Die Verbindung wurde während der Übernahme unterbrochen. Wir können nicht feststellen, ob das Schnellprofil bereits übernommen wurde.</Typography>
      <Typography sx={{ color: 'text.secondary' }}>Bitte prüfe die Einladung erneut. Bei einem ungültigen Link wird kein Erfolg behauptet.</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Es erfolgt kein automatischer erneuter Übernahmeversuch.</Typography>
      <Button variant="contained" fullWidth onClick={recheck} sx={buttonSx}>Einladung erneut prüfen</Button>
      {exitButton('/playgroups', 'Zur Playgroups-Übersicht')}
    </>
  } else if (accept === 'conflict') {
    card = <>
      <Box sx={sectionSx}>
        <Overline>Einladung</Overline>
        <Typography component="p" sx={{ ...nameSx, fontSize: '1.25rem' }}>{preview.groupName}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>Schnellprofil: {preview.profileName}</Typography>
      </Box>
      {title('Übernahme noch nicht möglich', 'error')}
      <Typography role="alert">Dein Konto und dieses Schnellprofil sind bereits im selben Spiel eingetragen.</Typography>
      <Typography>Bitte wende dich an einen Owner oder Admin, damit die Spielaufzeichnung korrigiert wird.</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Es wurden keine Daten verändert. Der Link bleibt bis zum Ablauf gültig.</Typography>
      <Button variant="contained" fullWidth onClick={recheck} sx={buttonSx}>Erneut prüfen</Button>
      {exitButton('/playgroups', 'Zur Playgroups-Übersicht')}
    </>
  } else {
    card = <>
      <Box sx={sectionSx}>
        <Overline>Einladung</Overline>
        {/* Server-provided names rendered as escaped text only; nothing else about the group is shown. */}
        <Typography component="h2" sx={{ ...nameSx, fontSize: '1.375rem' }}>{preview.groupName}</Typography>
      </Box>
      <Box sx={sectionSx}>
        <Overline>Schnellprofil</Overline>
        <Typography component="p" sx={{ ...nameSx, fontSize: '1.375rem' }}>{preview.profileName}</Typography>
      </Box>
      {checking ? <Typography role="status">Sitzung wird geprüft…</Typography> : user ? <>
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Angemeldet als</Typography>
          <Account name={user.username} />
        </Box>
        <Typography>Du kannst dieses Schnellprofil in dein aktuell angemeldetes Konto übernehmen.</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>Noch keine Übernahme erfolgt.</Typography>
        {accept === 'rejected' && <Typography role="alert" sx={{ color: 'error.main' }}>
          Die Übernahme wurde nicht ausgeführt. Es wurde nichts verändert. Du kannst es erneut versuchen.
        </Typography>}
        <Button variant="contained" fullWidth disabled={accept === 'accepting'} onClick={() => setAccept('confirming')} sx={buttonSx}>Profil übernehmen</Button>
        {/* Leaving sends nothing: the link stays usable until it expires or is revoked. */}
        <Button component={Link} to="/playgroups" variant="outlined" color="secondary" fullWidth sx={buttonSx}>Nicht übernehmen</Button>
      </> : <>
        <Typography>Melde dich an oder erstelle ein Konto, um dieses Schnellprofil zu übernehmen.</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Die Einladung wird dabei nicht automatisch angenommen.</Typography>
        <Button variant="contained" fullWidth onClick={() => authenticate('login')} sx={buttonSx}>Anmelden</Button>
        <Button variant="outlined" color="secondary" fullWidth onClick={() => authenticate('register')} sx={buttonSx}>Registrieren</Button>
      </>}
    </>
    after = <>
      <Hint>{user ? 'Die Übernahme erfolgt erst nach einer separaten, ausdrücklichen Bestätigung.' : 'Dieser Einladungslink ist nur einmal verwendbar.'}</Hint>
      {user && !checking && <Button color="secondary" disabled={accept === 'accepting'} onClick={onSwitchAccount}
        sx={{ justifySelf: 'start', minHeight: 48, px: 0.5, fontWeight: 400 }}>Anderes Konto verwenden</Button>}
    </>
  }

  const ready = preview.status === 'ready' ? preview : null
  return <Box component="main" sx={{
    // Override the legacy global main/header rules in index.css, like the auth screen does.
    m: 0, width: '100%', maxWidth: 'none', '& header': { m: 0 },
    bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
    boxSizing: 'border-box', pl: 'max(16px, env(safe-area-inset-left, 0px))', pr: 'max(16px, env(safe-area-inset-right, 0px))',
    pt: 'max(24px, env(safe-area-inset-top, 0px))', pb: 'calc(24px + env(safe-area-inset-bottom, 0px))', overflowWrap: 'anywhere',
  }}>
    <Box sx={{ maxWidth: 480, mx: 'auto', display: 'grid', gap: 3 }}>
      <Box component="header" sx={{ display: 'grid', gap: 1 }}>
        {/* Sized so the long German word fits on one line at 320px instead of breaking mid-word. */}
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', sm: '2.125rem' }, overflowWrap: 'normal' }}>Profilübernahme</Typography>
        <Typography sx={{ color: 'text.secondary' }}>Einladung zu einer Playgroup</Typography>
      </Box>
      {notice && <Typography role={notice.kind === 'error' ? 'alert' : 'status'}
        sx={{ color: notice.kind === 'error' ? 'error.main' : 'success.main' }}>{notice.message}</Typography>}
      <Card component="section" aria-label="Profilübernahme-Einladung" sx={{ p: { xs: 2.5, sm: 3 }, display: 'grid', gap: 2, border: '1px solid', borderColor: 'interaction.border' }}>
        {card}
      </Card>
      {after}
      <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        Öffentliche Einladungsansicht
      </Typography>
    </Box>
    {ready && user && <ClaimConfirmation open={accept === 'confirming' || accept === 'accepting'} busy={accept === 'accepting'}
      groupName={ready.groupName} profileName={ready.profileName} account={user.username}
      onCancel={() => setAccept('idle')} onConfirm={() => { void confirmClaim() }} />}
  </Box>
}

/** #247 wireframe 05: the only control that sends the accept POST is “Jetzt übernehmen”. */
function ClaimConfirmation({ open, busy, groupName, profileName, account, onCancel, onConfirm }: {
  open: boolean; busy: boolean; groupName: string; profileName: string; account: string; onCancel: () => void; onConfirm: () => void
}) {
  return <Dialog open={open} onClose={busy ? undefined : onCancel} aria-labelledby="claim-final-title" aria-describedby="claim-final-body" fullWidth maxWidth="xs" scroll="paper"
    slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } } }}>
    <DialogTitle id="claim-final-title" sx={{ pr: 7, fontWeight: 700 }}>Schnellprofil übernehmen?</DialogTitle>
    <IconButton aria-label="Schließen" onClick={onCancel} disabled={busy} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}><CloseIcon /></IconButton>
    <DialogContent sx={{ display: 'grid', gap: 2, pb: 3 }}>
      <Box sx={{ ...sectionSx, pt: 1.5, borderTop: '1px solid', borderTopColor: 'divider' }}>
        <Overline>Schnellprofil</Overline>
        <Typography sx={{ ...nameSx, fontSize: '1.25rem' }}>{profileName}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>Playgroup: {groupName}</Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Overline>Angemeldetes Konto</Overline>
        <Account name={account} />
      </Box>
      <Box id="claim-final-body" sx={{ display: 'grid', gap: 2 }}>
        <Typography>Vorhandene Decks und Spielteilnahmen werden deinem Konto zugeordnet. Die Gruppenstatistiken werden entsprechend zusammengeführt.</Typography>
        <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'background.raised', border: '1px solid', borderColor: 'divider', display: 'grid', gap: 0.75 }}>
          <Overline>Wichtig</Overline>
          <Typography>Das Schnellprofil wird dauerhaft entfernt. Die Übernahme kann nicht rückgängig gemacht werden.</Typography>
        </Box>
      </Box>
      <Button variant="contained" fullWidth disabled={busy} onClick={onConfirm} sx={buttonSx}>{busy ? 'Übernahme läuft…' : 'Jetzt übernehmen'}</Button>
      <Button variant="outlined" color="secondary" fullWidth disabled={busy} onClick={onCancel} sx={buttonSx}>Abbrechen</Button>
      {busy && <Typography role="status" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Übernahme läuft…</Typography>}
    </DialogContent>
  </Dialog>
}
