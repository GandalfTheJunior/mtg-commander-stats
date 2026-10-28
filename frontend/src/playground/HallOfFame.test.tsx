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
