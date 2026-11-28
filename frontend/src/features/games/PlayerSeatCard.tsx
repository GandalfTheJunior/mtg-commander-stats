import { useRef, useState, type ComponentProps } from 'react'
import { Box, Button, Card, CardActionArea, Collapse, IconButton, Menu, MenuItem, Stack, TextField, Typography, useMediaQuery } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { commanderNames } from '../decks/api'
import type { DeckSelection } from './api'
import { CommanderArtwork } from '../../shared/ui/CommanderArtwork'
import { outcomeValue, type OutcomeDraft, type OutcomeMode, type OutcomeValue } from './gameOutcome'
import { parchmentTheme } from '../../theme/theme'
import paperGrain from './parchment/paper-grain.webp'
import rollTop from './parchment/paper-roll-top.svg'
import rollShaft from './parchment/paper-roll-shaft.svg'
import rollBottom from './parchment/paper-roll-bottom.svg'

export type GripHandlers = Pick<ComponentProps<'button'>, 'onKeyDown' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>

export type PlayerSeatCardProps = {
  /** Stable row key: element ids and the drag target attribute derive from it. */
  seatKey: number
  /** 1-based list position, used in accessible names. */
  position: number
  /** Number of cards in the list, for the last-position move limit. */
  count: number
  /** Display name; omit for an empty slot. */
  name?: string
  deck?: DeckSelection
  /** Member and deck are valid: the card may collapse, reorder and record a result. */
  done: boolean
  expanded: boolean
  former?: boolean
  archived?: boolean
  /** 1-based start seat among complete players. */
  startSeat: number
  error?: string
  busy: boolean
  result: { mode: OutcomeMode; draft: OutcomeDraft; count: number; hasWinner: boolean }
  grip?: GripHandlers
  onSelect: () => void
  onToggle: () => void
  onChangeMember: () => void
  onChangeDeck: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onResult: (value: OutcomeValue) => void
  onDraw: (value: boolean | undefined) => void
}

// Screen-reader-only text (same technique as the editor's live region).
const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const focusOutline = { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: 2 }
const EXPAND_MS = 200

// The original roll is 24×200 units, drawn 18px wide (0.75px per unit): the top cap covers
// units 0–12 (9px), the bottom cap 186–200 (10.5px), and only the shaft (11–187) stretches.
// The shaft overlaps each cap by one unit, so no seam opens at fractional heights.
const barrel = [
  `url("${rollTop}") left top / 100% 9px no-repeat`,
  `url("${rollBottom}") left bottom / 100% 10.5px no-repeat`,
  `url("${rollShaft}") left 8.25px / 100% calc(100% - 18px) no-repeat`,
].join(', ')

// Irregular paper edge from the playground parchment study (#165); the rim colour shows through the gaps.
const tornEdge = 'polygon(0 .8%, 4% 1.4%, 8% 0, 13% 1%, 19% .3%, 24% 1.2%, 31% .2%, 39% 1%, 48% 0, 57% 1.1%, 63% .4%, 72% 1%, 80% .2%, 89% 1.2%, 96% 0, 100% 1%, 99.7% 19%, 100% 35%, 99.6% 51%, 100% 68%, 99.6% 86%, 100% 99%, 95% 98.7%, 89% 100%, 82% 99%, 73% 99.6%, 66% 98.7%, 57% 100%, 49% 99%, 41% 99.7%, 33% 98.7%, 24% 100%, 16% 99%, 9% 99.8%, 3% 98.8%, 0 100%, .4% 82%, 0 68%, .4% 50%, 0 36%, .3% 17%)'

