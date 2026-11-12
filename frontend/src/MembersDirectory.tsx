import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListSubheader, Menu, MenuItem,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import {
  ApiError, changeMemberRole, createQuickProfile, deleteQuickProfile, offerOwnership, removeMember, renameQuickProfile, withdrawOwnership,
  type CurrentUser, type GroupDetails, type GroupMember, type OwnershipTransfer,
} from './api'
import { groupUrl } from './groupNavigation'
import { displaySuffixes } from './groupSuffixes'
import { actionLabels, blank, directoryMemory, fallbackOverflowRows, filters, matchesFilter, memberActions, normalized, roleLabel,
  type DirectoryMemory, type MemberAction, type MemberFilter } from './membersModel'

/** Shared confirmation layout for the approved #198 dialogs: title with X, body, quiet note, Cancel + primary. */
export function ConfirmDialog({ open, title, children, note, confirm, busy, onConfirm, onClose, id, cancel }: {
  open: boolean; title: string; children: ReactNode; note?: string; confirm: string; busy: boolean
  onConfirm: () => void; onClose: () => void; id: string
  /** Replaces the default Abbrechen secondary button. */
  cancel?: { label: string; onClick: () => void }
}) {
  return <Dialog open={open} onClose={busy ? undefined : onClose} aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} fullWidth maxWidth="xs"
    slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)' } } }}>
    <DialogTitle id={`${id}-title`} sx={{ pr: 7, fontWeight: 600 }}>{title}</DialogTitle>
    <IconButton aria-label="Schließen" onClick={onClose} disabled={busy} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}>
      <CloseIcon />
    </IconButton>
    <DialogContent id={`${id}-body`} sx={{ display: 'grid', gap: 2 }}>
      {children}
      {note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{note}</Typography>}
    </DialogContent>
    <DialogActions sx={{ p: 3, pt: 1, gap: 1, '& .MuiButton-root': { flex: 1, minHeight: 48 } }}>
      <Button variant="outlined" color="secondary" onClick={cancel?.onClick ?? onClose} disabled={busy}>{cancel?.label ?? 'Abbrechen'}</Button>
      <Button variant="contained" onClick={onConfirm} disabled={busy}>{confirm}</Button>
    </DialogActions>
  </Dialog>
}

export function CloseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
}

type Pending = { action: Exclude<MemberAction, 'deck' | 'rename'>; member: GroupMember }
type Rename = { member: GroupMember; value: string; focused: boolean; error: string | null; created: boolean }

