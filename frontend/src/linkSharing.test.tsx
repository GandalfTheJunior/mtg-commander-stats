import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useLinkSharing } from './linkSharing'

// #318: Link kopieren behavior shared by #200 Playgroup invitations and #247 claim links.
const first = 'https://commander.example/invite/AbCdEfGhIjKlMnOpQrSt_-'
const second = 'https://commander.example/invite/ZyXwVuTsRqPoNmLkJiHg_-'

afterEach(() => { vi.unstubAllGlobals() })

function Harness({ url }: { url: string | null }) {
  const { copyLink, copy, url: shown, manualField } = useLinkSharing(url, 'Playgroup-Einladung')
  return <>
    <button onClick={() => { void copyLink() }}>Link kopieren</button>
    <output aria-label="copy state">{copy}</output>
    {copy === 'manual' && <input aria-label="Einladungslink" readOnly value={shown ?? ''} ref={manualField} />}
  </>
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const state = () => screen.getByRole('status', { name: 'copy state' })
const stubClipboard = (clipboard: unknown, secure = true) => {
  vi.stubGlobal('isSecureContext', secure)
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard })
}

test('writes the exact current URL synchronously within the click and reports success only after it resolves', async () => {
  const write = deferred()
  const writeText = vi.fn(() => write.promise)
  stubClipboard({ writeText })
  render(<Harness url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  // Called during the click handler itself: no await before the write, so Safari/Chromium user activation is kept.
  expect(writeText).toHaveBeenCalledTimes(1)
  expect(writeText).toHaveBeenCalledWith(first)
  expect(state()).toHaveTextContent('idle')
  await act(async () => write.resolve())
  expect(state()).toHaveTextContent('copied')
})

test('a rejected write (permission denied, no focus) falls back to the selected manual field', async () => {
  stubClipboard({ writeText: vi.fn().mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError')) })
  render(<Harness url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  const field = await screen.findByRole('textbox', { name: 'Einladungslink' })
  expect(field).toHaveValue(first)
  expect(field).toHaveFocus()
  expect(state()).toHaveTextContent('manual')
})

test('a synchronously throwing write falls back instead of escaping the click handler', async () => {
  stubClipboard({ writeText: vi.fn(() => { throw new TypeError('Illegal invocation') }) })
  render(<Harness url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  expect(await screen.findByRole('textbox', { name: 'Einladungslink' })).toHaveValue(first)
})

test.each([
  ['an insecure context (plain-HTTP LAN origin) without navigator.clipboard', undefined],
  ['a clipboard object without writeText', {}],
])('%s falls back to the manual field without claiming success', async (_, clipboard) => {
  stubClipboard(clipboard, false)
  render(<Harness url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  expect(await screen.findByRole('textbox', { name: 'Einladungslink' })).toHaveValue(first)
  expect(state()).toHaveTextContent('manual')
})

test('a late completion for a replaced link is never shown for the new one, which copies its own URL', async () => {
  const write = deferred()
  const writeText = vi.fn().mockReturnValueOnce(write.promise).mockResolvedValueOnce(undefined)
  stubClipboard({ writeText })
  const { rerender } = render(<Harness url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  rerender(<Harness url={second} />)
  await act(async () => write.resolve())
  expect(state()).toHaveTextContent('idle')
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  expect(writeText).toHaveBeenLastCalledWith(second)
  await act(async () => {})
  expect(state()).toHaveTextContent('copied')
})

test('a late failure for a replaced link shows no manual field for the new one', async () => {
  const write = deferred()
  stubClipboard({ writeText: vi.fn(() => write.promise) })
  const { rerender } = render(<Harness url={first} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  rerender(<Harness url={second} />)
  await act(async () => write.reject(new DOMException('denied', 'NotAllowedError')))
  expect(state()).toHaveTextContent('idle')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('without a link nothing is written', () => {
  const writeText = vi.fn()
  stubClipboard({ writeText })
  render(<Harness url={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Link kopieren' }))
  expect(writeText).not.toHaveBeenCalled()
  expect(state()).toHaveTextContent('idle')
})
