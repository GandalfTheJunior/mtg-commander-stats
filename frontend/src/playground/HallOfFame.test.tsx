import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HallOfFame } from './HallOfFame'
import { Playground } from './Playground'

let intersect: (entries: { isIntersecting: boolean }[]) => void
const disconnect = vi.fn()
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersect) { intersect = callback }
    observe() { intersect([{ isIntersecting: true }]) }
    disconnect = disconnect
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('six unique demo decks reuse the frame; awards are independent and fixtures keep their slots', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const { container } = render(<HallOfFame />)
  expect(screen.getAllByRole('img')).toHaveLength(6)
  expect(container.querySelectorAll('.art-frame')).toHaveLength(6)
  const selectors = screen.getAllByRole('combobox', { name: /Schmuck/ })
  expect(selectors.map(el => (el as HTMLSelectElement).value)).toEqual(['laurel', 'banner', 'crown'])
  fireEvent.change(selectors[0], { target: { value: 'crown' } })
  expect(selectors.map(el => (el as HTMLSelectElement).value)).toEqual(['crown', 'banner', 'crown'])
  expect(container.querySelectorAll('.hall-honor--crown')).toHaveLength(2)
  fireEvent.change(screen.getByRole('combobox', { name: 'Demowand' }), { target: { value: 'sparse' } })
  expect(screen.getAllByText(/Freier Platz/)).toHaveLength(3)
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(new Set(screen.getAllByRole('img').map(el => el.getAttribute('aria-label'))).size).toBe(3)
  fireEvent.change(screen.getByRole('combobox', { name: 'Demowand' }), { target: { value: 'full' } })
  expect(screen.getByRole('combobox', { name: 'Schmuck für Mira' })).toHaveValue('crown')
  expect(fetcher).not.toHaveBeenCalled()
})

test('light off, offscreen and unmount retire scheduling; reduced motion is static', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(91)
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const { container, unmount } = render(<HallOfFame />)
  expect(raf).toHaveBeenCalled()
  act(() => intersect([{ isIntersecting: false }]))
  expect(cancel).toHaveBeenCalledWith(91)
  const count = raf.mock.calls.length
  expect(container.querySelector('main')).toHaveAttribute('data-animated', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Kaminlicht aus' }))
  expect(screen.getByRole('status')).toHaveTextContent('neutrales Raumlicht')
  expect(raf.mock.calls.length).toBe(count)
  unmount(); expect(disconnect).toHaveBeenCalled()
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query.includes('prefers-reduced-motion'), media: query, onchange: null, addListener() {}, removeListener() {}, dispatchEvent() { return true }, addEventListener() {}, removeEventListener() {} }) as MediaQueryList)
  render(<HallOfFame />)
  expect(screen.getByRole('status')).toHaveTextContent('statisch')
  expect(raf.mock.calls.length).toBe(count)
})

