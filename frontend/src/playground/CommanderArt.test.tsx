import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AppThemeProvider } from '../theme/AppThemeProvider'
import { CommanderArt } from './CommanderArt'
import { Playground } from './Playground'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const choice = (name = 'Atraxa', id = firstId, gameplayFaceIndex?: number) => ({ name, scryfallCardId: id,
  selectionRef: { scryfallCardId: id, ...(gameplayFaceIndex === undefined ? {} : { gameplayFaceIndex }) },
  canBeSoleCommander: true, requiresChosenColor: false, colorIdentity: ['W'], thumbnailUrl: null,
  pairing: { roles: [], partnerWith: [], variants: [] } })
const artwork = (artist = 'Artist One', id = firstId) => ({ scryfallCardId: id, artworkFaceIndex: null,
  artCropUrl: `https://cards.scryfall.io/art_crop/front/${id}.jpg`, illustrationId: null, artist, scryfallUri: `https://scryfall.com/card/test/${id}` })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const pending = () => { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r }); return { promise, resolve } }
function api(handler?: (url: string) => Response | Promise<Response>) {
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    void init
    return handler?.(url) ?? Promise.resolve(json(url.includes('/artworks') ? [artwork(), artwork('Artist Two', secondId)] : [choice()]))
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
function show() { return render(<AppThemeProvider><CommanderArt /></AppThemeProvider>) }
async function select(name = 'Atraxa') {
  const input = screen.getByRole('combobox', { name: 'Commander suchen' })
  if ((input as HTMLInputElement).value === name) fireEvent.change(input, { target: { value: '' } })
  fireEvent.change(input, { target: { value: name } })
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name }))
}
afterEach(() => vi.unstubAllGlobals())

test('real search -> artwork choices -> reselect, attribution, read-only requests and temporary state', async () => {
  const fetcher = api()
  show()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'A' } })
  await new Promise(r => setTimeout(r, 340))
  expect(fetcher).not.toHaveBeenCalled()
  await select()
  const radios = await screen.findAllByRole('radio')
  expect(radios).toHaveLength(2)
  expect(radios[0]).toBeChecked()
  fireEvent.click(radios[1])
  expect(radios[1]).toBeChecked()
  expect(screen.getByText('Illustration: Artist Two')).toBeVisible()
  expect(screen.getByRole('link', { name: /Original auf Scryfall/ })).toHaveAttribute('href', artwork('Artist Two', secondId).scryfallUri)
  expect(screen.getByRole('img', { name: 'Illustration für Atraxa' })).toHaveAttribute('src', artwork('Artist Two', secondId).artCropUrl)
  await select()
  expect((await screen.findAllByRole('radio'))[0]).toBeChecked()
  for (const [, init] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
    expect(init.credentials).toBe('same-origin')
    expect(init.method).toBeUndefined()
  }
})

test.each([200, 401, 503])('preserves gameplayFaceIndex; late artwork response (%s) cannot replace the new Commander', async status => {
  const old = pending()
  const fetcher = api(url => url.includes('/artworks')
    ? url.includes(firstId) ? old.promise : json([artwork('New Artist', secondId)])
    : json([url.includes('Second') ? choice('Second', secondId) : choice('Atraxa', firstId, 1)]))
  show(); await select()
  expect(screen.getByRole('status')).toHaveTextContent('Illustrationen werden geladen')
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`${firstId}/artworks?gameplayFaceIndex=1`), expect.anything())
  const oldSignal = (fetcher.mock.calls.find(([url]) => url.includes('/artworks')) as unknown as [string, RequestInit])[1].signal!
  await select('Second')
  await screen.findByText('Illustration: New Artist')
  expect(oldSignal.aborted).toBe(true)
  await act(async () => old.resolve(json([artwork('Old Artist')], status)))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Illustration: New Artist')).toBeVisible()
})

test.each([200, 401, 503])('late search response (%s) cannot overwrite the current query or sign-in state', async status => {
  const old = pending()
  api(url => url.includes('q=Old') ? old.promise : json([choice('Second', secondId)]))
  show()
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'Old' } }); fireEvent.focus(input)
  await screen.findByLabelText('Commander werden gesucht')
  fireEvent.change(input, { target: { value: 'Second' } })
  await screen.findByRole('option', { name: 'Second' })
  await act(async () => old.resolve(json([choice('Old')], status)))
  expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Second' })).toBeVisible()
})

