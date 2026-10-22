import { useEffect, useRef, useState, type RefObject } from 'react'
import { Autocomplete, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { ApiError, searchCommanders, scryfallUnavailable, type CommanderChoice } from './api'

type Feedback = { query: string; status: 'loading' | 'ready' | 'error'; options: CommanderChoice[] }
export function CommanderSearch({ query, selection, onInput, onSelect, onUnauthorized, disabled, locked, error, inputRef }: {
  query: string; selection: CommanderChoice | null; onInput: (value: string) => void; onSelect: (choice: CommanderChoice) => void
  onUnauthorized: () => void; disabled: boolean; locked: boolean; error?: string; inputRef: RefObject<HTMLInputElement | null>
}) {
  const searchText = [...query].map(char => /\p{White_Space}/u.test(char) || (char.codePointAt(0)! >= 28 && char.codePointAt(0)! <= 31) ? ' ' : char).join('').replace(/ +/g, ' ').trim()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => { unauthorized.current = onUnauthorized }, [onUnauthorized])
  useEffect(() => {
    const version = ++generation.current
    const controller = new AbortController()
    if (selection || locked || disabled || [...searchText].length < 2) return () => controller.abort()
    const timer = setTimeout(() => {
      setFeedback({ query, status: 'loading', options: [] })
      searchCommanders(searchText, controller.signal).then(options => {
        if (!controller.signal.aborted && version === generation.current) setFeedback({ query, status: 'ready', options })
      }).catch((reason: unknown) => {
        if (controller.signal.aborted || version !== generation.current) return
        if (reason instanceof ApiError && reason.status === 401) unauthorized.current()
        else setFeedback({ query, status: 'error', options: [] })
      })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, searchText, selection, locked, disabled, retry])
  const current = !selection && !locked && !disabled && [...searchText].length >= 2 && feedback?.query === query ? feedback : null
  function invalidate() { generation.current++; setFeedback(null) }
  return <Stack sx={{ gap: 1 }}>
    <Autocomplete options={current?.options ?? []} value={selection} inputValue={query} disabled={disabled} readOnly={locked}
      filterOptions={options => options} getOptionLabel={option => option.name} getOptionDisabled={option => !option.canBeSoleCommander}
      isOptionEqualToValue={(a, b) => JSON.stringify(a.selectionRef) === JSON.stringify(b.selectionRef)}
      noOptionsText={null} slotProps={{ paper: { sx: { '& .MuiAutocomplete-noOptions': { display: 'none' } } } }}
      onInputChange={(_, value, reason) => { if (reason === 'input' || reason === 'clear') { invalidate(); onInput(value) } }}
      onChange={(_, choice) => { if (choice && !choice.canBeSoleCommander) return; invalidate(); if (choice?.canBeSoleCommander) onSelect(choice); else if (!choice) onInput('') }}
      renderOption={(props, option) => {
        const { key, ...rest } = props
        return <Box component="li" key={key} {...rest} sx={{ gap: 1, minHeight: 48 }}>
          {option.thumbnailUrl ? <Box component="img" src={option.thumbnailUrl} alt="" sx={{ width: 32, height: 44, objectFit: 'cover' }}
            onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
            : <Box aria-hidden="true" sx={{ width: 32, height: 44, bgcolor: 'action.hover', borderRadius: 0.5, flexShrink: 0 }} />}
          {option.name}
        </Box>
      }}
      renderInput={params => <TextField {...params} inputRef={inputRef} label="Commander" required name="commander"
        error={Boolean(error)} helperText={error} sx={{ '& input[readonly]': { bgcolor: 'background.paper', color: 'text.primary' } }} slotProps={{ ...params.slotProps, input: { ...params.slotProps.input, endAdornment: <>
          {current?.status === 'loading' && <CircularProgress size={18} aria-label="Commander werden gesucht" />}{params.slotProps.input.endAdornment}</> },
          htmlInput: { ...params.slotProps.htmlInput, 'aria-describedby': [params.slotProps.htmlInput['aria-describedby'], current ? 'commander-feedback' : undefined, locked ? 'deck-locked' : undefined].filter(Boolean).join(' ') || undefined } }} />}
    />
    {current && <Box id="commander-feedback" role="status" aria-live="polite">
      {current.status === 'error' ? <><Typography>{scryfallUnavailable}</Typography><Button color="secondary" onClick={() => { invalidate(); setRetry(value => value + 1) }}>Erneut versuchen</Button></>
        : current.status === 'ready' && current.options.length === 0 ? <Typography>Just like Fblthp, the card you're looking for seems to have gotten lost!</Typography> : null}
    </Box>}
  </Stack>
}
