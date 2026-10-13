import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Ledge, ShelfLabel } from './ledge'

describe('Ledge', () => {
  it('shows what stands on it and its label', () => {
    render(
      <Ledge label={<ShelfLabel count={38}>PlayStation 4</ShelfLabel>}>
        <span>A game</span>
      </Ledge>,
    )
    expect(screen.getByText('A game')).toBeInTheDocument()
    expect(screen.getByText('PlayStation 4')).toBeInTheDocument()
    expect(screen.getByText('38')).toBeInTheDocument()
  })

  it('hides its light from assistive technology', () => {
    const { container } = render(<Ledge />)
    expect(container.querySelector('.bay-glow')).toHaveAttribute('aria-hidden', 'true')
  })

  it('can be given its own light color', () => {
    const { container } = render(<Ledge style={{ ['--led' as string]: '#ff7a3d' }} />)
    expect(container.firstElementChild).toHaveStyle({ '--led': '#ff7a3d' })
  })
})

describe('ShelfLabel', () => {
  it('shows a count of zero, which is a real number', () => {
    render(<ShelfLabel count={0}>Library</ShelfLabel>)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows no count when none is given', () => {
    const { container } = render(<ShelfLabel>Library</ShelfLabel>)
    expect(container.querySelector('.shelf-label-count')).toBeNull()
  })
})