export default function MembersDirectory({ groupId, details, currentUser, transfer, refresh, onAccessError, onToast, onTransfer }: {
  groupId: string
  details: GroupDetails
  currentUser: CurrentUser
  /** The pending transfer visible to this viewer (OWNER requester or ADMIN target), if any. */
  transfer: OwnershipTransfer | null
  /** Authoritative re-read of group details and transfer status; null when it could not be confirmed. */
  refresh: () => Promise<GroupDetails | null>
  onAccessError: (error: unknown) => void
  onToast: (message: string) => void
  onTransfer: (transfer: OwnershipTransfer | null) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [restored] = useState(() => directoryMemory(location.state))
  const [filter, setFilter] = useState<MemberFilter>(restored?.filter ?? 'all')
  const [search, setSearch] = useState(restored?.search ?? '')
  const [overflowing, setOverflowing] = useState(false)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; member: GroupMember } | null>(null)
  const [confirm, setConfirm] = useState<Pending | null>(null)
  const [created, setCreated] = useState<GroupMember | null>(null)
  const [rename, setRename] = useState<Rename | null>(null)
  const [reveal, setReveal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const pending = useRef(false)
  const life = useRef<AbortController | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    life.current = controller
    return () => controller.abort()
  }, [])

  const suffixes = displaySuffixes(details.members.map(member => ({ id: member.userId, name: member.username })))
  const isOwnRow = (member: GroupMember) => member.userId.toLowerCase() === currentUser.id.toLowerCase()
  const ownerTransfer = transfer && details.role === 'OWNER' && transfer.requesterId.toLowerCase() === currentUser.id.toLowerCase() ? transfer : null
  const subset = details.members.filter(member => matchesFilter(member, filter))
  const term = normalized(search)
  const visible = term ? subset.filter(member => normalized(member.username).includes(term)) : subset
  const showSearch = overflowing || search !== ''

  // Search only appears when the unfiltered roster would overflow its bounded list area.
  const measure = useCallback(() => {
    const element = list.current
    if (!element) return
    const row = element.querySelector<HTMLElement>('li')
    const limit = parseFloat(getComputedStyle(element).maxHeight)
    const rowHeight = row?.offsetHeight ?? 0
    setOverflowing(rowHeight > 0 && Number.isFinite(limit)
      ? rowHeight * details.members.length > limit
      : details.members.length > fallbackOverflowRows)
  }, [details.members.length])
  useLayoutEffect(measure, [measure, visible.length])
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // Back from a member's decks restores filter, search and both scroll offsets after the group heading took focus.
  useEffect(() => {
    if (!restored) return
    const frame = requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = restored.listScroll
      window.scrollTo(0, restored.pageScroll)
    })
    return () => cancelAnimationFrame(frame)
  }, [restored])

  // A newly created profile is revealed in Alle with the search cleared.
  useEffect(() => {
    if (!reveal) return
    const row = list.current?.querySelector<HTMLElement>(`[data-member="${reveal}"]`)
    if (!row) return
    row.scrollIntoView?.({ block: 'nearest' })
    row.querySelector<HTMLElement>('[data-row-action]')?.focus({ preventScroll: true })
    setReveal(null)
  }, [reveal, details])

  function remember() {
    const memory: DirectoryMemory = { filter, search, listScroll: list.current?.scrollTop ?? 0, pageScroll: window.scrollY }
    const state = typeof location.state === 'object' && location.state !== null ? location.state as Record<string, unknown> : {}
    void navigate(location.pathname, { replace: true, state: { ...state, membersDirectory: memory } })
  }
  function openDecks(member: GroupMember, create = false) {
    remember()
    void navigate(`${groupUrl(groupId, 'members')}/${encodeURIComponent(member.userId)}/decks${create ? '/new' : ''}`,
      create ? { state: { fromMembers: true } } : undefined)
  }

  /** Writes only report success after confirmation; anything else is reconciled by an authoritative read. */
  async function reconcile(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) { onAccessError(error); return }
    const fresh = await refresh()
    if (life.current?.signal.aborted) return
    if (!fresh) { setFeedback(`${fallback} Der aktuelle Stand konnte nicht geladen werden. Lade die Gruppe neu, bevor du es erneut versuchst.`); return }
    setFeedback(error instanceof ApiError && error.status === 403 ? 'Diese Aktion ist für dich nicht mehr erlaubt. Die Mitgliederliste wurde aktualisiert.'
      : error instanceof ApiError && error.status === 404 ? 'Dieses Mitglied ist nicht mehr aktiv. Die Mitgliederliste wurde aktualisiert.'
        : error instanceof ApiError && error.status === 409 ? 'Die Playgroup wurde zwischenzeitlich geändert. Prüfe den aktualisierten Stand und versuche es bei Bedarf erneut.'
          : `${fallback} Prüfe den aktualisierten Stand, bevor du es erneut versuchst.`)
  }
  async function write<T>(operation: (signal: AbortSignal) => Promise<T>, fallback: string): Promise<T | undefined> {
    if (pending.current || !life.current) return undefined
    const signal = life.current.signal
    pending.current = true
    setBusy(true)
    setFeedback(null)
    try {
      return await operation(signal)
    } catch (error) {
      if (!signal.aborted) await reconcile(error, fallback)
      return undefined
    } finally {
      if (!signal.aborted) { pending.current = false; setBusy(false) }
    }
  }

  function choose(action: MemberAction, member: GroupMember) {
    setMenu(null)
    if (action === 'deck') openDecks(member, true)
    else if (action === 'rename') setRename({ member, value: '', focused: false, error: null, created: false })
    else setConfirm({ action, member })
  }

  async function confirmAction() {
    if (!confirm) return
    const { action, member } = confirm
    const fallbacks = {
      promote: 'Die Ernennung wurde nicht bestätigt.', demote: 'Die Zurückstufung wurde nicht bestätigt.',
      remove: 'Die Entfernung wurde nicht bestätigt.', delete: 'Die Löschung wurde nicht bestätigt.',
      transfer: 'Das Angebot wurde nicht bestätigt.',
    }
    const result = await write(async signal => {
      if (action === 'promote' || action === 'demote') await changeMemberRole(groupId, member.userId, action === 'promote' ? 'ADMIN' : 'MEMBER', signal)
      else if (action === 'remove') await removeMember(groupId, member.userId, signal)
      else if (action === 'delete') await deleteQuickProfile(groupId, member.userId, signal)
      else onTransfer(await offerOwnership(groupId, member.userId, signal))
      return true
    }, fallbacks[action])
    if (life.current?.signal.aborted) return
    setConfirm(null)
    if (!result) return
    onToast(action === 'promote' ? `${member.username} ist jetzt Admin.`
      : action === 'demote' ? `${member.username} ist jetzt Mitglied.`
        : action === 'remove' ? `${member.username} wurde aus der Playgroup entfernt.`
          : action === 'delete' ? `„${member.username}“ wurde gelöscht.`
            : `Angebot an ${member.username} gesendet.`)
    // Server-confirmed state decides the refreshed rows, order and permissions.
    if (!await refresh() && !life.current?.signal.aborted) setFeedback('Die Änderung wurde bestätigt, aber die Mitgliederliste konnte nicht aktualisiert werden. Lade die Gruppe neu.')
  }

  async function createProfile() {
    const profile = await write(signal => createQuickProfile(groupId, signal), 'Das Schnellprofil wurde nicht bestätigt.')
    if (!profile || life.current?.signal.aborted) return
    setCreated(profile)
    void refresh()
  }
  function finishCreated(profile: GroupMember) {
    setCreated(null)
    setRename(null)
    setFilter('all')
    setSearch('')
    setReveal(profile.userId)
  }

  async function saveRename() {
    if (!rename || blank(rename.value) || pending.current || !life.current) return
    const { member, value, created: fromCreate } = rename
    const signal = life.current.signal
    pending.current = true
    setBusy(true)
    setRename(current => current && { ...current, error: null })
    try {
      const renamed = await renameQuickProfile(groupId, member.userId, value, signal)
      if (signal.aborted) return
      onToast(`Schnellprofil umbenannt in „${renamed.username}“.`)
      if (fromCreate) finishCreated(renamed)
      else setRename(null)
      if (!await refresh() && !signal.aborted) setFeedback('Die Umbenennung wurde bestätigt, aber die Mitgliederliste konnte nicht aktualisiert werden. Lade die Gruppe neu.')
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof ApiError && error.status === 409 && error.code === 'QUICK_PROFILE_NAME_TAKEN') {
        setRename(current => current && { ...current, error: 'Diesen Namen verwendet bereits ein anderes Schnellprofil dieser Playgroup. Wähle einen anderen Namen.' })
      } else if (error instanceof ApiError && error.status === 400) {
        setRename(current => current && { ...current, error: error.code === 'NAME_TOO_LONG'
          ? 'Der Name ist zu lang. Verwende höchstens 20 Zeichen.'
          : 'Der Name wurde nicht akzeptiert. Erlaubt sind Buchstaben, Ziffern 0–9, Satzzeichen und einzelne Leerzeichen zwischen Wörtern, keine Emojis.' })
      } else if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        setRename(null)
        await reconcile(error, 'Die Umbenennung wurde nicht bestätigt.')
      } else {
        // Ambiguous outcome: keep the typed name and re-read before any retry.
        setRename(current => current && { ...current, error: 'Die Umbenennung konnte nicht bestätigt werden. Prüfe den Namen in der Mitgliederliste und versuche es erneut.' })
        void refresh()
      }
    } finally {
      if (!signal.aborted) { pending.current = false; setBusy(false) }
    }
  }
  function closeRename() {
    if (busy || !rename) return
    // Cancelling never deletes a just-created profile; it keeps its generated name.
    if (rename.created) finishCreated(rename.member)
    else setRename(null)
  }

  async function withdraw() {
    if (!ownerTransfer) return
    const done = await write(async signal => { await withdrawOwnership(groupId, ownerTransfer.id, signal); return true },
      'Die Anfrage konnte nicht zurückgezogen werden.')
    if (!done || life.current?.signal.aborted) return
    onTransfer(null)
    onToast('Dein Angebot zur Eigentümerübertragung wurde zurückgezogen.')
    void refresh()
  }

  const menuActions = menu ? memberActions(details.role, currentUser.id, menu.member, Boolean(transfer)) : []
  const confirmCopy = confirm && dialogCopy(confirm)

  return <Stack component="section" aria-labelledby="members-heading" sx={{ gap: 2, minWidth: 0 }}>
    <Typography component="h3" variant="h5" id="members-heading" sx={{ fontWeight: 600 }}>Mitglieder</Typography>
    <Box component="span" id="member-row-hint" sx={{ display: 'none' }}>Öffnet die Decks dieses Mitglieds</Box>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'stretch' }}>
      <Button variant="contained" onClick={() => onToast('Das Einladen von Spielern ist noch nicht verfügbar.')}
        sx={{ flex: '1.5 1 0', minWidth: 0, minHeight: 52, px: 1, overflowWrap: 'normal', fontSize: { xs: '0.9375rem', sm: '1.0625rem' } }}>
        <Box component="span" aria-hidden="true" sx={{ mr: 1 }}>+</Box>Spieler einladen
      </Button>
      <Button variant="text" color="secondary" disabled={busy} onClick={() => { void createProfile() }}
        sx={{ flex: '1 1 0', minWidth: 0, minHeight: 52, px: 1, overflowWrap: 'normal', fontSize: { xs: '0.75rem', sm: '0.8125rem' }, lineHeight: 1.25, bgcolor: 'background.raised' }}>
        <Box component="span" aria-hidden="true" sx={{ mr: 0.5 }}>+</Box>Schnellprofil erstellen
      </Button>
    </Box>
    {ownerTransfer && <Box component="section" aria-labelledby="pending-transfer-title" role="status"
      sx={{ p: 2, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1, bgcolor: 'background.raised', display: 'grid', gap: 0.5 }}>
      <Typography id="pending-transfer-title" sx={{ fontWeight: 600 }}>Eigentümerübertragung angefragt</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>Angebot an {ownerTransfer.targetUsername} · Antwort ausstehend</Typography>
      <Button color="secondary" disabled={busy} onClick={() => { void withdraw() }}
        sx={{ justifySelf: 'start', minHeight: 44, px: 0, textDecoration: 'underline', textUnderlineOffset: '0.25em' }}>Anfrage zurückziehen</Button>
    </Box>}
    <ToggleButtonGroup exclusive fullWidth size="small" value={filter} aria-label="Mitglieder filtern"
      onChange={(_event, value: MemberFilter | null) => { if (value) setFilter(value) }}
      sx={{ '& .MuiToggleButton-root': { minHeight: 48, px: 0.5, textTransform: 'none', lineHeight: 1.2, fontSize: { xs: '0.75rem', sm: '0.875rem' } } }}>
      {filters.map(option => <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>)}
    </ToggleButtonGroup>
    {showSearch && <TextField inputRef={searchInput} type="search" value={search} onChange={event => setSearch(event.target.value)}
      placeholder="Mitglieder suchen …" fullWidth size="small"
      slotProps={{ htmlInput: { 'aria-label': 'Mitglieder suchen' } }}
      sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.default', '& input': { minHeight: 32 } }} />}
    {feedback && <Alert severity="error" role="alert" onClose={() => setFeedback(null)}
      sx={{ '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}>{feedback}</Alert>}
    {visible.length === 0 ? <EmptyState term={search} filter={filter}
      onReset={() => { setSearch(''); searchInput.current?.focus() }} onAll={() => setFilter('all')} />
      : <Box component="ul" ref={list} aria-label="Aktive Mitglieder"
        sx={{ listStyle: 'none', p: 0, m: 0, maxHeight: 'max(320px, calc(100dvh - 300px))', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {visible.map(member => {
          const actions = memberActions(details.role, currentUser.id, member, Boolean(transfer))
          const suffix = suffixes.get(member.userId)
          return <Box component="li" key={member.userId} data-member={member.userId}
            sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1, minHeight: 72, py: 1, pl: 1, pr: 0.5,
              borderBottom: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'interaction.hover' } }}>
            <ButtonBase data-row-action onClick={() => openDecks(member)} aria-describedby="member-row-hint"
              sx={{ position: 'static', flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', display: 'block',
                '&::after': { content: '""', position: 'absolute', inset: 0 },
                '&.Mui-focusVisible::after, &:focus-visible::after': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }}>
              <Typography component="span" sx={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
                fontSize: '1.0625rem', overflowWrap: 'anywhere' }}>
                {member.username}
                {suffix && <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}> · ID: {suffix}</Typography>}
                {isOwnRow(member) && <Typography component="span" sx={{ fontSize: 'inherit' }}> (Du)</Typography>}
              </Typography>
              <Typography component="span" variant="body2" sx={{ display: 'block', color: 'text.secondary' }}>{roleLabel(member)}</Typography>
            </ButtonBase>
            {actions.length > 0 && <IconButton aria-label={`Aktionen für ${member.username}${suffix ? ` (ID: ${suffix})` : ''}`} aria-haspopup="menu"
              aria-expanded={menu?.member.userId === member.userId} disabled={busy}
              onClick={event => { event.stopPropagation(); setMenu({ anchor: event.currentTarget, member }) }}
              sx={{ position: 'relative', zIndex: 1, width: 48, height: 48, borderRadius: 1, bgcolor: 'background.raised' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </IconButton>}
            <Box component="span" aria-hidden="true" sx={{ flexShrink: 0, width: 24, textAlign: 'center', fontSize: 28, lineHeight: 1, color: 'text.secondary', pointerEvents: 'none' }}>›</Box>
          </Box>
        })}
      </Box>}
    <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}
      slotProps={{ list: { 'aria-label': menu ? `Aktionen für ${menu.member.username}` : undefined } }}>
      {menu && <ListSubheader sx={{ lineHeight: 2.5, fontWeight: 600 }}>{menu.member.username} · {roleLabel(menu.member)}</ListSubheader>}
      {menuActions.map(action => <MenuItem key={action} sx={{ minHeight: 48 }} onClick={() => menu && choose(action, menu.member)}>{actionLabels[action]}</MenuItem>)}
    </Menu>
    {confirmCopy && <ConfirmDialog open id="member-confirm" title={confirmCopy.title} note={confirmCopy.note} confirm={confirmCopy.confirm} busy={busy}
      onClose={() => setConfirm(null)} onConfirm={() => { void confirmAction() }}>
      {confirmCopy.body.map(text => <Typography key={text}>{text}</Typography>)}
    </ConfirmDialog>}
    <ConfirmDialog open={Boolean(created) && !rename} id="profile-created" title="Schnellprofil erstellt" confirm="Übernehmen" busy={busy}
      note="Das Profil wurde bereits gespeichert."
      onClose={() => created && finishCreated(created)} onConfirm={() => created && finishCreated(created)}
      cancel={{ label: 'Namen ändern', onClick: () => created && setRename({ member: created, value: '', focused: false, error: null, created: true }) }}>
      <Typography>Dein neues Schnellprofil heißt:</Typography>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>„{created?.username}“</Typography>
      <Typography>Möchtest du den Namen ändern oder direkt übernehmen?</Typography>
    </ConfirmDialog>
    <Dialog open={Boolean(rename)} onClose={closeRename} aria-labelledby="rename-title" fullWidth maxWidth="xs"
      slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)' } } }}>
      <Box component="form" noValidate aria-busy={busy} onSubmit={event => { event.preventDefault(); void saveRename() }}>
        <DialogTitle id="rename-title" sx={{ pr: 7, fontWeight: 600 }}>Schnellprofil umbenennen</DialogTitle>
        <IconButton aria-label="Schließen" onClick={closeRename} disabled={busy} sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48 }}><CloseIcon /></IconButton>
        <DialogContent sx={{ pt: 1 }}>
          <Typography component="label" htmlFor="rename-profile-name" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>Profilname</Typography>
          {/* The old name is only a gray hint that disappears on focus; the new name must be typed explicitly. */}
          <TextField id="rename-profile-name" fullWidth autoComplete="off" disabled={busy} value={rename?.value ?? ''}
            placeholder={rename && !rename.focused ? rename.member.username : undefined}
            onFocus={() => setRename(current => current && { ...current, focused: true })}
            onBlur={() => setRename(current => current && { ...current, focused: false })}
            onChange={event => setRename(current => current && { ...current, value: event.target.value, error: null })}
            error={Boolean(rename?.error)}
            helperText={rename?.error ?? 'Gib einen neuen Namen mit höchstens 20 Zeichen ein.'}
            slotProps={{ formHelperText: { role: rename?.error ? 'alert' : undefined } }} />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1, gap: 1, '& .MuiButton-root': { flex: 1, minHeight: 48 } }}>
          <Button variant="outlined" color="secondary" onClick={closeRename} disabled={busy}>Abbrechen</Button>
          <Button type="submit" variant="contained" disabled={busy || !rename || blank(rename.value)}>Speichern</Button>
        </DialogActions>
      </Box>
    </Dialog>
  </Stack>
}