/** One player seat of the game editor, painted as a parchment sheet (#382). */
export function PlayerSeatCard(props: PlayerSeatCardProps) {
  const { seatKey, position, name, busy } = props
  return <ThemeProvider theme={parchmentTheme}>
    <Card component="section" data-seat-key={seatKey} aria-label={`Spieler ${position}`} sx={theme => ({
      position: 'relative', minWidth: 0, overflow: 'visible', overflowWrap: 'anywhere', color: 'text.primary',
      bgcolor: 'parchment.edge', border: '1px solid', borderColor: 'parchment.rim', borderRadius: '5px 8px 5px 7px',
      boxShadow: '-2px -2px 8px #130b0b33, 0 4px 9px rgb(0 0 0 / .28)',
      // Grain sheet below the content; a single stretched image avoids tile seams and runtime filters.
      '&::before': {
        content: '""', position: 'absolute', inset: '-1px', borderRadius: 'inherit', pointerEvents: 'none',
        clipPath: tornEdge, background: `url("${paperGrain}") center / 100% 100% no-repeat ${theme.palette.parchment.surface}`,
        boxShadow: `inset 0 0 2px ${theme.palette.parchment.rim}, inset 0 1px 1px #fff1d380`,
      },
      // Rolled edge overhanging into the left gutter; it follows the card height without squashing its caps.
      '&::after': { content: '""', position: 'absolute', left: -7, top: -3, bottom: -3, width: 18, pointerEvents: 'none', background: barrel },
      '& > *': { position: 'relative', zIndex: 1 },
      // Outrank the editor's descendant rules, which resolve against the dark theme.
      '&& :focus-visible, && .Mui-focusVisible': { outlineColor: theme.palette.interaction.focus },
      '&& .MuiNativeSelect-select:disabled': { bgcolor: 'action.disabledBackground' },
    })}>
      {name === undefined ? <CardActionArea id={`game-${seatKey}-select`} disabled={busy} onClick={props.onSelect}
        aria-label={`Spieler ${position} auswählen`} sx={{ p: 1.5, pl: 2.5, display: 'flex', gap: 1.5, justifyContent: 'flex-start', minHeight: 88,
          borderRadius: 'inherit', '&.Mui-focusVisible': { ...focusOutline, outlineOffset: -3 } }}>
        <DeckArtwork />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>Spieler auswählen</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Gruppenmitglied und Deck wählen</Typography>
        </Box>
        <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 24, px: 1 }}>+</Box>
      </CardActionArea> : <SeatContent {...props} name={name} />}
    </Card>
  </ThemeProvider>
}

