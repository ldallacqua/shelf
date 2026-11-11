import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ChoiceCard, ChoiceCards } from './choice-cards'

type Size = 'small' | 'medium' | 'large'

function Sizes({ onChange }: { onChange?: (size: Size) => void }) {
  const [size, setSize] = useState<Size>('medium')
  return (
    <>
      <h2 id="sizes">Cover size</h2>
      <ChoiceCards
        aria-labelledby="sizes"
        value={size}
        onValueChange={(next) => {
          setSize(next)
          onChange?.(next)
        }}
      >
        <ChoiceCard value="small" label="Small" detail="More on a row" picture={<span />} />
        <ChoiceCard value="medium" label="Medium" picture={<span>picture</span>} />
        <ChoiceCard value="large" label="Large" detail="Fewer, bigger" picture={<span />} />
      </ChoiceCards>
    </>
  )
}

describe('ChoiceCards', () => {
  it('is a named radio group with exactly one card chosen', () => {
    render(<Sizes />)

    expect(screen.getByRole('radiogroup', { name: 'Cover size' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Small' })).not.toBeChecked()
  })

  it('names each card by its label and describes it by its detail, not its picture', () => {
    render(<Sizes />)

    expect(screen.getByRole('radio', { name: 'Small' })).toHaveAccessibleDescription(
      'More on a row',
    )
    expect(screen.getByRole('radio', { name: 'Medium' })).not.toHaveAccessibleDescription()
    expect(screen.getByText('picture').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('chooses a card when it is pressed', async () => {
    const onChange = vi.fn()
    render(<Sizes onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Large' }))

    expect(onChange).toHaveBeenCalledWith('large')
    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Medium' })).not.toBeChecked()
  })

  it('is reached by Tab at the chosen card, and moves on with the arrow keys', async () => {
    render(<Sizes />)

    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveFocus()

    // Held as a person holds a key: Radix chooses as focus arrives, which is a
    // moment after the key goes down, and only while it is still down.
    await userEvent.keyboard('{ArrowRight>}')
    await new Promise((resolve) => setTimeout(resolve, 20))
    await userEvent.keyboard('{/ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Large' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked()
  })
})
