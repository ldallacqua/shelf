import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Rating } from './rating'

function Mine({
  start,
  onCommit,
  tabIndex,
}: {
  start?: number
  onCommit?: (value: number | undefined) => void
  tabIndex?: number
}) {
  const [value, setValue] = useState(start)
  return (
    <Rating
      label="My rating"
      value={value}
      onValueChange={setValue}
      onValueCommit={onCommit}
      onClear={() => {
        setValue(undefined)
        onCommit?.(undefined)
      }}
      unrated="Not rated"
      clearLabel="Take the rating away"
      outOf="/10"
      valueText={(rating) => `${rating} out of 10`}
      format={String}
      tabIndex={tabIndex}
    />
  )
}

const slider = () => screen.getByRole('slider', { name: 'My rating' })

describe('Rating', () => {
  it('says it is unrated until it is moved, with nothing to take away', () => {
    render(<Mine />)
    expect(screen.getByRole('group', { name: 'My rating' })).toBeInTheDocument()
    expect(slider()).toHaveAttribute('aria-valuetext', 'Not rated')
    expect(screen.queryByRole('button', { name: 'Take the rating away' })).not.toBeInTheDocument()
  })

  it('runs from 0 to 10 in half steps', () => {
    render(<Mine start={8.5} />)
    expect(slider()).toHaveAttribute('aria-valuemin', '0')
    expect(slider()).toHaveAttribute('aria-valuemax', '10')
    expect(slider()).toHaveAttribute('aria-valuenow', '8.5')
    expect(slider()).toHaveAttribute('aria-valuetext', '8.5 out of 10')
  })

  it('moves half a point with each arrow key, and commits each move', async () => {
    const onCommit = vi.fn()
    render(<Mine start={7} onCommit={onCommit} />)
    slider().focus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}')

    expect(slider()).toHaveAttribute('aria-valuenow', '7.5')
    expect(onCommit).toHaveBeenLastCalledWith(7.5)
  })

  it('goes to either end with Home and End', async () => {
    render(<Mine start={4} />)
    slider().focus()
    await userEvent.keyboard('{End}')
    expect(slider()).toHaveAttribute('aria-valuenow', '10')
    await userEvent.keyboard('{Home}')
    expect(slider()).toHaveAttribute('aria-valuenow', '0')
  })

  it('is a stop for Tab, unless a list that is one stop takes it out', async () => {
    const { unmount } = render(<Mine start={6} />)
    await userEvent.tab()
    expect(slider()).toHaveFocus()
    unmount()

    render(<Mine start={6} tabIndex={-1} />)
    expect(slider()).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Take the rating away' })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })

  it('takes a rating away with the button beside the number', async () => {
    const onCommit = vi.fn()
    render(<Mine start={9} onCommit={onCommit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Take the rating away' }))

    expect(onCommit).toHaveBeenCalledWith(undefined)
    expect(slider()).toHaveAttribute('aria-valuetext', 'Not rated')
  })
})