test('search 401 offers main-app sign-in and retries the same query after sign-in', async () => {
  let signedIn = false
  api(url => !signedIn ? json([], 401) : json(url.includes('/artworks') ? [artwork()] : [choice()]))
  show()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Atraxa' } })
  await screen.findByRole('alert')
  expect(screen.getByRole('link', { name: /Hauptanwendung öffnen/ })).toHaveAttribute('href', '/')
  expect(screen.getByRole('combobox')).toBeDisabled()
  signedIn = true
  fireEvent.click(screen.getByRole('button', { name: 'Nach Anmeldung erneut versuchen' }))
  fireEvent.focus(screen.getByRole('combobox'))
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'Atraxa' }))
  expect(await screen.findByRole('radio')).toBeChecked()
})

test.each([401, 503, 0])('artwork lookup failure (%s) is retryable', async status => {
  let fail = true
  api(url => !url.includes('/artworks') ? json([choice()]) : fail
    ? status ? json([], status) : Promise.reject(new TypeError('offline')) : json([artwork()]))
  show(); await select()
  await screen.findByRole('alert')
  fail = false
  fireEvent.click(screen.getByRole('button', { name: status === 401 ? 'Nach Anmeldung erneut versuchen' : 'Illustrationen erneut laden' }))
  expect(await screen.findByRole('radio')).toBeChecked()
})

test('empty search, search 503 and retry reuse existing feedback', async () => {
  let status = 503
  api(() => json([], status))
  show()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Missing' } })
  await screen.findByText(/Scryfall is currently/)
  status = 200
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await screen.findByText(/Just like Fblthp/)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})

test.each([{ options: [] }, { options: [{ ...artwork(), artCropUrl: 'https://evil.example/art.jpg' }] }, { options: [{ ...artwork(), artCropUrl: null }] }])('empty/unsafe/missing artwork uses an explicit retryable empty state', async ({ options }) => {
  api(url => json(url.includes('/artworks') ? options : [choice()]))
  show(); await select()
  await screen.findByText(/Keine nutzbare Illustration/)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Illustrationen erneut laden' })).toBeVisible()
})

test('broken image can retry; changing illustration resets fallback; unsafe source never becomes a link', async () => {
  api(url => json(url.includes('/artworks') ? [{ ...artwork(), artist: null, scryfallUri: 'javascript:alert(1)' }, artwork('Artist Two', secondId)] : [choice()]))
  show(); await select()
  const image = await screen.findByRole('img', { name: 'Illustration für Atraxa' })
  expect(screen.queryByRole('link', { name: /Original auf Scryfall/ })).not.toBeInTheDocument()
  fireEvent.error(image)
  await screen.findByText(/Es konnte nicht geladen werden/)
  fireEvent.click(screen.getByRole('button', { name: 'Bild erneut laden' }))
  expect(screen.getByRole('img', { name: 'Illustration für Atraxa' })).toHaveAttribute('src', artwork().artCropUrl)
  fireEvent.error(screen.getByRole('img', { name: 'Illustration für Atraxa' }))
  fireEvent.click(screen.getAllByRole('radio')[1])
  expect(screen.getByRole('img', { name: 'Illustration für Atraxa' })).toHaveAttribute('src', artwork('Artist Two', secondId).artCropUrl)
})

test('all three experiments remain available and artwork state resets after leaving', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  const fetcher = api()
  render(<AppThemeProvider><Playground /></AppThemeProvider>)
  expect(screen.getByRole('button', { name: 'Auswahl bestätigen' })).toBeVisible()
  expect(fetcher).not.toHaveBeenCalled()
  const nav = within(screen.getByRole('navigation', { name: 'Playground-Experimente' }))
  fireEvent.click(nav.getByRole('button', { name: 'Die Farben des Manas' }))
  expect(screen.getByRole('heading', { name: 'Die Farben des Manas' })).toBeVisible()
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.click(nav.getByRole('button', { name: 'Commander-Artwork' }))
  await select(); await screen.findAllByRole('radio')
  fireEvent.click(nav.getByRole('button', { name: 'Die Lounge' }))
  fireEvent.click(nav.getByRole('button', { name: 'Commander-Artwork' }))
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(''))
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})
