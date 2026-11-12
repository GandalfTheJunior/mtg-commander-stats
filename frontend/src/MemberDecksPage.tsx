import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Alert, Box, Button, Card, Divider, IconButton, InputAdornment, Skeleton, Stack, TextField, Typography } from '@mui/material'
import { ApiError, getGroup, memberDecks, type GroupDetails, type GroupMember, type MemberDeck } from './api'
import type { Notice } from './App'
import { groupUnavailable, groupUrl } from './groupNavigation'
import { displaySuffixes } from './groupSuffixes'
import SavedDeckCard from './SavedDeckCard'

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
/** Cards above which the search appears when layout cannot be measured (e.g. without CSS layout). */
const fallbackOverflowDecks = 6
const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const

/** German possessive heading, e.g. "Frodos Decks" or "Klaus’ Decks". */
function decksHeading(name: string) {
  return /[sßxz]$/i.test(name) ? `${name}’ Decks` : `${name}s Decks`
}
const searchKey = (value: string) => value.normalize('NFC').toLocaleLowerCase('de').trim()
const matches = (deck: MemberDeck, needle: string) => !needle || [deck.name, ...deck.commanders.map(card => card.name)]
  .some(text => searchKey(text).includes(needle))

type View =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable'; group: GroupDetails | null }
  | { status: 'ready'; group: GroupDetails; member: GroupMember; decks: MemberDeck[] }
  /** Access to the group was lost: everything protected is retired before leaving. */
  | { status: 'lost' }

type Outcome = { ok: true; decks: MemberDeck[] } | { ok: false; error: unknown }

/**
 * Read-only, group-scoped deck overview of one active member (#199), reached from the Members directory (#198).
 * It never becomes the personal deck editor, also not for the viewer's own row.
 */