function SeatContent({ seatKey, position, count, name, deck, done, expanded, former = false, archived = false, startSeat, error, busy, result, grip,
  onToggle, onChangeMember, onChangeDeck, onMoveUp, onMoveDown, onRemove, onResult, onDraw }: PlayerSeatCardProps & { name: string }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // A tap on the grip (no drag) opens the move menu: the single-pointer alternative to dragging
  // without spending space on the card. Keyboard activation opens it too; arrow keys still move.
  const [moveMenu, setMoveMenu] = useState<HTMLElement | null>(null)
  const pressed = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const move = (action: () => void) => { setMoveMenu(null); action() }
  return <>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, pl: done ? 1.5 : 2.5 }}>
      {done && <Box component="button" type="button" disabled={busy} aria-label={`${name} verschieben`} aria-describedby="game-reorder-hint"
        sx={{ flexShrink: 0, width: 44, minHeight: 64, border: 0, borderRadius: 1, bgcolor: 'transparent', color: 'text.secondary',
          cursor: busy ? 'default' : 'grab', touchAction: 'none', fontSize: 20, '&:hover': { bgcolor: 'interaction.hover' }, '&:focus-visible': focusOutline }}
        aria-haspopup="menu" aria-expanded={moveMenu ? true : undefined} aria-controls={moveMenu ? `game-${seatKey}-move` : undefined}
        {...grip}
        onPointerDown={event => {
          pressed.current = { x: event.clientX, y: event.clientY }
          dragged.current = false
          grip?.onPointerDown?.(event)
        }}
        onPointerMove={event => {
          const start = pressed.current
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) dragged.current = true
          grip?.onPointerMove?.(event)
        }}
        onClick={event => {
          pressed.current = null
          if (dragged.current) { dragged.current = false; return }
          setMoveMenu(event.currentTarget)
        }}>
        <span aria-hidden="true">⠿</span>
      </Box>}
      {done && <Menu id={`game-${seatKey}-move`} anchorEl={moveMenu} open={Boolean(moveMenu)} onClose={() => setMoveMenu(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }} transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{ list: { 'aria-label': `${name} verschieben` } }}>
        <MenuItem disabled={busy || position === 1} aria-label={`Spieler ${position} nach oben`} onClick={() => move(onMoveUp)} sx={{ minHeight: 48 }}>Nach oben</MenuItem>
        <MenuItem disabled={busy || position === count} aria-label={`Spieler ${position} nach unten`} onClick={() => move(onMoveDown)} sx={{ minHeight: 48 }}>Nach unten</MenuItem>
      </Menu>}
      <DeckArtwork deck={deck} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="h4" sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>{name}</Typography>
        {/* Compact by PO decision: commanders, then the Companion in italics; the deck name is not shown. */}
        {deck ? <>
          <Typography>{commanderNames(deck)}</Typography>
          {deck.companion && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
            <Box component="span" sx={visuallyHidden}>Companion: </Box>{deck.companion.name}
          </Typography>}
        </> : <Typography variant="body2" sx={{ color: 'text.secondary' }}>Noch kein Deck ausgewählt</Typography>}
        {former && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Ehemaliges Mitglied · nur erfasste Zuordnung</Typography>}
        {deck && archived && <Typography variant="body2" sx={{ color: 'text.secondary' }}>Archiviertes Deck · nur erfasste Zuordnung</Typography>}
      </Box>
      {done && <IconButton id={`game-${seatKey}-toggle`} disabled={busy} aria-expanded={expanded} aria-controls={`game-${seatKey}-details`}
        aria-label={`Spieler ${position} ${expanded ? 'einklappen' : 'bearbeiten'}`} sx={{ width: 48, height: 48, flexShrink: 0, color: 'text.primary',
          '&:hover': { bgcolor: 'interaction.hover' }, '&.Mui-focusVisible': focusOutline }}
        onClick={onToggle}>
        <Chevron up={expanded} />
      </IconButton>}
    </Box>
    {/* Collapsed details leave the accessibility tree and tab order at once; the height animation is visual only. */}
    <Collapse in={expanded} timeout={reduced ? 0 : EXPAND_MS} unmountOnExit>
      <Stack id={`game-${seatKey}-details`} inert={!expanded} aria-hidden={expanded ? undefined : true} sx={{ px: 1.5, pl: 2.5, pb: 1.5, gap: 1 }}>
        {error && <Typography color="error" role="alert" variant="body2">{error}</Typography>}
        {/* Compact labels so the three actions share one row from 375px; narrower phones wrap the deck button. */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
          <Stack direction="row" useFlexGap sx={{ flex: 1, minWidth: 0, gap: 0.75, flexWrap: 'wrap', '& .MuiButton-root': { px: 1, fontSize: '0.9375rem' } }}>
            <Button id={`game-${seatKey}-member`} color="secondary" variant="outlined" disabled={busy} onClick={onChangeMember}>Mitglied ändern</Button>
            {!former && <Button id={`game-${seatKey}-deck`} color="secondary" variant={deck ? 'outlined' : 'contained'} disabled={busy}
              onClick={onChangeDeck}>{deck ? 'Deck ändern' : 'Deck auswählen'}</Button>}
          </Stack>
          {/* Icon-only to save width; the accessible name keeps the full wording. */}
          <IconButton disabled={busy} aria-label={`Spieler ${position} entfernen`} onClick={onRemove}
            sx={{ width: 48, height: 48, flexShrink: 0, color: 'text.secondary', '&:hover': { bgcolor: 'interaction.hover' }, '&.Mui-focusVisible': focusOutline }}>
            <Trash />
          </IconButton>
        </Box>
      </Stack>
    </Collapse>
    {done && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mx: 1.5, ml: 2.5, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>Startplatz {startSeat}</Typography>
      <ResultControl key={result.mode} {...result} name={name} busy={busy} onDraw={onDraw} onResult={onResult} />
    </Box>}
  </>
}