function dialogCopy({ action, member }: Pending): { title: string; body: string[]; note?: string; confirm: string } {
  const name = member.username
  switch (action) {
    case 'promote': return { title: 'Zum Admin ernennen?', confirm: 'Ernennung bestätigen', body: [
      `Möchtest du ${name} zum Admin ernennen?`,
      `${name} erhält zusätzliche Verwaltungsrechte, etwa zum Entfernen gewöhnlicher Mitglieder.`] }
    case 'demote': return { title: 'Zum Mitglied zurückstufen?', confirm: 'Zurückstufung bestätigen', body: [
      `Möchtest du ${name} zum Mitglied zurückstufen?`,
      `${name} verliert die Admin-Rechte und kann keine Mitglieder mehr verwalten.`] }
    case 'remove': return { title: 'Mitglied entfernen?', confirm: 'Mitglied entfernen', body: [
      `Möchtest du ${name} wirklich aus dieser Playgroup entfernen?`,
      `${name} verliert sofort den Zugriff. Bereits aufgezeichnete Spiele und Statistiken bleiben erhalten.`],
    note: 'Ein späterer Beitritt ist mit einer neuen, gültigen Einladung möglich.' }
    case 'delete': return { title: 'Schnellprofil löschen?', confirm: 'Schnellprofil löschen', body: [
      `Möchtest du „${name}“ wirklich löschen?`,
      'Das Profil wird entfernt und seine Decks stehen nicht mehr zur Auswahl. Bereits aufgezeichnete Spiele und Statistiken bleiben anonymisiert erhalten.'],
    note: 'Diese Aktion kann nicht rückgängig gemacht werden.' }
    case 'transfer': return { title: 'Eigentümerschaft anbieten?', confirm: 'Angebot senden', body: [
      `Möchtest du ${name} anbieten, die Eigentümerschaft dieser Playgroup zu übernehmen?`,
      `${name} muss das Angebot ausdrücklich annehmen. Bis dahin bleibst du Owner.`],
    note: 'Solange das Angebot aussteht, kannst du es zurückziehen.' }
  }
}

function EmptyState({ term, filter, onReset, onAll }: { term: string; filter: MemberFilter; onReset: () => void; onAll: () => void }) {
  // Without a search term only Nur Schnellprofile can be empty: every active group has its registered OWNER.
  const searching = term !== ''
  if (!searching && filter !== 'quick') return null
  return <Stack role="status" sx={{ alignItems: 'center', textAlign: 'center', gap: 1.5, py: 6, px: 2 }}>
    <Typography component="p" variant="h6" sx={{ fontWeight: 600 }}>{searching ? 'Keine Mitglieder gefunden' : 'Keine Schnellprofile vorhanden'}</Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
      {searching ? `Für „${term}“ gibt es keine Treffer.` : 'In dieser Playgroup wurden noch keine Schnellprofile erstellt.'}
    </Typography>
    <Button variant="outlined" color="secondary" onClick={searching ? onReset : onAll} sx={{ mt: 1, minHeight: 48, px: 4 }}>
      {searching ? 'Suche zurücksetzen' : 'Alle Mitglieder anzeigen'}
    </Button>
  </Stack>
}
