import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Calendar } from './calendar'

const labels = { previousMonth: 'Previous month', nextMonth: 'Next month' }

const day = (name: string) => screen.getByRole('button', { name })

describe('Calendar', () => {
  it('opens on the chosen day’s month, with that day chosen and today marked', () => {
    render(
      <Calendar
        value="2026-10-14"
        today="2026-10-21"
        locale="en"
        labels={labels}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument()
    const chosen = day('Wednesday, October 14, 2026')
    expect(chosen.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true')
    expect(day('Wednesday, October 21, 2026')).toHaveAttribute('aria-current', 'date')
  })

  it('names its days in the page’s language', () => {
    render(
      <Calendar
        value="2026-10-14"
        today="2026-10-21"
        locale="pt-BR"
        labels={labels}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('grid', { name: /outubro de 2026/i })).toBeInTheDocument()
    expect(day('quarta-feira, 14 de outubro de 2026')).toBeInTheDocument()
  })

  it('is one Tab stop: arrow keys move by a day or a week, Home and End to the week’s ends', async () => {
    render(
      <Calendar
        value="2026-10-14"
        today="2026-10-21"
        locale="en"
        labels={labels}
        onSelect={vi.fn()}
        takeFocus
      />,
    )
    expect(day('Wednesday, October 14, 2026')).toHaveFocus()
    expect(screen.getAllByRole('button').filter((button) => button.tabIndex === 0)).toHaveLength(3)

    await userEvent.keyboard('{ArrowRight}')
    expect(day('Thursday, October 15, 2026')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(day('Thursday, October 8, 2026')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(day('Sunday, October 4, 2026')).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(day('Saturday, October 10, 2026')).toHaveFocus()
  })

  it('moves a month with Page Down, to the last day of a shorter one', async () => {
    render(
      <Calendar
        value="2026-01-31"
        today="2026-10-21"
        locale="en"
        labels={labels}
        onSelect={vi.fn()}
        takeFocus
      />,
    )
    await userEvent.keyboard('{PageDown}')
    expect(screen.getByRole('grid', { name: 'February 2026' })).toBeInTheDocument()
    expect(day('Saturday, February 28, 2026')).toHaveFocus()
  })

  it('keeps days past the latest out of reach', async () => {
    render(
      <Calendar
        value="2026-10-20"
        today="2026-10-21"
        max="2026-10-21"
        locale="en"
        labels={labels}
        onSelect={vi.fn()}
        takeFocus
      />,
    )
    expect(day('Thursday, October 22, 2026')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()

    await userEvent.keyboard('{ArrowDown}')
    // A week on is past the latest day: the latest day it is.
    expect(day('Wednesday, October 21, 2026')).toHaveFocus()
  })

  it('chooses a day by click or by Enter', async () => {
    const onSelect = vi.fn()
    render(
      <Calendar
        value="2026-10-14"
        today="2026-10-21"
        locale="en"
        labels={labels}
        onSelect={onSelect}
        takeFocus
      />,
    )
    await userEvent.click(day('Friday, October 9, 2026'))
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-09')

    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-10')
  })

  it('goes back and on a month with its buttons', async () => {
    render(
      <Calendar
        value="2026-10-14"
        today="2026-10-21"
        locale="en"
        labels={labels}
        onSelect={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument()
  })
})
