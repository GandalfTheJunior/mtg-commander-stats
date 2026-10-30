import { render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StoneWall } from './StoneWall'

test('the finite decorative wall adds no focus targets or animation work', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame')
  const { container, unmount } = render(<StoneWall />)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('svg')).toHaveAttribute('focusable', 'false')
  expect(container.querySelector('a, button, [tabindex], animate, filter, image')).toBeNull()
  expect(container.querySelectorAll('.stone-raised').length).toBeGreaterThan(0)
  expect(container.querySelectorAll('.stone-raised').length).toBeLessThan(container.querySelectorAll('.stone').length / 5)
  expect(raf).not.toHaveBeenCalled()
  unmount()
  raf.mockRestore()
})
