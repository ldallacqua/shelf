import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DatePicker } from './date-picker'

function Finished({ start, onChange }: { start?: string; onChange?: (day?: string) => void }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <span id="finished">Completed on</span>
      <DatePicker
        aria-labelledby="finished"
        value={value}
        onChange={(day) => {
          setValue(day)
          onChange?.(day)
        }}
        placeholder="Choose a day"
        max="2026-10-21"
        today="2026-10-21"
        locale="en"
        labels={{ previousMonth: 'Previous month', nextMonth: 'Next month', clear: 'Clear' }}
      />
    </>
  )
}

describe('DatePicker', () => {
  it('is named by its label and the day it holds', () => {
    render(<Finished start="2026-10-14" />)
    expect(screen.getByRole('button', { name: 'Completed on Oct 14, 2026' })).toBeInTheDocument()
  })

  it('says to choose a day while it holds none', () => {
    render(<Finished />)
    expect(screen.getByRole('button', { name: 'Completed on Choose a day' })).toBeInTheDocument()
  })

  it('opens a calendar on its day; choosing one closes it and puts focus back', async () => {
    const onChange = vi.fn()
    render(<Finished start="2026-10-14" onChange={onChange} />)
    const field = screen.getByRole('button', { name: /^Completed on/ })

    await userEvent.click(field)
    expect(screen.getByRole('dialog', { name: 'Completed on' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wednesday, October 14, 2026' })).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Enter}')

    expect(onChange).toHaveBeenCalledWith('2026-10-12')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completed on Oct 12, 2026' })).toHaveFocus()
  })

  it('can take the day away', async () => {
    const onChange = vi.fn()
    render(<Finished start="2026-10-14" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^Completed on/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(screen.getByRole('button', { name: 'Completed on Choose a day' })).toBeInTheDocument()
  })
})
