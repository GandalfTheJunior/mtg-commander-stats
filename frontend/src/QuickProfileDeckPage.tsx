import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { ApiError, createQuickProfileDeck, getGroup, listQuickProfileDecks, type GroupMember } from './api'
import type { Notice } from './App'
import { DeckForm, type DeckFormContext } from './DeckEditor'
import { groupUnavailable, groupUrl } from './groupNavigation'

/** Focused host for #198 "Deck erstellen": reuses the group-scoped quick-profile deck form (#196) for one
 * active quick profile of the group. Registered members' decks are never editable here. */
export default function QuickProfileDeckPage({ onUnauthorized, onNotice }: { onUnauthorized: () => void; onNotice: (notice: Notice) => void }) {
  const { groupId = '', memberId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [fromMembers] = useState(() => typeof location.state === 'object' && location.state !== null && (location.state as Record<string, unknown>).fromMembers === true)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [profile, setProfile] = useState<GroupMember | null>(null)
  const [revision, setRevision] = useState(0)
  const membersUrl = groupUrl(groupId, 'members')
  const decksUrl = `${membersUrl}/${encodeURIComponent(memberId)}/decks`

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    getGroup(groupId, controller.signal).then(group => {
      if (!active) return
      const member = group.members.find(candidate => candidate.userId.toLowerCase() === memberId.toLowerCase())
      setProfile(member?.quickProfile ? member : null)
      setStatus(member?.quickProfile ? 'ready' : 'unavailable')
    }).catch(error => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else if (error instanceof ApiError && [403, 404].includes(error.status)) {
        onNotice({ kind: 'error', message: groupUnavailable })
        void navigate('/playgroups', { replace: true })
      } else setStatus('error')
    })
    return () => { active = false; controller.abort() }
  }, [groupId, memberId, revision, onUnauthorized, onNotice, navigate])

  function back() {
    // Returning through history restores the directory's filter, search and scroll position.
    if (fromMembers) void navigate(-1)
    else void navigate(membersUrl, { replace: true })
  }

  if (status !== 'ready' || !profile) return <Stack sx={{ gap: 2 }}>
    <Button color="secondary" onClick={back} sx={{ alignSelf: 'flex-start' }}>Zurück zu Mitgliedern</Button>
    {status === 'loading' && <Typography role="status">Gruppenberechtigung wird geprüft…</Typography>}
    {status === 'unavailable' && <Alert severity="info">Für dieses Mitglied kann hier kein Deck erstellt werden.</Alert>}
    {status === 'error' && <>
      <Alert severity="error">Die Gruppenberechtigung konnte nicht geprüft werden.</Alert>
      <Button onClick={() => { setStatus('loading'); setRevision(value => value + 1) }} sx={{ alignSelf: 'flex-start' }}>Erneut versuchen</Button>
    </>}
  </Stack>

  const context: DeckFormContext = {
    title: `Deck für ${profile.username} erstellen`,
    create: (input, signal, key) => createQuickProfileDeck(groupId, profile.userId, input, signal, key),
    list: signal => listQuickProfileDecks(groupId, profile.userId, signal),
    onExit: created => {
      if (!created) { back(); return }
      onNotice({ kind: 'success', message: `Deck „${created.name}“ für ${profile.username} gespeichert.` })
      // The confirmed save replaces the editor entry, so Back returns to the Members directory.
      void navigate(decksUrl, { replace: true, state: null })
    },
  }
  return <Stack sx={{ gap: 2, minWidth: 0 }}>
    <DeckForm context={context} onUnauthorized={onUnauthorized} />
  </Stack>
}
