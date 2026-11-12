import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Box, ButtonBase, Card, Stack, Typography } from '@mui/material'
import { chooserExpanded, chooserState, originState, reportTitles, statisticsUrl, type ChooserCategory, type StatisticsReport } from './statisticsState'
import { BackLink } from './StatisticsParts'

const categories: { id: ChooserCategory; label: string; reports: StatisticsReport[] }[] = [
  { id: 'players', label: 'Spieler', reports: ['players'] },
  { id: 'decks', label: 'Decks', reports: ['decks'] },
  { id: 'group', label: 'Gruppe', reports: ['starting-seats', 'mana-colors'] },
]
const focus = { '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid', outlineColor: 'interaction.focus', outlineOffset: -3 } }

/** Complete statistics chooser. Expanded categories live in this history entry,
 * so a fresh entry starts collapsed and Back from a report restores them. */
export default function StatisticsChooser({ groupId }: { groupId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  // Local state composes rapid toggles; the effect then mirrors it into this history entry.
  const [expanded, setExpanded] = useState(() => chooserExpanded(location.state))
  useEffect(() => {
    if (chooserExpanded(location.state).join() !== expanded.join()) void navigate(location.pathname, { replace: true, state: chooserState(expanded) })
  }, [expanded, location.pathname, location.state, navigate])
  // Normalized to the fixed category order, matching what history state restores.
  const toggle = (category: ChooserCategory) => setExpanded(current =>
    chooserExpanded(chooserState(current.includes(category) ? current.filter(item => item !== category) : [...current, category])))
  return <Stack component="section" aria-labelledby="statistics-chooser-heading" sx={{ gap: 2, minWidth: 0 }}>
    <BackLink to={statisticsUrl(groupId)}>Zurück zu Statistiken</BackLink>
    <Typography component="h3" variant="h5" id="statistics-chooser-heading">Alle Statistiken</Typography>
    {categories.map(category => {
      const open = expanded.includes(category.id)
      const panel = `statistics-category-${category.id}`
      return <Card key={category.id} sx={{ minWidth: 0 }}>
        <Typography component="h4" variant="h6" sx={{ m: 0 }}>
          <ButtonBase aria-expanded={open} aria-controls={panel} onClick={() => toggle(category.id)}
            sx={{ width: '100%', minHeight: 56, px: 2, py: 1.5, justifyContent: 'space-between', font: 'inherit', textAlign: 'left', ...focus }}>
            {category.label}
            <Box component="svg" aria-hidden="true" viewBox="0 0 24 24" sx={{ width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2, transform: open ? 'rotate(180deg)' : 'none' }}>
              <path d="m6 9 6 6 6-6" />
            </Box>
          </ButtonBase>
        </Typography>
        <Box component="ul" id={panel} hidden={!open} aria-label={category.label} sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {category.reports.map(report => <Box component="li" key={report} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
            <ButtonBase component={Link} to={statisticsUrl(groupId, report)} state={originState({ kind: 'chooser', expanded })}
              sx={{ width: '100%', minHeight: 52, px: 2, justifyContent: 'space-between', textAlign: 'left', color: 'text.primary', ...focus }}>
              {reportTitles[report]}<Box component="span" aria-hidden="true">›</Box>
            </ButtonBase>
          </Box>)}
        </Box>
      </Card>
    })}
  </Stack>
}
