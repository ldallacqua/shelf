import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Ghost, GhostText, Loading } from './ghost'
import { Ghosts } from './ghosts'

describe('Loading', () => {
  it('tells a screen reader what is on its way, and shows the eye only ghosts', () => {
    const { container } = render(
      <Loading label="Loading your games…" className="grid gap-3">
        <Ghost className="h-3" />
      </Loading>,
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading your games…')
    expect(status).toHaveClass('sr-only')
    const root = container.firstElementChild!
    expect(root).toHaveAttribute('aria-busy', 'true')
    expect(root).toHaveClass('grid', 'gap-3')
    expect(root.querySelector('.ghost')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('the ghosts', () => {
  it('take their turn in the wave', () => {
    const { container } = render(<Ghost order={3} className="h-3" />)
    expect(container.querySelector<HTMLElement>('.ghost')?.style.getPropertyValue('--i')).toBe('3')
  })

  it('draws a line as tall as a line of the type around it', () => {
    const { container } = render(<GhostText className="w-20" />)
    expect(container.firstElementChild).toHaveClass('h-[1lh]')
    expect(container.querySelector('.ghost')).toHaveClass('w-20')
  })

  it('ends a paragraph on a shorter line', () => {
    const { container } = render(<Ghosts lines={3} />)
    const bars = container.querySelectorAll('.ghost')
    expect(bars).toHaveLength(3)
    expect(bars[0]).toHaveClass('w-full')
    expect(bars[2]).toHaveClass('w-2/3')
  })
})
