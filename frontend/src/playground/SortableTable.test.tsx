import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { SortableTable } from './SortableTable'
import { initialOrder } from './ordering'

function Demo() {
  const [order, setOrder] = useState(initialOrder)
  return <SortableTable order={order} onChange={setOrder} reduced={false} />
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
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.tagName === 'OL' ? 658 : ({ mira: 120, orin: 220, lumi: 100, fenn: 170 }[this.querySelector('h3')?.textContent?.toLowerCase() ?? ''] ?? 0)
    return { x: 0, y: 0, left: 0, top: 0, width: 300, height, right: 300, bottom: height, toJSON() {} }
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
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
