import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Segmented, SegmentedItem } from './segmented'
import { Tip } from './tooltip'

/** A control's words beside it, on hover and keyboard focus, never the browser's `title`. */

const Shuffle = ({ describes = false }: { describes?: boolean }) => (
  <>
    <button type="button">Before</button>
    <Tip label="Shuffle again" describes={describes}>
      <button type="button" aria-label={describes ? 'Title, ascending' : 'Shuffle again'}>
        ⤨
      </button>
    </Tip>
  </>
)

describe('Tip', () => {
  it('shows its words on hover, and a screen reader hears the name once', async () => {
    render(<Shuffle />)
    const button = screen.getByRole('button', { name: 'Shuffle again' })
    expect(button).not.toHaveAttribute('title')
    await userEvent.hover(button)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Shuffle again')
    expect(button).not.toHaveAccessibleDescription()
    await userEvent.unhover(button)
  })

  it('is read as a description when its words are not the name', async () => {
    render(<Shuffle describes />)
    const button = screen.getByRole('button', { name: 'Title, ascending' })
    await userEvent.hover(button)
    await screen.findByRole('tooltip')
    expect(button).toHaveAccessibleDescription('Shuffle again')
  })

  it('shows when the keyboard reaches the control, and Escape hides it', async () => {
    render(<Shuffle />)
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Shuffle again' })).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('stays hidden for focus a sheet or a menu puts on the control', async () => {
    render(<Shuffle />)
    await userEvent.click(screen.getByRole('button', { name: 'Before' }))
    act(() => screen.getByRole('button', { name: 'Shuffle again' }).focus())
    await new Promise((done) => setTimeout(done, 500))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('leaves a toggle its own state', () => {
    render(
      <Segmented aria-label="View" value="wall" onValueChange={() => {}}>
        {['shelf', 'wall'].map((each) => (
          <Tip key={each} label={each}>
            <SegmentedItem value={each} aria-label={each}>
              {each}
            </SegmentedItem>
          </Tip>
        ))}
      </Segmented>,
    )
    expect(screen.getByRole('radio', { name: 'wall' })).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: 'shelf' })).toHaveAttribute('data-state', 'off')
  })
})