test('navigation unmounts the hall and resets its temporary controls', () => {
  render(<Playground />)
  fireEvent.click(screen.getByRole('button', { name: 'Die Ruhmeshalle' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Schmuck für Mira' }), { target: { value: 'crown' } })
  fireEvent.click(screen.getByRole('button', { name: 'Die Farben des Manas' }))
  expect(screen.queryByRole('heading', { name: 'Die Ruhmeshalle' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Die Ruhmeshalle' }))
  expect(screen.getByRole('combobox', { name: 'Schmuck für Mira' })).toHaveValue('laurel')
})

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function artworkApi() {
  const names = new Map<string, string>()
  return vi.fn(async (url: string) => {
    if (url.includes('/artworks')) {
      const id = url.split('/')[4]
      return response([{ scryfallCardId: id, artworkFaceIndex: null, artCropUrl: `https://cards.scryfall.io/${id}.jpg`, illustrationId: null, artist: 'Demo Artist', scryfallUri: `https://scryfall.com/card/test/${id}` }])
    }
    const name = new URL(url, 'http://localhost').searchParams.get('q')!
    if (!names.has(name)) names.set(name, `11111111-1111-4111-8111-${String(names.size + 1).padStart(12, '0')}`)
    const id = names.get(name)!
    return response([{ name, scryfallCardId: id, selectionRef: { scryfallCardId: id }, colorIdentity: ['U', 'B'], requiresChosenColor: false, canBeSoleCommander: true, thumbnailUrl: null, pairing: { roles: [], partnerWith: [], variants: [] } }])
  })
}
async function finishImages() {
  const images = await screen.findAllByAltText(/Commander-Illustration:/)
  await vi.waitFor(() => expect(screen.getAllByAltText(/Commander-Illustration:/)).toHaveLength(6))
  screen.getAllByAltText(/Commander-Illustration:/).forEach(image => fireEvent.load(image))
  return images
}

test('online mode loads six distinct cards, uses actual colors, retains independent controls and leaves sparse hooks empty', async () => {
  const fetcher = artworkApi(); vi.stubGlobal('fetch', fetcher)
  const { container } = render(<HallOfFame />)
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Echte Commander-Artworks' }))
  await finishImages()
  expect(new Set(screen.getAllByAltText(/Commander-Illustration:/).map(image => image.getAttribute('alt'))).size).toBe(6)
  expect(container.querySelectorAll('.art-frame[data-left="U"][data-right="B"]')).toHaveLength(6)
  expect(screen.getAllByRole('link', { name: /Original auf Scryfall/ })).toHaveLength(6)
  expect(screen.getAllByText('Illustration: Demo Artist')).toHaveLength(6)
  expect(fetcher).toHaveBeenCalledTimes(12)
  const old = screen.getAllByAltText(/Commander-Illustration:/).map(image => image.getAttribute('src'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Schmuck für Mira' }), { target: { value: 'crown' } })
  fireEvent.click(screen.getByRole('button', { name: 'Kaminlicht aus' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Demowand' }), { target: { value: 'sparse' } })
  fireEvent.click(screen.getByRole('button', { name: 'Neu mischen' }))
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(24))
  expect(screen.getAllByText(/Freier Platz/)).toHaveLength(3)
  expect(screen.getAllByAltText(/Commander-Illustration:/)).toHaveLength(3)
  expect(screen.getByRole('combobox', { name: 'Schmuck für Mira' })).toHaveValue('crown')
  expect(screen.getByRole('button', { name: 'Kaminlicht ein' })).toHaveAttribute('aria-pressed', 'false')
  expect(container.querySelector('.hall-aged')).toHaveStyle({ '--hall-tilt': '4deg' })
  expect(screen.getAllByAltText(/Commander-Illustration:/).every(image => !old.includes(image.getAttribute('src')))).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Echte Commander-Artworks' }))
  expect(screen.queryByAltText(/Commander-Illustration:/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(fetcher).toHaveBeenCalledTimes(24)
})

test.each([401, 503, 200])('unavailable (%s), missing art and image failure retain local framed illustrations', async status => {
  const fetcher = status === 200 ? artworkApi() : vi.fn(async () => response({}, status))
  vi.stubGlobal('fetch', fetcher)
  const { container } = render(<HallOfFame />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Echte Commander-Artworks' }))
  if (status === 200) {
    await finishImages()
    fireEvent.error(screen.getAllByAltText(/Commander-Illustration:/)[0])
    expect(container.querySelectorAll('.hall-art')).toHaveLength(1)
    expect(container.querySelector('.art-frame')).toHaveAttribute('data-left', 'W')
    expect(screen.getByText('Commander-Illustration nicht verfügbar · lokale Vorschau')).toBeVisible()
  } else {
    await vi.waitFor(() => expect(screen.getAllByText('Commander-Illustration nicht verfügbar · lokale Vorschau')).toHaveLength(6))
    expect(container.querySelectorAll('.hall-art')).toHaveLength(6)
    expect(fetcher).toHaveBeenCalledTimes(status === 401 ? 1 : 6)
    if (status === 401) expect(screen.getByText(/Für echte Artworks über die Hauptanwendung anmelden/)).toBeVisible()
  }
})

test('fast reroll, mode change and unmount abort and ignore late generations', async () => {
  const pending: { resolve: (response: Response) => void; signal: AbortSignal }[] = []
  vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>(resolve => pending.push({ resolve, signal: options.signal as AbortSignal }))))
  const { unmount } = render(<HallOfFame />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Echte Commander-Artworks' }))
  fireEvent.click(screen.getByRole('button', { name: 'Neu mischen' }))
  expect(pending[0].signal.aborted).toBe(true)
  await act(async () => pending[0].resolve(response([])))
  expect(screen.queryByText(/nicht verfügbar/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Echte Commander-Artworks' }))
  expect(pending[1].signal.aborted).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Echte Commander-Artworks' }))
  unmount(); expect(pending[2].signal.aborted).toBe(true)
  await act(async () => { pending[1].resolve(response([])); pending[2].resolve(response([])) })
})
