import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import GameManager from './GameManager'
import { renderApp } from './test/renderApp'
import { deferred, gameApi, group, recorded, response, uid } from './test/gameFixtures'

let intersect: () => void
function show() {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      intersect = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    observe() {}
    disconnect() {}
  })
  return renderApp(<GameManager group={group} onUnauthorized={vi.fn()} onAccessLost={vi.fn()}
    onCheckingAccess={vi.fn()} onGroupConfirmed={vi.fn()} />)
}
const path = `/api/groups/${group.id}/games/history`
const end = 'Du hast das Ende der Bibliothek erreicht.'
const rows = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
  ...recorded({ id: uid(200 + start + i) }), playedOn: i % 2 ? null : '2026-11-09',
}))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

test.each([0, 1, 20, 21, 40, 41])('loads %s games in bounded server order and stops at the confirmed end', async count => {
  const api = gameApi()
  for (let offset = 0; offset < Math.max(count, 1); offset += 20) {
    const cursor = offset ? `?cursor=page${offset}` : ''
    api.next(path + cursor, () => response({ games: rows(Math.min(20, count - offset), offset),
      nextCursor: offset + 20 < count ? `page${offset + 20}` : null }))
  }
  show()
  await screen.findByRole('heading', { name: 'Spielehistorie' })
  if (!count) {
    await screen.findByText(/Tamiyo hat noch keine/)
    expect(screen.queryByText(end)).not.toBeInTheDocument()
  } else {
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(Math.min(20, count)))
    for (let offset = 20; offset < count; offset += 20) {
      expect(screen.queryByText(end)).not.toBeInTheDocument()
      act(() => { intersect(); intersect() })
      await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(Math.min(offset + 20, count)))
    }
    expect(screen.getByText(end)).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /^Spieldetails:/ })
    expect(links.map(link => link.getAttribute('href')?.split('/').at(-1))).toEqual(rows(count).map(row => row.id))
  }
  expect(api.fetchMock.mock.calls.filter(([url]) => url.includes('/history'))).toHaveLength(Math.max(1, Math.ceil(count / 20)))
  expect(api.fetchMock.mock.calls.some(([url]) => url.endsWith('/games'))).toBe(false)
})

test('failed append preserves cards, retries the same cursor and deduplicates overlapping rows', async () => {
  const api = gameApi()
  api.next(path, () => response({ games: rows(20), nextCursor: 'next' }))
  api.next(path + '?cursor=next', () => response({}, 503))
  api.next(path + '?cursor=next', () => response({ games: rows(2, 19), nextCursor: null }))
  const previousObserver = intersect
  show()
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
  await waitFor(() => expect(intersect).not.toBe(previousObserver))
  act(() => intersect())
  fireEvent.click(await screen.findByRole('button', { name: 'Erneut versuchen' }))
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(21))
  expect(screen.getByText(end)).toBeInTheDocument()
})

test.each([200, 401, 403])('retired append response %s cannot update a new lifetime', async status => {
  const api = gameApi(), pending = deferred()
  api.next(path, () => response({ games: rows(20), nextCursor: 'next' }))
  api.next(path + '?cursor=next', () => pending.promise)
  const view = show()
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
  act(() => intersect())
  view.unmount()
  await act(async () => pending.resolve(response({ games: rows(1, 20), nextCursor: null }, status)))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test.each([
  { games: rows(21), nextCursor: null },
  { games: [], nextCursor: 'next' },
  { games: rows(1), nextCursor: 4 },
  { games: [{ ...rows(1)[0], playedOn: '2026-02-30' }], nextCursor: null },
])('invalid page is an error rather than empty or completed history', async body => {
  const api = gameApi()
  api.next(path, () => response(body))
  show()
  await screen.findByRole('button', { name: 'Refresh games' })
  expect(screen.queryByText(end)).not.toBeInTheDocument()
  expect(screen.queryByText(/Tamiyo hat noch keine/)).not.toBeInTheDocument()
})

test.each([401, 403])('append authorization failure %s removes private rows before recovery', async status => {
  const api = gameApi()
  api.next(path, () => response({ games: rows(20), nextCursor: 'next' }))
  api.next(path + '?cursor=next', () => response({}, status))
  api.next(`/api/groups/${group.id}`, () => deferred().promise)
  show()
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
  act(() => intersect())
  await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
  expect(screen.queryByText(end)).not.toBeInTheDocument()
})
