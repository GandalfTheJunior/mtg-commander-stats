import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { SortableTable } from './SortableTable'
import { initialOrder } from './ordering'

function Demo({ reduced = false }: { reduced?: boolean }) {
  const [order, setOrder] = useState(initialOrder)
  return <SortableTable order={order} onChange={setOrder} reduced={reduced} />
}
beforeEach(() => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1 })
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void
    constructor(callback: () => void) { this.callback = callback }
    observe() { this.callback() }
    disconnect() {}
  })
  Element.prototype.setPointerCapture = vi.fn()
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(77)
  vi.spyOn(window, 'cancelAnimationFrame')
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.tagName === 'OL' ? 658 : ({ mira: 120, orin: 220, lumi: 100, fenn: 170 }[this.querySelector('h3')?.textContent?.toLowerCase() ?? ''] ?? 0)
    return { x: 0, y: 0, left: 0, top: 0, width: 300, height, right: 300, bottom: height, toJSON() {} }
  })
})
afterEach(() => { Reflect.deleteProperty(Element.prototype, 'animate'); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const start = () => {
  const grip = screen.getByRole('button', { name: 'Mira ziehen' })
  fireEvent.pointerDown(grip, { clientX: 30, clientY: 30, button: 0 })
  return grip
}
const order = () => screen.getByRole('list').querySelectorAll('h3')

test('unequal measured cards reflow before drop, then commit insertion across multiple positions', () => {
  const { container } = render(<Demo />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 630 })
  expect(container.querySelector('.drag-overlay')).toHaveStyle({ width: '300px', height: '120px' })
  expect(Array.from(order()).map(n => n.textContent)).toEqual(['Mira', 'Orin', 'Lumi', 'Fenn'])
  expect(container.querySelectorAll('li')[1]).toHaveStyle({ transform: 'translateY(-132px)' })
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 630 })
  expect(Array.from(order()).map(n => n.textContent)).toEqual(['Orin', 'Lumi', 'Fenn', 'Mira'])
  expect(container.querySelector('.drag-overlay')).toBeNull()
})

test.each(['escape', 'cancel', 'outside', 'capture', 'resize', 'blur', 'hidden'])('%s retires the overlay and restores order', mode => {
  const { container } = render(<Demo />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 630 })
  if (mode === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
  if (mode === 'cancel') fireEvent.pointerCancel(grip)
  if (mode === 'outside') fireEvent.pointerUp(grip, { clientX: 400, clientY: 630 })
  if (mode === 'capture') fireEvent.lostPointerCapture(grip)
  if (mode === 'resize') fireEvent(window, new Event('resize'))
  if (mode === 'blur') fireEvent.blur(window)
  if (mode === 'hidden') fireEvent(document, new Event('visibilitychange'))
  expect(container.querySelector('.drag-overlay')).toBeNull()
  expect(window.cancelAnimationFrame).toHaveBeenCalledWith(77)
  expect(Array.from(order()).map(n => n.textContent)).toEqual(['Mira', 'Orin', 'Lumi', 'Fenn'])
})

test('unchanged grip tap does not notify the parent', () => {
  const change = vi.fn()
  render(<SortableTable order={initialOrder} onChange={change} reduced={false} />)
  const grip = start()
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 30 })
  expect(change).not.toHaveBeenCalled()
})
test('boundary moves transfer focus to the same card’s available direction', () => {
  render(<Demo />)
  const up = screen.getByRole('button', { name: 'orin nach oben' })
  up.focus()
  fireEvent.click(up)
  expect(up).toBeDisabled()
  expect(screen.getByRole('button', { name: 'orin nach unten' })).toHaveFocus()
})

test('scroll preserves capture and overlay alignment; unmount cancels the edge loop', () => {
  const { container, unmount } = render(<Demo />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 600 })
  fireEvent.scroll(window)
  expect(container.querySelector('.drag-overlay')).toHaveStyle({ top: '570px' })
  expect(window.cancelAnimationFrame).not.toHaveBeenCalled()
  unmount()
  expect(window.cancelAnimationFrame).toHaveBeenCalledWith(77)
})

