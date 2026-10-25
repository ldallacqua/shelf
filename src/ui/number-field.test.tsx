import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NumberField, onlyNumber } from './number-field'

const hours = (value: number | undefined, onCommit = vi.fn()) => {
  render(
    <NumberField
      label="Hours played"
      value={value}
      onCommit={onCommit}
      decimals={1}
      unit="h"
      format={(number) =>
        new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(number)
      }
      decreaseLabel="One hour fewer"
      increaseLabel="One hour more"
    />,
  )
  return { onCommit, field: screen.getByRole('textbox', { name: 'Hours played' }) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('NumberField', () => {
  it('takes only digits and one decimal separator, a point or a comma', () => {
    expect(onlyNumber('12a,5h')).toBe('12,5')
    expect(onlyNumber('1.2.3')).toBe('1.23')
    expect(onlyNumber('3,5,')).toBe('3,5')
    expect(onlyNumber('abc')).toBe('')
  })

  it('saves what is typed when it is left or Enter is pressed, in either way of writing a decimal', async () => {
    const { field, onCommit } = hours(undefined)
    await userEvent.type(field, '33x,5{Enter}')
    expect(field).toHaveValue('33,5')
    expect(onCommit).toHaveBeenLastCalledWith(33.5)
    await userEvent.clear(field)
    await userEvent.type(field, '12.25')
    await userEvent.tab()
    expect(onCommit).toHaveBeenLastCalledWith(12.3)
    expect(field).toHaveValue('12,3')
  })

  it('saves nothing when nothing changed, and empties to none', async () => {
    const { field, onCommit } = hours(4)
    await userEvent.click(field)
    await userEvent.tab()
    expect(onCommit).not.toHaveBeenCalled()
    await userEvent.clear(field)
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith(undefined)
  })

  it('steps with its buttons and the arrow keys, and saves once, after the last press', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { field, onCommit } = hours(2)
    await user.click(screen.getByRole('button', { name: 'One hour more' }))
    await user.click(screen.getByRole('button', { name: 'One hour more' }))
    expect(field).toHaveValue('4')
    expect(onCommit).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(4)

    field.focus()
    await user.keyboard('{ArrowDown}{Shift>}{ArrowUp}{/Shift}')
    expect(field).toHaveValue('13')
  })

  it('goes no lower than its least, and says so by not letting the button be pressed', async () => {
    const { onCommit } = hours(0.5)
    const fewer = screen.getByRole('button', { name: 'One hour fewer' })
    await userEvent.click(fewer)
    expect(screen.getByRole('textbox', { name: 'Hours played' })).toHaveValue('0')
    expect(fewer).toBeDisabled()
    expect(onCommit).not.toHaveBeenCalledWith(-0.5)
  })
})
