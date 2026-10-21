import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TagInput } from './tag-input'

function Tags({ start = [] as string[], suggestions = [] as string[] }) {
  const [tags, setTags] = useState(start)
  return (
    <>
      <label htmlFor="tags">Tags</label>
      <TagInput
        id="tags"
        value={tags}
        onChange={setTags}
        suggestions={suggestions}
        placeholder="Add a tag"
        labels={{ remove: (tag) => `Remove ${tag}`, suggestions: 'Tags you have used' }}
      />
      <output data-testid="tags">{tags.join('|')}</output>
    </>
  )
}

const field = () => screen.getByRole('combobox', { name: 'Tags' })
const tags = () => screen.getByTestId('tags').textContent

describe('TagInput', () => {
  it('adds a tag on Enter or a comma, once whatever its case', async () => {
    render(<Tags />)
    await userEvent.type(field(), 'co-op{Enter}Cozy,cozy{Enter} ')
    expect(tags()).toBe('co-op|Cozy')
  })

  it('takes the last tag away with Backspace in the empty field, or one by its button', async () => {
    render(<Tags start={['rpg', 'co-op', 'cozy']} />)
    await userEvent.click(field())
    await userEvent.keyboard('{Backspace}')
    expect(tags()).toBe('rpg|co-op')

    await userEvent.click(screen.getByRole('button', { name: 'Remove rpg' }))
    expect(tags()).toBe('co-op')
    expect(field()).toHaveFocus()
  })

  it('splits a pasted list at its commas', async () => {
    render(<Tags start={['rpg']} />)
    await userEvent.click(field())
    await userEvent.paste('cozy, co-op,RPG, short')
    expect(tags()).toBe('rpg|cozy|co-op|short')
  })

  it('keeps a tag typed and left', async () => {
    render(<Tags />)
    await userEvent.type(field(), 'unfinished')
    await userEvent.tab()
    expect(tags()).toBe('unfinished')
  })

  it('offers tags in use as one is typed: arrows move, Enter takes one', async () => {
    render(
      <Tags
        start={['comfort game']}
        suggestions={['couch co-op', 'comfort game', 'cozy', 'rpg']}
      />,
    )
    await userEvent.type(field(), 'co')

    const list = screen.getByRole('listbox', { name: 'Tags you have used' })
    // Not one already there.
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'couch co-op',
      'cozy',
    ])
    expect(field()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(field()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id)
    await userEvent.keyboard('{Enter}')

    expect(tags()).toBe('comfort game|cozy')
    expect(list).not.toBeVisible()
  })

  it('takes a suggestion by click without adding what was typed', async () => {
    render(<Tags suggestions={['couch co-op']} />)
    await userEvent.type(field(), 'cou')
    await userEvent.click(screen.getByRole('option', { name: 'couch co-op' }))
    expect(tags()).toBe('couch co-op')
  })

  describe('Escape', () => {
    const heard = vi.fn()
    afterEach(() => document.removeEventListener('keydown', heard, true))

    it('puts the suggestions away, and goes no further while they are open', async () => {
      render(<Tags suggestions={['couch co-op']} />)
      // As a sheet around the field listens.
      document.addEventListener('keydown', heard, true)
      await userEvent.type(field(), 'cou')

      fireEvent.keyDown(field(), { key: 'Escape' })
      expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible()
      expect(heard.mock.calls.filter(([event]) => event.key === 'Escape')).toHaveLength(0)

      // Closed, Escape is the sheet's again.
      fireEvent.keyDown(field(), { key: 'Escape' })
      expect(heard.mock.calls.filter(([event]) => event.key === 'Escape')).toHaveLength(1)
    })
  })
})
