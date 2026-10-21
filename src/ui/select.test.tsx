import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

function Platform({
  start = 'ps5',
  onChange,
}: {
  start?: string
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(start)
  return (
    <>
      <label htmlFor="platform">Platform</label>
      <Select
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
      >
        <SelectTrigger id="platform">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ps5">PlayStation 5</SelectItem>
          <SelectItem value="switch" detail="Nintendo, 2017">
            Switch
          </SelectItem>
          <SelectItem value="pc" disabled>
            PC
          </SelectItem>
        </SelectContent>
      </Select>
    </>
  )
}

const trigger = () => screen.getByRole('combobox', { name: 'Platform' })

describe('Select', () => {
  it('is a combobox named by its label, showing what is chosen', () => {
    render(<Platform />)
    expect(trigger()).toHaveTextContent('PlayStation 5')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows its placeholder while nothing is chosen', () => {
    render(<Platform start="" />)
    expect(trigger()).toHaveTextContent('Choose…')
  })

  it('opens a list; a click chooses and closes it, and the button shows the text alone', async () => {
    const onChange = vi.fn()
    render(<Platform onChange={onChange} />)

    await userEvent.click(trigger())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // The list shows more about an option than the button does.
    await userEvent.click(screen.getByRole('option', { name: /Switch/ }))

    expect(onChange).toHaveBeenCalledWith('switch')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveTextContent('Switch')
    expect(trigger()).not.toHaveTextContent('Nintendo')
  })

  it('marks the chosen option, and a disabled one cannot be chosen', async () => {
    const onChange = vi.fn()
    render(<Platform onChange={onChange} />)
    await userEvent.click(trigger())

    expect(screen.getByRole('option', { name: 'PlayStation 5' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const pc = screen.getByRole('option', { name: 'PC' })
    expect(pc).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(pc)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes the keys: Enter opens, arrows move, Enter chooses', async () => {
    const onChange = vi.fn()
    render(<Platform onChange={onChange} />)
    trigger().focus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('switch')
    expect(trigger()).toHaveFocus()
  })

  it('leaves the choice alone on Escape', async () => {
    const onChange = vi.fn()
    render(<Platform onChange={onChange} />)
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger()).toHaveTextContent('PlayStation 5')
  })
})