function Chevron({ up }: { up: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    style={{ transform: up ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
}

function Trash() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
}

function Trophy() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 15v6m-4 0h8" /></svg>
}

const TILE_WIDTH = 52
const TILE_HEIGHT = 64
const BADGE = 24

/**
 * Read-only saved artwork in one fixed portrait tile (#382): one Commander fills it, partners
 * share it in two vertical halves (each showing the middle of its art), and a genuine Companion
 * sits as a round badge on the lower-right corner. The tile never widens, so the text column
 * keeps the same width for every deck.
 */
export function DeckArtwork({ deck }: { deck?: DeckSelection }) {
  const tile = { position: 'relative', width: TILE_WIDTH, height: TILE_HEIGHT, flexShrink: 0 } as const
  const frame = { position: 'absolute', inset: 0, display: 'flex', borderRadius: '6px', overflow: 'hidden', bgcolor: 'background.raised', border: '1px solid', borderColor: 'divider' } as const
  if (!deck) return <Box aria-hidden="true" sx={tile}><Box sx={frame} /></Box>
  return <Box aria-hidden="true" sx={tile}>
    <Box sx={frame}>
      {/* A 2px line in the surface colour separates partners; object-fit centres each half. */}
      {deck.commanders.slice(0, 2).map((commander, index) => <Box key={`${commander.oracleId}:${commander.position}`}
        sx={{ flex: 1, minWidth: 0, ...(index > 0 && { borderLeft: '2px solid', borderColor: 'background.paper' }) }}>
        <CommanderArtwork commander={commander} compact />
      </Box>)}
    </Box>
    {deck.companion && <Box sx={{ position: 'absolute', right: -6, bottom: -6, width: BADGE, height: BADGE, borderRadius: '50%', overflow: 'hidden',
      border: '2px solid', borderColor: 'background.paper', bgcolor: 'background.raised', boxShadow: '0 1px 2px rgb(0 0 0 / .3)',
      '& [role="img"]:not(img)': { p: 0, fontSize: 0 } }}>
      <CommanderArtwork commander={deck.companion} compact />
    </Box>}
  </Box>
}

function ResultControl({ mode, draft, name, count, busy, hasWinner, onResult, onDraw }: {
  mode: OutcomeMode; draft: OutcomeDraft; name: string; count: number; busy: boolean; hasWinner: boolean
  onResult: (value: OutcomeValue) => void; onDraw: (value: boolean | undefined) => void
}) {
  const field = { minWidth: 0, flex: '0 1 220px', '& select': { minHeight: 24, py: 1.25, pl: { xs: 1.25, sm: 1.75 }, fontSize: { xs: '0.9375rem', sm: '1rem' } } }
  if (mode === 'DRAW') {
    return <TextField select size="small" value={draft.draw === undefined ? '' : draft.draw ? 'IN' : 'OUT'} disabled={busy} sx={field}
      slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `Ergebnis für ${name}` } }}
      onChange={event => onDraw(event.target.value === '' ? undefined : event.target.value === 'IN')}>
      <option value="">Status wählen</option>
      <option value="IN">Noch im Spiel</option>
      <option value="OUT">Ausgeschieden</option>
    </TextField>
  }
  const value = outcomeValue(draft, mode)
  if (value === 1) {
    return <Box role="img" aria-label={`${name}: Sieger des Spiels, Platz 1`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, minHeight: 44,
      border: '2px solid', borderColor: 'secondary.main', borderRadius: 1, color: 'secondary.main', fontWeight: 700, whiteSpace: 'nowrap' }}>
      <Trophy /><span aria-hidden="true">Sieger · Platz 1</span>
    </Box>
  }
  if (!hasWinner && value === undefined) {
    return <Button variant="outlined" color="secondary" disabled={busy} aria-label={`${name}: Sieger des Spiels`} onClick={() => onResult(1)}
      startIcon={<Trophy />}>Sieger des Spiels</Button>
  }
  const first = mode === 'WIN' ? 2 : 3
  const places = Array.from({ length: Math.max(0, count - first + 1) }, (_, i) => i + first)
  if (typeof value === 'number' && !places.includes(value)) places.push(value)
  return <TextField select size="small" value={value === undefined ? '' : String(value)} disabled={busy} sx={field}
    slotProps={{ select: { native: true }, htmlInput: { 'aria-label': `Ergebnis für ${name}` } }}
    onChange={event => {
      const raw = event.target.value
      onResult(raw === '' ? undefined : raw === 'WINNER' ? 1 : raw === 'SURVIVOR' ? 'SURVIVOR' : Number(raw))
    }}>
    <option value="">Keine Platzierung</option>
    <option value="WINNER">Sieger des Spiels</option>
    {mode === 'ALTERNATE' && <option value="SURVIVOR">Noch im Spiel · Platz 2</option>}
    {places.map(place => <option key={place} value={String(place)}>Platz {place}</option>)}
  </TextField>
}
