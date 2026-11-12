import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { CheckCard, CheckCards } from './check-cards'

function Places() {
  const [chosen, setChosen] = useState(new Set(['pc']))
  const card = (value: string, label: string, detail?: string) => (
    <CheckCard
      label={label}
      detail={detail}
      icon={<span>icon</span>}
      checked={chosen.has(value)}
      onChange={(event) => {
        const next = new Set(chosen)
        if (event.target.checked) next.add(value)
        else next.delete(value)
        setChosen(next)
      }}
    />
  )
  return (
    <CheckCards legend="Where do you play?">
      {card('pc', 'PC', 'Brought in from Steam')}
      {card('switch', 'Nintendo Switch')}
    </CheckCards>
  )
}

describe('CheckCards', () => {
  it('is a named group of checkboxes, each named by its label and described by its detail', () => {
    render(<Places />)
    expect(screen.getByRole('group', { name: 'Where do you play?' })).toBeInTheDocument()
    const pc = screen.getByRole('checkbox', { name: 'PC' })
    expect(pc).toBeChecked()
    expect(pc).toHaveAccessibleDescription('Brought in from Steam')
    expect(
      screen.getByRole('checkbox', { name: 'Nintendo Switch' }),
    ).not.toHaveAccessibleDescription()
    expect(screen.getAllByText('icon')[0]?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('chooses any number by a press', async () => {
    const user = userEvent.setup()
    render(<Places />)
    await user.click(screen.getByText('Nintendo Switch'))
    expect(screen.getByRole('checkbox', { name: 'Nintendo Switch' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'PC' })).toBeChecked()
  })

  it('is reached by Tab, card by card, and chosen by Space', async () => {
    const user = userEvent.setup()
    render(<Places />)
    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'PC' })).toHaveFocus()
    await user.keyboard(' ')
    expect(screen.getByRole('checkbox', { name: 'PC' })).not.toBeChecked()
    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Nintendo Switch' })).toHaveFocus()
  })
})
