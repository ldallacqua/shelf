import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox, Radio, Switch } from './checkbox'
import { ChoiceChip, ToggleChip } from './chip'

describe('Checkbox, Radio and Switch', () => {
  it('are the browser’s own inputs, named by their labels', async () => {
    const onChange = vi.fn()
    render(
      <>
        <label>
          <Checkbox onChange={onChange} /> Add Half-Life
        </label>
        <label>
          <Switch defaultChecked /> Visitors can read these notes
        </label>
        <label>
          <Radio name="how" defaultChecked /> Join
        </label>
        <label>
          <Radio name="how" /> Keep apart
        </label>
      </>,
    )

    await userEvent.click(screen.getByText('Add Half-Life'))
    expect(screen.getByRole('checkbox', { name: 'Add Half-Life' })).toBeChecked()
    expect(onChange).toHaveBeenCalledOnce()

    const notes = screen.getByRole('switch', { name: 'Visitors can read these notes' })
    expect(notes).toBeChecked()
    await userEvent.click(notes)
    expect(notes).not.toBeChecked()

    await userEvent.click(screen.getByText('Keep apart'))
    expect(screen.getByRole('radio', { name: 'Keep apart' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Join' })).not.toBeChecked()
  })
})

describe('ChoiceChip and ToggleChip', () => {
  it('is one of a set, its own radio button underneath', async () => {
    render(
      <fieldset>
        <legend>Status</legend>
        <ChoiceChip type="radio" name="status" defaultChecked>
          Backlog
        </ChoiceChip>
        <ChoiceChip type="radio" name="status">
          Playing
        </ChoiceChip>
      </fieldset>,
    )
    await userEvent.click(screen.getByText('Playing'))
    expect(screen.getByRole('radio', { name: 'Playing' })).toBeChecked()
  })

  it('says whether it is pressed, and shows a tick when it is', () => {
    const { rerender } = render(
      <ToggleChip pressed={false} onClick={vi.fn()}>
        PC
      </ToggleChip>,
    )
    const chip = screen.getByRole('button', { name: 'PC' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.querySelector('svg')).toBeNull()

    rerender(
      <ToggleChip pressed onClick={vi.fn()}>
        PC
      </ToggleChip>,
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip.querySelector('svg')).not.toBeNull()
  })
})