export default function MemberDecksPage({ onUnauthorized, onNotice }: { onUnauthorized: () => void; onNotice: (notice: Notice) => void }) {
  const { groupId = '', memberId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Opened from the directory: history Back restores its filter, search and scroll offsets (#198).
  const [fromMembers] = useState(() => typeof location.state === 'object' && location.state !== null &&
    (location.state as Record<string, unknown>).fromMembers === true)
  const [view, setView] = useState<View>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const callbacks = useRef({ onUnauthorized, onNotice, navigate })
  useEffect(() => { callbacks.current = { onUnauthorized, onNotice, navigate } })
  const membersUrl = groupUrl(groupId, 'members')

  useEffect(() => {
    let active = true
    /** Set once the view is retired (access lost or session expired); no later result may replace that state. */
    let retired = false
    const controller = new AbortController()
    const { signal } = controller
    const status = (error: unknown) => error instanceof ApiError ? error.status : undefined
    const current = () => active && !retired
    function lose() {
      if (!current()) return
      retired = true
      setView({ status: 'lost' })
      callbacks.current.onNotice({ kind: 'error', message: groupUnavailable })
      void callbacks.current.navigate('/playgroups', { replace: true, state: null })
    }
    function expire() {
      if (!current()) return
      retired = true
      callbacks.current.onUnauthorized()
    }
    /** Authorization failures retire the view whichever read reports them; returns whether it did. */
    function authorization(error: unknown) {
      if (status(error) === 401) expire()
      else if (status(error) === 403) lose()
      else return false
      return true
    }
    function show(next: View) { if (current()) setView(next) }
    if (!validId.test(groupId)) { lose(); return () => { active = false } }
    // Both reads start together. A deck 401/403 is handled as soon as it arrives, independent of the roster;
    // the fresh roster still decides the target before any deck is shown.
    const decks: Promise<Outcome> | null = validId.test(memberId)
      ? memberDecks(groupId, memberId, signal, true).then(value => ({ ok: true as const, decks: value }), (error: unknown) => {
        if (active) authorization(error)
        return { ok: false as const, error }
      })
      : null
    void (async () => {
      let group: GroupDetails
      try {
        group = await getGroup(groupId, signal)
      } catch (error) {
        if (!current() || authorization(error)) return
        if (status(error) === 404) { lose(); return }
        // An ordinary group failure must not hide a pending deck authorization failure.
        if (decks) await decks
        show({ status: 'error' })
        return
      }
      if (!current()) return
      const member = group.members.find(candidate => same(candidate.userId, memberId))
      // The deck read keeps running so a late 401/403 still retires this state.
      if (!decks || !member) { show({ status: 'unavailable', group }); return }
      const result = await decks
      if (!current()) return
      if (result.ok) { show({ status: 'ready', group, member, decks: result.decks }); return }
      if (status(result.error) !== 404) { show({ status: 'error' }); return }
      // 404 means the target (or the group) is no longer available: revalidate before choosing the state.
      try {
        const fresh = await getGroup(groupId, signal)
        show(fresh.members.some(candidate => same(candidate.userId, memberId))
          ? { status: 'error' } : { status: 'unavailable', group: fresh })
      } catch (error) {
        if (!current() || authorization(error)) return
        if (status(error) === 404) lose()
        else show({ status: 'error' })
      }
    })()
    return () => { active = false; controller.abort() }
  }, [groupId, memberId, revision])

  const ready = view.status === 'ready' ? view : null
  const needle = searchKey(query)
  const shown = ready ? ready.decks.filter(deck => matches(deck, needle)) : []

  // The deck region takes the viewport height left by the content above and below it (including the main area's
  // padding, which reserves room for the fixed phone navigation), so only the region scrolls.
  const fit = useCallback(() => {
    const element = list.current
    if (!element) return
    const region = element.getBoundingClientRect()
    const container = element.closest('main') ?? document.body
    const below = Math.max(0, container.getBoundingClientRect().bottom - region.bottom)
    const viewport = window.visualViewport?.height ?? window.innerHeight
    setMaxHeight(Math.max(240, Math.floor(viewport - (region.top + window.scrollY) - below)))
  }, [])
  // Search appears only when the complete, unsearched list overflows its region, and then stays.
  const deckCount = ready?.decks.length ?? 0
  const searching = needle !== ''
  const measure = useCallback(() => {
    const element = list.current
    if (!element || deckCount === 0 || searchVisible || searching) return
    const overflows = element.clientHeight > 0 ? element.scrollHeight > element.clientHeight + 1 : deckCount > fallbackOverflowDecks
    if (overflows) setSearchVisible(true)
  }, [deckCount, searchVisible, searching])
  useLayoutEffect(fit, [fit, view, searchVisible])
  useLayoutEffect(measure, [measure, maxHeight])
  useEffect(() => {
    const resize = () => { fit(); measure() }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [fit, measure])

  function back() {
    if (fromMembers) void navigate(-1)
    else void navigate(membersUrl, { replace: true })
  }
  function resetSearch() {
    setQuery('')
    searchInput.current?.focus()
  }

  if (view.status === 'lost') return null
  const group = ready?.group ?? (view.status === 'unavailable' ? view.group : null)
  const suffix = ready ? displaySuffixes(ready.group.members.map(member => ({ id: member.userId, name: member.username }))).get(ready.member.userId) : undefined
  const backButton = <Button color="secondary" onClick={back} sx={{ alignSelf: 'flex-start', minHeight: 44, px: 1, ml: -1, gap: 0.5 }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" /></svg>
    Zurück zu Mitglieder
  </Button>

  return <Stack component="section" aria-labelledby="member-decks-heading" aria-busy={view.status === 'loading'}
    sx={{ gap: 2, minWidth: 0, maxWidth: 720, mx: 'auto' }}>
    {backButton}
    <Box sx={{ minWidth: 0 }}>
      {view.status === 'loading' ? <>
        <Typography role="status" sx={visuallyHidden}>Decks werden geladen…</Typography>
        <Skeleton id="member-decks-heading" variant="text" width="60%" sx={{ fontSize: '2.125rem' }} />
        <Skeleton variant="text" width="45%" />
      </> : <>
        <Typography component="h2" variant="h4" id="member-decks-heading" sx={{ overflowWrap: 'anywhere', fontSize: { xs: '1.75rem', sm: undefined } }}>
          {ready ? decksHeading(ready.member.username) : 'Mitglieder-Decks'}
          {suffix && <>{' '}<Typography component="span" variant="body1" sx={{ color: 'text.secondary' }}>· ID: {suffix}</Typography></>}
        </Typography>
        {group && <Typography sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>Playgroup: {group.name}</Typography>}
      </>}
    </Box>
    <Divider />
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Decks dieses Playgroup-Mitglieds</Typography>

    {view.status === 'loading' && <Stack aria-hidden="true" sx={{ gap: 2 }}>
      {[0, 1, 2].map(index => <Card key={index} sx={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 1.5, p: 1.5 }}>
        <Skeleton variant="rounded" width={112} height={84} />
        <Stack sx={{ gap: 1 }}><Skeleton width="80%" height={28} /><Skeleton width="50%" /><Skeleton width="40%" /></Stack>
      </Card>)}
    </Stack>}

    {view.status === 'error' && <Alert severity="error" role="alert" action={<Button color="inherit" onClick={() => {
      setView({ status: 'loading' }); setRevision(value => value + 1)
    }}>Erneut versuchen</Button>}>Die Decks konnten nicht geladen werden.</Alert>}

    {view.status === 'unavailable' && <StateMessage icon={<PersonIcon />} title="Mitglied nicht mehr verfügbar"
      text="Dieses Mitglied gehört nicht mehr zur Playgroup." action="Zurück zu Mitglieder" onAction={back} />}

    {ready && ready.decks.length === 0 && <StateMessage icon={<DecksIcon />} title="Keine verfügbaren Decks"
      text="Dieses Mitglied hat aktuell keine Decks, die in der Playgroup angezeigt werden können." action="Zurück zu Mitglieder" onAction={back} />}

    {ready && ready.decks.length > 0 && <>
      {searchVisible && <TextField inputRef={searchInput} type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Deckname oder Commander suchen" fullWidth
        slotProps={{
          htmlInput: { 'aria-label': 'Deckname oder Commander suchen', 'aria-controls': 'member-decks-results' },
          input: {
            startAdornment: <InputAdornment position="start">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></svg>
            </InputAdornment>,
            endAdornment: query ? <InputAdornment position="end">
              <IconButton aria-label="Suchbegriff löschen" edge="end" onClick={resetSearch} sx={{ width: 44, height: 44 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
              </IconButton>
            </InputAdornment> : undefined,
          },
        }}
        sx={{ '& input::-webkit-search-cancel-button': { display: 'none' } }} />}
      <Box ref={list} id="member-decks-results" data-testid="member-decks-region"
        sx={{ boxSizing: 'border-box', maxHeight: maxHeight ?? undefined, overflowY: 'auto', overscrollBehavior: 'contain', minWidth: 0,
          // Room for focus rings of the first and last card inside the scroll region.
          px: 0.5, mx: -0.5, py: 0.5, my: -0.5 }}>
        {shown.length === 0 ? <StateMessage icon={<SearchIcon />} title="Keine Decks gefunden" text="Versuche einen anderen Suchbegriff."
          action="Suche zurücksetzen" onAction={resetSearch} />
          : <Stack component="ul" aria-label={`Decks von ${ready.member.username}`} sx={{ p: 0, m: 0, listStyle: 'none', gap: 2 }}>
            {shown.map(deck => <SavedDeckCard key={deck.id} deck={deck} readOnly />)}
          </Stack>}
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>Illustrationen © Wizards of the Coast · Scryfall</Typography>
      </Box>
    </>}
  </Stack>
}

function StateMessage({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action: string; onAction: () => void }) {
  return <Stack role="status" sx={{ alignItems: 'center', textAlign: 'center', gap: 1.5, py: 6, px: 2 }}>
    <Box aria-hidden="true" sx={{ width: 72, height: 72, borderRadius: '50%', display: 'grid', placeItems: 'center',
      border: '1px solid', borderColor: 'interaction.border', bgcolor: 'background.raised', color: 'text.secondary' }}>{icon}</Box>
    <Typography component="p" variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 360 }}>{text}</Typography>
    <Button variant="outlined" color="secondary" onClick={onAction} sx={{ mt: 1, minHeight: 48, px: 4 }}>{action}</Button>
  </Stack>
}

const iconProps = { width: 36, height: 36, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, focusable: 'false' } as const
function DecksIcon() { return <svg {...iconProps}><rect x="8" y="3" width="12" height="15" rx="1.5" /><path d="M5 6v13.5A1.5 1.5 0 0 0 6.5 21H16M11 7h6M11 10h4" /></svg> }
function PersonIcon() { return <svg {...iconProps}><circle cx="10" cy="8" r="4" /><path d="M3 21c0-4 3-7 7-7s7 3 7 7M17 5h5" /></svg> }
function SearchIcon() { return <svg {...iconProps}><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></svg> }
