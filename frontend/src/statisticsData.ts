import { useEffect, useRef, useState } from 'react'
import { ApiError, getGroupStatistics, type GroupStatistics, type PlayerCount } from './api'

export type StatisticsLoad = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: GroupStatistics }

const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
/** API percentages, never recomputed or rounded further. */
export const formatRate = (value: number) => `${percent.format(value)} %`
export const countsText = (games: number, wins: number) =>
  `${games} ${games === 1 ? 'Spiel' : 'Spiele'} · ${wins} ${wins === 1 ? 'Sieg' : 'Siege'}`

/** One authorized statistics read per group/filter/retry. A changed key shows
 * loading at once; aborts and the key check keep retired responses (including
 * access errors) from affecting the current screen. 401/403/404 are handed to
 * the group page, which retires private content and recovers safely. */
export function useGroupStatistics(groupId: string, playerCount: PlayerCount | undefined, onAccessError: (error: unknown) => void) {
  const [revision, setRevision] = useState(0)
  const key = `${groupId}|${playerCount ?? 'all'}|${revision}`
  const [result, setResult] = useState<{ key: string; load: StatisticsLoad } | null>(null)
  const accessError = useRef(onAccessError)
  useEffect(() => { accessError.current = onAccessError })
  useEffect(() => {
    const controller = new AbortController()
    getGroupStatistics(groupId, controller.signal, playerCount).then(data => {
      if (!controller.signal.aborted) setResult({ key, load: { status: 'ready', data } })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        controller.abort()
        accessError.current(error)
      } else setResult({ key, load: { status: 'error' } })
    })
    return () => controller.abort()
  }, [groupId, playerCount, key])
  const load: StatisticsLoad = result?.key === key ? result.load : { status: 'loading' }
  return { load, retry: () => setRevision(value => value + 1) }
}
