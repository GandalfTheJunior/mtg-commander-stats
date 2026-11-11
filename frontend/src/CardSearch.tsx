import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import { ApiError, scryfallUnavailable, type CommanderSelectionRef, type MagicColor } from './api'
import { colorLabel } from './deckColors'
import { ManaSymbols } from './ManaSymbols'

export type SearchChoice = { selectionRef: CommanderSelectionRef; name: string; colorIdentity: MagicColor[] }
type Feedback<T> = { context: string; status: 'loading' | 'ready' | 'error'; options: T[] }
export const fblthp = "Just like Fblthp, the card you're looking for seems to have gotten lost!"
// Match the backend's literal-name normalization: Unicode whitespace plus U+001C–U+001F collapse.
const normalized = (query: string) => [...query].map(char => /\p{White_Space}/u.test(char) || (char.codePointAt(0)! >= 28 && char.codePointAt(0)! <= 31) ? ' ' : char)
  .join('').replace(/ +/g, ' ').trim()

/**
 * Inline autocomplete for Commander, partner and Companion choices (#201). Live suggestions start at two
 * characters after a 300 ms debounce; up to five rows are visible and the list scrolls internally. Typing never
 * changes the committed draft: only an explicitly activated suggestion calls `onSelect`. Dismissing the list
 * (outside tap, Escape) keeps the typed text. Stale, cancelled and retired responses are ignored.
 */
export function CardSearch<T extends SearchChoice>({ label, name, search, context = '', immediate = false, filter, onSelect, onCancel,
  onUnauthorized, error, inputRef, autoFocus = false, hint }: {
  label: string; name: string; search: (query: string, signal: AbortSignal) => Promise<T[]>; context?: string; immediate?: boolean
  filter?: (choice: T) => boolean; onSelect: (choice: T) => void; onCancel?: () => void; onUnauthorized: () => void
  error?: string; inputRef?: RefObject<HTMLInputElement | null>; autoFocus?: boolean; hint?: string
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(true)
  const [feedback, setFeedback] = useState<Feedback<T> | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [retry, setRetry] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const generation = useRef(0)
  const container = useRef<HTMLDivElement>(null)
  const unauthorized = useRef(onUnauthorized)
  const searchRef = useRef(search)
  useEffect(() => { unauthorized.current = onUnauthorized; searchRef.current = search }, [onUnauthorized, search])
  const text = normalized(query)
  const suggested = immediate && query === '' && !dismissed
  const active = suggested || [...text].length >= 2
  const key = JSON.stringify([text, context, suggested])
  useEffect(() => {
    const version = ++generation.current
    const controller = new AbortController()
    if (!active) return () => controller.abort()
    const timer = setTimeout(() => {
      setFeedback({ context: key, status: 'loading', options: [] })
      searchRef.current(suggested ? '' : text, controller.signal).then(options => {
        if (!controller.signal.aborted && version === generation.current) setFeedback({ context: key, status: 'ready', options })
      }).catch((reason: unknown) => {
        if (controller.signal.aborted || version !== generation.current) return
        if (reason instanceof ApiError && reason.status === 401) unauthorized.current()
        else setFeedback({ context: key, status: 'error', options: [] })
      })
    }, suggested ? 0 : 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key, text, active, suggested, retry])
  const current = active && feedback?.context === key ? feedback : null
  const options = (current?.status === 'ready' ? current.options : []).filter(choice => !filter || filter(choice))
  const listOpen = open && options.length > 0
  const listId = `${id}-list`
  const feedbackId = `${id}-feedback`
  const optionId = (index: number) => `${id}-option-${index}`

  function choose(choice: T) {
    generation.current++
    setFeedback(null); setOpen(false); setDismissed(true)
    onSelect(choice)
  }
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (options.length) setHighlight(index => (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    } else if (event.key === 'Enter') {
      // Never submit the surrounding form from the search field.
      event.preventDefault()
      if (listOpen && options[highlight]) choose(options[highlight])
    } else if (event.key === 'Escape') {
      if (listOpen) { event.preventDefault(); setOpen(false) } else if (onCancel) { event.preventDefault(); onCancel() }
    }
  }
  return <Box ref={container} sx={{ position: 'relative', display: 'grid', gap: 1 }}
    onBlur={event => { if (!container.current?.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <TextField inputRef={inputRef} label={label} name={name} value={query} autoFocus={autoFocus} fullWidth error={Boolean(error)} helperText={error}
      autoComplete="off" onFocus={() => setOpen(true)} onKeyDown={keyDown}
      onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(0); setDismissed(true) }}
      slotProps={{
        htmlInput: { role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': listOpen, 'aria-controls': listOpen ? listId : undefined,
          'aria-activedescendant': listOpen ? optionId(highlight) : undefined, 'aria-describedby': current ? feedbackId : undefined,
          autoCapitalize: 'none', spellCheck: false, enterKeyHint: 'search' },
        input: {
          startAdornment: <InputAdornment position="start"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></svg></InputAdornment>,
          endAdornment: <InputAdornment position="end">
            {current?.status === 'loading' && <CircularProgress size={18} aria-label={`${label}: Suche läuft`} sx={{ mr: 1 }} />}
            {query && <IconButton aria-label="Suchtext löschen" edge="end" onClick={() => { setQuery(''); setOpen(true); setDismissed(true) }}
              sx={{ width: 40, height: 40 }}>×</IconButton>}
          </InputAdornment>,
        },
      }} />
    {listOpen && <Box component="ul" role="listbox" id={listId} aria-label={`${label}: Vorschläge`} sx={{
      m: 0, p: 0, listStyle: 'none', maxHeight: 5 * 56, overflowY: 'auto', overscrollBehavior: 'contain',
      border: '1px solid', borderColor: 'interaction.border', borderRadius: 1, bgcolor: 'background.raised', boxShadow: 3,
    }}>
      {options.map((choice, index) => <Box component="li" role="option" key={JSON.stringify(choice.selectionRef)} id={optionId(index)}
        aria-selected={index === highlight} aria-label={choice.name} aria-describedby={`${optionId(index)}-colors`}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(choice)} onMouseEnter={() => setHighlight(index)}
        sx={{ position: 'relative', minHeight: 56, px: 2, py: 1, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
          cursor: 'pointer', overflowWrap: 'anywhere', bgcolor: index === highlight ? 'interaction.hover' : undefined,
          '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
        <Typography component="span">{choice.name}</Typography>
        <Box aria-hidden="true" sx={{ flexShrink: 0 }}><ManaSymbols colors={choice.colorIdentity} size={20} /></Box>
        <Box component="span" id={`${optionId(index)}-colors`} sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{colorLabel(choice.colorIdentity)}</Box>
      </Box>)}
    </Box>}
    {current && <Box id={feedbackId} role="status" aria-live="polite">
      {current.status === 'error' ? <Box sx={{ p: 2, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1, display: 'grid', gap: 1.5 }}>
        <Typography>{scryfallUnavailable}</Typography>
        <Button variant="outlined" color="secondary" sx={{ justifySelf: 'center' }} onClick={() => { generation.current++; setFeedback(null); setRetry(value => value + 1) }}>Erneut versuchen</Button>
      </Box> : current.status === 'ready' && options.length === 0 && !suggested
        ? <Box sx={{ p: 2, border: '1px solid', borderColor: 'interaction.border', borderRadius: 1 }}><Typography>{fblthp}</Typography></Box> : null}
    </Box>}
    {hint && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{hint}</Typography>}
    {onCancel && <Button color="secondary" sx={{ justifySelf: 'start' }} onClick={onCancel}>Auswahl beibehalten</Button>}
  </Box>
}
