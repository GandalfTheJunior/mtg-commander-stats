import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { ApiError, getGroup } from './api'
import type { Notice } from './App'
import { groupUnavailable, groupUrl } from './groupNavigation'
import { useNavigate } from 'react-router'

export default function PendingGroupView({ onUnauthorized, onNotice }: {
  onUnauthorized: () => void
  onNotice: (notice: Notice) => void
}) {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [name, setName] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    getGroup(groupId, controller.signal).then(group => {
      if (!active) return
      setName(group.name)
      setStatus('ready')
    }).catch(error => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else if (error instanceof ApiError && [403, 404].includes(error.status)) {
        onNotice({ kind: 'error', message: groupUnavailable })
        void navigate('/playgroups', { replace: true })
      } else setStatus('error')
    })
    return () => { active = false; controller.abort() }
  }, [groupId, revision, onUnauthorized, onNotice, navigate])
  return <Stack sx={{ gap: 2 }}>
    <Button component={Link} to={groupUrl(groupId)} sx={{ alignSelf: 'flex-start' }}>Zurück zur Playgroup</Button>
    {status === 'loading' && <Typography role="status">Gruppenberechtigung wird geprüft…</Typography>}
    {status === 'error' && <><Alert severity="error">Die Gruppenberechtigung konnte nicht geprüft werden.</Alert><Button onClick={() => { setStatus('loading'); setRevision(value => value + 1) }}>Erneut versuchen</Button></>}
    {status === 'ready' && <><Typography component="h2" variant="h4">{name}</Typography><Typography>Diese Ansicht ist noch nicht verfügbar.</Typography></>}
  </Stack>
}
