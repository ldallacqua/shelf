import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

import { useRovingShelf } from './use-roving'

/** A shelf of three games, of which `drawn` are in the page. */
function Shelf({ drawn }: { drawn: number }) {
  const ref = useRef<HTMLUListElement>(null)
  const roving = useRovingShelf(ref, 3)
  return (
    <ul
      ref={ref}
      aria-label="A shelf"
      data-roving=""
      tabIndex={roving.gridTabIndex(0, drawn)}
      onFocus={roving.onFocus}
    >
      {Array.from({ length: drawn }, (_, index) => (
        <li key={index}>
          <button
            type="button"
            data-index={index}
            tabIndex={index === roving.tabStop(0, drawn) ? 0 : -1}
            onKeyDown={roving.onKeyDown}
          >
            {`Game ${index + 1}`}
          </button>
        </li>
      ))}
    </ul>
  )
}

describe('useRovingShelf (review 01, findings 20, 28 and 30)', () => {
  it("is the shelf's stop on its grid only while none of its games is drawn", () => {
    const { rerender } = render(<Shelf drawn={0} />)
    expect(screen.getByRole('list', { name: 'A shelf' })).toHaveAttribute('tabindex', '0')
    rerender(<Shelf drawn={3} />)
    expect(screen.getByRole('list', { name: 'A shelf' })).toHaveAttribute('tabindex', '-1')
  })

  it('hands focus from the grid to its stop, once the stop is drawn', () => {
    render(<Shelf drawn={3} />)
    act(() => screen.getByRole('list', { name: 'A shelf' }).focus())
    expect(screen.getByRole('button', { name: 'Game 1' })).toHaveFocus()
  })
})
