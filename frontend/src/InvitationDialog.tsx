import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Typography } from '@mui/material'
import { CloseIcon } from './MembersDirectory'
import { formatExpiry, invitationUrl, qrGeometry } from './invitationLink'

import type { InvitationState as State } from './useInvitationCreation'
type CopyState = 'idle' | 'copied' | 'manual'

/** Native share only where the browser offers it; never a dead placeholder (#200 §2.2). */
function canShare(url: string) {
  if (typeof navigator.share !== 'function') return false
  try {
    return typeof navigator.canShare === 'function' ? navigator.canShare({ url }) : true
  } catch {
    return false
  }
}

const iconSx = { flexShrink: 0, color: 'text.secondary' } as const
const CalendarIcon = () => <Box component="svg" aria-hidden="true" focusable="false" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} sx={iconSx}>
  <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
</Box>
const LockIcon = () => <Box component="svg" aria-hidden="true" focusable="false" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} sx={iconSx}>
  <rect x="4.5" y="11" width="15" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
</Box>
const QrIcon = () => <Box component="svg" aria-hidden="true" focusable="false" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} sx={{ flexShrink: 0 }}>
  <rect x="3.5" y="3.5" width="7" height="7" /><rect x="13.5" y="3.5" width="7" height="7" /><rect x="3.5" y="13.5" width="7" height="7" /><rect x="14" y="14" width="6" height="6" fill="currentColor" />
</Box>

/** Black-on-white code with a white quiet zone, rendered entirely in the browser. */
function InvitationQr({ url, id }: { url: string; id: string }) {
  const { size, path } = useMemo(() => qrGeometry(url), [url])
  return <Box id={id} sx={{ display: 'grid', justifyItems: 'center', gap: 1.5 }}>
    <Box sx={{ width: 'min(100%, 264px)', bgcolor: '#FFFFFF', borderRadius: 1, p: 1, boxSizing: 'border-box' }}>
      <svg role="img" aria-label="QR-Code mit dem Einladungslink" viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '1' }}>
        <rect width={size} height={size} fill="#FFFFFF" />
        <path d={path} fill="#000000" />
      </svg>
    </Box>
    <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>Scanne den Code, um die Einladung zu öffnen.</Typography>
  </Box>
}

/** #200 wireframes 01a/01b/04d: result, share/copy, collapsible QR, or create failure. */
export default function InvitationDialog({ state, busy, onRetry, onClose }: {
  state: State
  busy: boolean
  onRetry: () => void
  onClose: () => void
}) {
  const [qrOpen, setQrOpen] = useState(false)
  const [copy, setCopy] = useState<CopyState>('idle')
  const [shareFailed, setShareFailed] = useState(false)
  const manualField = useRef<HTMLInputElement>(null)
  const qrId = useId()

  useEffect(() => {
    if (copy === 'manual') { manualField.current?.focus(); manualField.current?.select() }
  }, [copy])

  const url = state.status === 'ready' ? invitationUrl(state.invitation.code) : null
  const shareable = url !== null && canShare(url)

  async function share() {
    if (!url) return
    setShareFailed(false)
    try {
      await navigator.share({ title: 'Playgroup-Einladung', url })
    } catch (error) {
      // Dismissing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareFailed(true)
    }
  }

  async function copyLink() {
    if (!url) return
    setCopy('idle')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopy('copied')
    } catch {
      setCopy('manual')
    }
  }

  const shareButton = shareable && <Button variant="contained" onClick={() => { void share() }} sx={{ minHeight: 52, flex: 1 }}>Link teilen</Button>
  const copyButton = <Button variant={shareable ? 'outlined' : 'contained'} color={shareable ? 'secondary' : 'primary'}
    onClick={() => { void copyLink() }} sx={{ minHeight: 52, flex: 1 }}>Link kopieren</Button>

  return <Dialog open onClose={onClose} aria-labelledby="invite-title" fullWidth maxWidth="xs" scroll="paper"
    slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } } }}>
    <DialogTitle id="invite-title" sx={{ pr: 7, fontWeight: 600 }}>Spieler einladen</DialogTitle>
    <IconButton aria-label="Schließen" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}><CloseIcon /></IconButton>
    <DialogContent sx={{ display: 'grid', gap: 2, pb: 3 }}>
      {state.status === 'creating' && <Typography role="status">Einladung wird erstellt…</Typography>}
      {state.status === 'failed' && <Stack sx={{ alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
        <Box component="svg" aria-hidden="true" focusable="false" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} sx={{ color: 'text.secondary' }}>
          <circle cx="12" cy="12" r="10" /><path d="m8.5 8.5 7 7m0-7-7 7" />
        </Box>
        <Typography role="alert" sx={{ fontWeight: 600 }}>Einladung konnte nicht erstellt werden</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Bitte versuche es erneut.</Typography>
        <Button variant="contained" fullWidth disabled={busy} onClick={onRetry} sx={{ minHeight: 48 }}>Erneut versuchen</Button>
        <Button variant="outlined" color="secondary" fullWidth onClick={onClose} sx={{ minHeight: 48 }}>Schließen</Button>
      </Stack>}
      {state.status === 'ready' && url && <>
        <Typography role="status">Einladung erstellt</Typography>
        <Stack sx={{ gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><CalendarIcon />
            <Typography sx={{ color: 'text.secondary' }}>Gültig bis <time dateTime={state.invitation.expiresAt}>{formatExpiry(state.invitation.expiresAt)}</time></Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><LockIcon />
            <Typography sx={{ color: 'text.secondary' }}>Einmalig verwendbar</Typography>
          </Box>
        </Stack>
        {qrOpen ? <>
          <InvitationQr url={url} id={qrId} />
          <Button variant="outlined" color="secondary" aria-expanded aria-controls={qrId} onClick={() => setQrOpen(false)} sx={{ minHeight: 48 }}>QR-Code ausblenden</Button>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', '& > *': { minWidth: 'min(100%, 120px)' } }}>{shareButton}{copyButton}</Box>
        </> : <>
          <Stack sx={{ gap: 1.5 }}>{shareButton}{copyButton}</Stack>
          <Divider />
          <Button color="secondary" aria-expanded={false} onClick={() => setQrOpen(true)}
            sx={{ justifyContent: 'flex-start', minHeight: 48, gap: 1.5, px: 1, fontWeight: 600 }}><QrIcon />QR-Code anzeigen</Button>
        </>}
        {copy === 'copied' && <Typography role="status" sx={{ color: 'success.main' }}>Link kopiert</Typography>}
        {shareFailed && <Typography role="alert" sx={{ color: 'error.main' }}>Teilen ist fehlgeschlagen. Kopiere den Link stattdessen.</Typography>}
        {copy === 'manual' && <Stack sx={{ gap: 1 }}>
          <Typography role="alert" id="invite-manual-copy" sx={{ color: 'error.main' }}>
            Der Link konnte nicht automatisch kopiert werden. Markiere ihn und kopiere ihn manuell.
          </Typography>
          <TextField inputRef={manualField} label="Einladungslink" value={url} fullWidth size="small"
            onFocus={event => event.target.select()}
            slotProps={{ htmlInput: { readOnly: true, 'aria-describedby': 'invite-manual-copy', spellCheck: false } }} />
        </Stack>}
      </>}
    </DialogContent>
  </Dialog>
}
