import { afterEach, expect, test, vi } from 'vitest'
import { drawHallCommanders, hallCommanderPool, loadHallCommanders, type HallArtResult } from './hallCommanders'

const id = (i: number) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`
const hallChoice = (name: string, i = 1) => ({ name, scryfallCardId: id(i), selectionRef: { scryfallCardId: id(i), gameplayFaceIndex: 1 }, colorIdentity: ['U', 'B'], canBeSoleCommander: true, requiresChosenColor: false, thumbnailUrl: null, pairing: { roles: [], partnerWith: [], variants: [] } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())

test('draws six unique names from >=12 choices and changes the entire next round even with constant RNG', () => {
  expect(hallCommanderPool.length).toBeGreaterThanOrEqual(12)
  const first = drawHallCommanders([], () => .4), next = drawHallCommanders(first, () => .4)
  expect(new Set(first).size).toBe(6)
  expect(next).toHaveLength(6)
  expect(next.every(name => !first.includes(name))).toBe(true)
})

test('rejects inexact, non-standalone, chosen-color and duplicate identities; only safe image/source pairs are used', async () => {
  const names = hallCommanderPool.slice(0, 6)
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/artworks')) return json([
      { scryfallCardId: id(1), artworkFaceIndex: 0, artCropUrl: 'https://evil.test/art.png', artist: 'Wrong', illustrationId: null, scryfallUri: 'https://scryfall.com/card/test' },
      { scryfallCardId: id(1), artworkFaceIndex: 1, artCropUrl: 'https://cards.scryfall.io/test.jpg', artist: 'Test Artist', illustrationId: null, scryfallUri: 'https://scryfall.com/card/test' },
    ])
    const name = new URL(url, 'http://localhost').searchParams.get('q')!
    const index = names.indexOf(name as typeof names[number])
    const choice = hallChoice(name, index === 5 ? 1 : index + 1)
    return json(index === 0 ? [hallChoice('Wrong first result'), choice] : index === 1 ? [hallChoice('Wrong name')] : [{ ...choice, canBeSoleCommander: index !== 2, requiresChosenColor: index === 3 }])
  })
  vi.stubGlobal('fetch', fetcher)
  const results: HallArtResult[] = []
  await loadHallCommanders(names, new AbortController().signal, (index, result) => { results[index] = result })
  expect(results.filter(result => 'commander' in result)).toHaveLength(2)
  expect(results[0]).toMatchObject({ commander: { name: names[0], colorIdentity: ['U','B'] }, src: 'https://cards.scryfall.io/test.jpg' })
  expect(results[5]).toEqual({ error: 'unavailable' })
  const artCalls = fetcher.mock.calls.filter(([url]) => url.includes('/artworks'))
  expect(artCalls).toHaveLength(2)
  expect(artCalls[0][0]).toContain('gameplayFaceIndex=1')
})

test('401 retires the remaining batch without retries; abort ignores late responses', async () => {
  const fetcher = vi.fn(async () => json({}, 401)); vi.stubGlobal('fetch', fetcher)
  const publish = vi.fn()
  await loadHallCommanders(drawHallCommanders(), new AbortController().signal, publish)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(publish).toHaveBeenCalledTimes(6)
  expect(publish).toHaveBeenLastCalledWith(5, { error: 'auth' })
  let resolve!: (response: Response) => void
  fetcher.mockImplementation(() => new Promise<Response>(done => { resolve = done }))
  const controller = new AbortController(), late = vi.fn()
  const request = loadHallCommanders(drawHallCommanders(), controller.signal, late)
  controller.abort(); resolve(json([hallChoice('Wrong')]))
  await request
  expect(late).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test.each(['empty', 'unsafe', '503'])('artwork %s uses a bounded per-slot fallback', async kind => {
  const name = hallCommanderPool[0], publish = vi.fn()
  const fetcher = vi.fn(async (url: string) => url.includes('/artworks')
    ? responseForArt() : json([hallChoice(name)]))
  function responseForArt() {
    return kind === '503' ? json({}, 503) : json(kind === 'empty' ? [] : [{ scryfallCardId: id(1), artworkFaceIndex: null, artCropUrl: 'https://evil.test/image.jpg', artist: null, illustrationId: null, scryfallUri: 'javascript:alert(1)' }])
  }
  vi.stubGlobal('fetch', fetcher)
  await loadHallCommanders([name], new AbortController().signal, publish)
  expect(publish).toHaveBeenCalledExactlyOnceWith(0, { error: 'unavailable' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
