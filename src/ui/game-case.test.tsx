import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { caseShapes, CoverPlaceholder, GameCase } from './game-case'

describe('GameCase', () => {
  it("is drawn at its real size times the shelf's scale", () => {
    const { container } = render(<GameCase shape="switch" frame="#d9202b" />)
    const element = container.firstElementChild
    expect(element).toHaveStyle({
      width: `calc(var(--mm) * ${caseShapes.switch.width})`,
      height: `calc(var(--mm) * ${caseShapes.switch.height})`,
    })
  })

  it('carries its plastic color and its light', () => {
    const { container } = render(<GameCase shape="bluRay" frame="#1f5fd0" led="#ff7a3d" />)
    expect(container.firstElementChild).toHaveStyle({
      '--case-frame': '#1f5fd0',
      '--case-led': '#ff7a3d',
    })
  })

  it('is marked when it is in focus, and not otherwise', () => {
    const { container, rerender } = render(<GameCase shape="bluRay" frame="#1f5fd0" />)
    expect(container.firstElementChild).not.toHaveAttribute('data-active')

    rerender(<GameCase shape="bluRay" frame="#1f5fd0" active />)
    expect(container.firstElementChild).toHaveAttribute('data-active', 'true')
  })

  it('shows its cover inside the frame', () => {
    const { container } = render(
      <GameCase shape="bluRay" frame="#1f5fd0">
        <CoverPlaceholder colors={['#ffb347', '#7a1f4d', '#e2502b']} />
      </GameCase>,
    )
    expect(container.querySelector('.game-case-cover')?.firstElementChild).not.toBeNull()
  })
})

describe('case shapes', () => {
  it('keeps real proportions: a Switch case is narrower than a Blu-ray case of about the same height', () => {
    expect(caseShapes.switch.width).toBeLessThan(caseShapes.bluRay.width)
    expect(Math.abs(caseShapes.switch.height - caseShapes.bluRay.height)).toBeLessThan(5)
  })

  it('makes a jewel case wider than it is tall', () => {
    expect(caseShapes.jewel.width).toBeGreaterThan(caseShapes.jewel.height)
  })
})
