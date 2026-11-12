import { createContext, useContext } from 'react'
import type { PlayerCount } from './api'
import { groupUrl } from './groupNavigation'
import type { DeckColumn, PlayerColumn, ReportSort } from './statisticsOrder'

export type StatisticsReport = 'players' | 'decks' | 'starting-seats' | 'mana-colors'
export type StatisticsView = 'landing' | 'chooser' | StatisticsReport
export const reportTitles: Record<StatisticsReport, string> = {
  players: 'Gesamtsiegquote pro Spieler',
  decks: 'Gesamtsiegquote pro Deck',
  'starting-seats': 'Siegrate nach Startplatz',
  'mana-colors': 'Siegrate nach Manafarbe',
}
export const statisticsUrl = (groupId: string, view: StatisticsView = 'landing') =>
  `${groupUrl(groupId, 'statistics')}${view === 'landing' ? '' : view === 'chooser' ? '/reports' : `/reports/${view}`}`

/** In-memory report presentation, never part of the URL or browser storage. */
export type StatisticsPresentation = { playerCount?: PlayerCount; players: ReportSort<PlayerColumn>; decks: ReportSort<DeckColumn> }
export const defaultPresentation = (): StatisticsPresentation => ({
  players: { column: 'games', direction: 'descending' },
  decks: { column: 'winRate', direction: 'descending' },
})

/** Holds one group's presentation per authentication session. Another group,
 * another session or leaving the group's routes starts again from the defaults. */
export function createStatisticsMemory() {
  let entry: { session: number; groupId: string; value: StatisticsPresentation } | null = null
  const matches = (session: number, groupId: string) => entry?.session === session && entry.groupId === groupId.toLowerCase()
  return {
    read: (session: number, groupId: string) => matches(session, groupId) ? entry!.value : defaultPresentation(),
    update(session: number, groupId: string, patch: Partial<StatisticsPresentation>) {
      const value = matches(session, groupId) ? entry!.value : defaultPresentation()
      entry = { session, groupId: groupId.toLowerCase(), value: { ...value, ...patch } }
    },
    retain(pathname: string) {
      const base = groupUrl(entry?.groupId ?? '').toLowerCase(), path = pathname.toLowerCase()
      if (entry && path !== base && !path.startsWith(`${base}/`)) entry = null
    },
  }
}
export type StatisticsMemory = ReturnType<typeof createStatisticsMemory>
export const StatisticsMemoryContext = createContext<{ memory: StatisticsMemory; session: number }>({ memory: createStatisticsMemory(), session: 0 })

export function useStatisticsMemory(groupId: string) {
  const { memory, session } = useContext(StatisticsMemoryContext)
  return {
    read: () => memory.read(session, groupId),
    update: (patch: Partial<StatisticsPresentation>) => memory.update(session, groupId, patch),
    /** Teaser and Overview entry show all table sizes, matching their unfiltered previews. */
    resetFilter: () => memory.update(session, groupId, { playerCount: undefined }),
  }
}

// History state only associates the visible Back action with its originating
// surface; it is validated and grants nothing.
export type ChooserCategory = 'players' | 'decks' | 'group'
const categories: ChooserCategory[] = ['players', 'decks', 'group']
export type ReportOrigin = { kind: 'landing' } | { kind: 'overview' } | { kind: 'chooser'; expanded: ChooserCategory[] }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function chooserExpanded(state: unknown): ChooserCategory[] {
  const value = isRecord(state) ? state.statisticsChooser : undefined
  return Array.isArray(value) ? categories.filter(category => value.includes(category)) : []
}
export const chooserState = (expanded: ChooserCategory[]) => ({ statisticsChooser: expanded })
export const originState = (origin: ReportOrigin) => ({ statisticsOrigin: origin })
export function reportOrigin(state: unknown): ReportOrigin {
  const origin = isRecord(state) && isRecord(state.statisticsOrigin) ? state.statisticsOrigin : undefined
  if (origin?.kind === 'overview') return { kind: 'overview' }
  if (origin?.kind === 'chooser') return { kind: 'chooser', expanded: chooserExpanded({ statisticsChooser: origin.expanded }) }
  return { kind: 'landing' }
}
