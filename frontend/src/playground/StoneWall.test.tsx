import { render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StoneJoints, StoneWall } from './StoneWall'

test('the finite decorative wall adds no focus targets or animation work', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame')
  const { container, unmount } = render(<><StoneWall /><StoneJoints /></>)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('svg')).toHaveAttribute('focusable', 'false')
  expect(container.querySelector('a, button, [tabindex], animate, filter, image')).toBeNull()
  const stones = [...container.querySelectorAll('.stone')]
  const raised = stones.flatMap((n, i) => n.classList.contains('stone-raised') ? [i] : [])
  expect(raised.length / stones.length).toBeGreaterThanOrEqual(.09)
  expect(raised.length / stones.length).toBeLessThanOrEqual(.11)
  expect(new Set(raised.slice(1).map((n, i) => n - raised[i])).size).toBeGreaterThan(3)
  expect(container.querySelector('.stone-joints')).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('.stone-joints path')).toHaveAttribute('fill', '#1b1e22')
  expect(raf).not.toHaveBeenCalled()
  unmount()
  raf.mockRestore()
})