test('valid insertion commits immediately but keeps one whole overlay until the measured landing finishes', () => {
  const effects: { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }[] = []
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn(() => {
    const effect = { cancel: vi.fn(), onfinish: null }; effects.push(effect); return effect
  }) })
  const { container } = render(<Demo />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 630 })
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 630 })
  expect(Array.from(order()).map(n => n.textContent)).toEqual(['Orin', 'Lumi', 'Fenn', 'Mira'])
  expect(container.querySelectorAll('.drag-overlay')).toHaveLength(1)
  expect(container.querySelectorAll('.insertion')).toHaveLength(1)
  expect(Element.prototype.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 260 }))
  act(() => effects.at(-1)!.onfinish!())
  expect(container.querySelector('.drag-overlay')).toBeNull()
  expect(container.querySelector('.insertion')).toBeNull()
  expect(effects.every(e => e.cancel.mock.calls.length === 1)).toBe(true)
  delete (Element.prototype as Partial<Element>).animate
})

test.each(['resize', 'scroll', 'hidden', 'unmount', 'keyboard', 'new drag'])('settling interruption by %s cleans all effects and retains committed insertion', mode => {
  const effects: { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }[] = []
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn(() => {
    const effect = { cancel: vi.fn(), onfinish: null }; effects.push(effect); return effect
  }) })
  const { container, unmount } = render(<Demo />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 630 })
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 630 })
  expect(container.querySelector('.settling-overlay')).not.toBeNull()
  if (mode === 'resize') fireEvent(window, new Event('resize'))
  if (mode === 'hidden') fireEvent(document, new Event('visibilitychange'))
  if (mode === 'scroll') { vi.spyOn(window, 'scrollY', 'get').mockReturnValue(10); fireEvent.scroll(window) }
  if (mode === 'unmount') unmount()
  if (mode === 'keyboard') fireEvent.click(screen.getByRole('button', { name: 'mira nach oben' }))
  if (mode === 'new drag') fireEvent.pointerDown(screen.getByRole('button', { name: 'Orin ziehen' }), { button: 0, clientX: 30, clientY: 30 })
  expect(container.querySelector('.settling-overlay')).toBeNull()
  expect(effects.every(e => e.cancel.mock.calls.length === 1 && e.onfinish === null)).toBe(true)
  if (mode !== 'unmount' && mode !== 'keyboard') expect(Array.from(order()).map(n => n.textContent)).toEqual(['Orin', 'Lumi', 'Fenn', 'Mira'])
  delete (Element.prototype as Partial<Element>).animate
})

test('reduced motion commits insertion without a spatial landing effect', () => {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  const change = vi.fn()
  const { container } = render(<SortableTable order={initialOrder} onChange={change} reduced />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 630 })
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 630 })
  expect(change).toHaveBeenCalledWith(['orin', 'lumi', 'fenn', 'mira'])
  expect(animate).not.toHaveBeenCalled()
  expect(container.querySelector('.drag-overlay')).toBeNull()
  delete (Element.prototype as Partial<Element>).animate
})

test('a live reduced-motion change ends the landing without reverting committed order', () => {
  const effects: { cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }[] = []
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn(() => {
    const effect = { cancel: vi.fn(), onfinish: null }; effects.push(effect); return effect
  }) })
  const { container, rerender } = render(<Demo />)
  const grip = start()
  fireEvent.pointerMove(grip, { clientX: 30, clientY: 630 })
  fireEvent.pointerUp(grip, { clientX: 30, clientY: 630 })
  expect(container.querySelector('.settling-overlay')).not.toBeNull()
  rerender(<Demo reduced />)
  expect(container.querySelector('.drag-overlay')).toBeNull()
  expect(effects.every(e => e.cancel.mock.calls.length === 1)).toBe(true)
  expect(Array.from(order()).map(n => n.textContent)).toEqual(['Orin', 'Lumi', 'Fenn', 'Mira'])
  delete (Element.prototype as Partial<Element>).animate
})
