import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Segmented, SegmentedItem } from './segmented'

type View = 'shelf' | 'wall' | 'list'

function Views({ onChange }: { onChange?: (view: View) => void }) {
  const [view, setView] = useState<View>('shelf')
  return (
    <Segmented
      aria-label="View"
      value={view}
      onValueChange={(next) => {
        setView(next)
        onChange?.(next)
      }}
    >
      <SegmentedItem value="shelf">Shelf</SegmentedItem>
      <SegmentedItem value="wall">Wall</SegmentedItem>
      <SegmentedItem value="list">List</SegmentedItem>
    </Segmented>
  )
}

describe('Segmented', () => {
  it('is a named radio group with exactly one option pressed', () => {
    render(<Views />)
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Shelf' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Wall' })).not.toBeChecked()
  })

  it('changes on click', async () => {
    const onChange = vi.fn()
    render(<Views onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'List' }))

    expect(onChange).toHaveBeenCalledWith('list')
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Shelf' })).not.toBeChecked()
  })

  it('keeps the pressed option pressed when it is clicked again', async () => {
    const onChange = vi.fn()
    render(<Views onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Shelf' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Shelf' })).toBeChecked()
  })

  it('is one Tab stop, and arrow keys move inside it', async () => {
    render(<Views />)

    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'Shelf' })).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Wall' })).toHaveFocus()

    await userEvent.keyboard(' ')
    expect(screen.getByRole('radio', { name: 'Wall' })).toBeChecked()

    await userEvent.tab()
    expect(document.body).toHaveFocus()
  })

  // A group that remembers a choice is drawn by the server in its default
  // state and corrected as it hydrates, which on the home page comes after the
  // page is marked live. That correction must not be seen as a fade.
  it('does not animate until two frames after it mounts', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    try {
      render(<Views />)
      const group = screen.getByRole('radiogroup', { name: 'View' })
      expect(group).not.toHaveAttribute('data-settled')

      act(() => vi.advanceTimersToNextFrame())
      expect(group).not.toHaveAttribute('data-settled')

      act(() => vi.advanceTimersToNextFrame())
      expect(group).toHaveAttribute('data-settled')
    } finally {
      vi.useRealTimers()
    }
  })
})
