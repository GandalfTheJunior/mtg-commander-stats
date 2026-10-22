import { useEffect, useRef, useState, type RefObject } from 'react'
import { Autocomplete, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { ApiError, searchCommanders, scryfallUnavailable, type CommanderChoice, type CommanderSelectionRef } from './api'

type Feedback = { context: string; status: 'loading' | 'ready' | 'error'; options: CommanderChoice[] }
export function CommanderSearch({ query, selection, onInput, onSelect, onUnauthorized, disabled, locked, error, inputRef,
  slot = 1, label = 'Commander', required = true, partnerOf, immediate = false }: {
  query: string; selection: CommanderChoice | null; onInput: (value: string) => void; onSelect: (choice: CommanderChoice) => void
  onUnauthorized: () => void; disabled: boolean; locked: boolean; error?: string; inputRef: RefObject<HTMLInputElement | null>
  slot?: number; label?: string; required?: boolean; partnerOf?: CommanderSelectionRef; immediate?: boolean
}) {
  const searchText = [...query].map(char => /\p{White_Space}/u.test(char) || (char.codePointAt(0)! >= 28 && char.codePointAt(0)! <= 31) ? ' ' : char).join('').replace(/ +/g, ' ').trim()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [retry, setRetry] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const generation = useRef(0)
  const unauthorized = useRef(onUnauthorized)
  const context = JSON.stringify([query, partnerOf, immediate])
  const suggested = immediate && query === '' && !dismissed
  const active = !selection && !locked && !disabled && (suggested || [...searchText].length >= 2)
  const printing = partnerOf?.scryfallCardId
  const gameplayFace = partnerOf?.gameplayFaceIndex
  useEffect(() => { unauthorized.current = onUnauthorized }, [onUnauthorized])
  useEffect(() => {
    const version = ++generation.current
    const controller = new AbortController()
    if (!active) return () => controller.abort()
    const timer = setTimeout(() => {
      setFeedback({ context, status: 'loading', options: [] })
      searchCommanders(searchText, controller.signal, printing ? { scryfallCardId: printing, ...(gameplayFace !== undefined ? { gameplayFaceIndex: gameplayFace } : {}) } : undefined).then(options => {
        if (!controller.signal.aborted && version === generation.current) setFeedback({ context, status: 'ready', options })
      }).catch((reason: unknown) => {
        if (controller.signal.aborted || version !== generation.current) return
        if (reason instanceof ApiError && reason.status === 401) unauthorized.current()
        else setFeedback({ context, status: 'error', options: [] })
      })
    }, suggested ? 0 : 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [context, searchText, active, suggested, printing, gameplayFace, retry])
  const current = active && feedback?.context === context ? feedback : null
  const feedbackId = `commander-feedback-${slot}`
  function invalidate() { generation.current++; setFeedback(null) }
  function choose(choice: CommanderChoice) { invalidate(); setDismissed(true); onSelect(choice) }
  return <Stack sx={{ gap: 1 }}>
    <Autocomplete options={suggested ? [] : current?.options ?? []} value={selection} inputValue={query} disabled={disabled} readOnly={locked}
      filterOptions={options => options} getOptionLabel={option => option.name}
      isOptionEqualToValue={(a, b) => JSON.stringify(a.selectionRef) === JSON.stringify(b.selectionRef)}
      noOptionsText={null} slotProps={{ paper: { sx: { '& .MuiAutocomplete-noOptions': { display: 'none' } } } }}
      onInputChange={(_, value, reason) => { if (reason === 'input' || reason === 'clear') { invalidate(); setDismissed(true); onInput(value) } }}
      onChange={(_, choice) => { invalidate(); setDismissed(true); if (choice) onSelect(choice); else onInput('') }}
      renderOption={(props, option) => {
        const { key, ...rest } = props
        return <Box component="li" key={key} {...rest} sx={{ gap: 1, minHeight: 48 }}><Thumbnail choice={option} />{option.name}</Box>
      }}
      renderInput={params => <TextField {...params} inputRef={inputRef} label={label} required={required} name={`commander-${slot}`}
        error={Boolean(error)} helperText={error} sx={{ '& input[readonly]': { bgcolor: 'background.paper', color: 'text.primary' } }} slotProps={{ ...params.slotProps, input: { ...params.slotProps.input, endAdornment: <>
          {current?.status === 'loading' && <CircularProgress size={18} aria-label="Commander werden gesucht" />}{params.slotProps.input.endAdornment}</> },
          htmlInput: { ...params.slotProps.htmlInput, 'aria-describedby': [params.slotProps.htmlInput['aria-describedby'], current ? feedbackId : undefined, locked ? 'deck-locked' : undefined].filter(Boolean).join(' ') || undefined } }} />}
    />
    {suggested && current?.status === 'ready' && current.options.length > 0 && <>
      {current.options.map(choice => <Button key={JSON.stringify(choice.selectionRef)} color="secondary" variant="outlined" sx={{ gap: 1, justifyContent: 'start', textAlign: 'left' }}
        onClick={() => choose(choice)}><Thumbnail choice={choice} />{choice.name}</Button>)}
      <Button color="secondary" sx={{ alignSelf: 'start' }} onClick={() => { invalidate(); setDismissed(true) }}>Vorschlag ausblenden</Button>
    </>}
    {current && <Box id={feedbackId} role="status" aria-live="polite">
      {current.status === 'error' ? <><Typography>{scryfallUnavailable}</Typography><Button color="secondary" onClick={() => { invalidate(); setRetry(value => value + 1) }}>Erneut versuchen</Button></>
        : current.status === 'ready' && current.options.length === 0 && !suggested ? <Typography>Just like Fblthp, the card you're looking for seems to have gotten lost!</Typography> : null}
    </Box>}
  </Stack>
}

function Thumbnail({ choice }: { choice: CommanderChoice }) {
  const [failed, setFailed] = useState(false)
  return <Box aria-hidden="true" sx={{ width: 32, height: 44, bgcolor: 'action.hover', borderRadius: 0.5, flexShrink: 0, overflow: 'hidden' }}>
    {choice.thumbnailUrl && !failed && <Box component="img" src={choice.thumbnailUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setFailed(true)} />}
  </Box>
}
