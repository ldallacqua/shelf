import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { preferenceScript } from '@/features/library/preferences'
import { renderWithIntl } from '@/test/render'

import { ListControls } from './list-controls'
import { SidebarToggle } from './sidebar-toggle'

afterEach(() => document.documentElement.removeAttribute('data-game-list'))

describe('the game list controls', () => {
  it('keeps the same focused button available to reopen the list and remembers the choice', async () => {
    renderWithIntl(<SidebarToggle />)
    const button = screen.getByRole('button', { name: 'Hide list' })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: 'Show list' })).toBe(button)
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(document.documentElement).toHaveAttribute('data-game-list', 'hidden')
    expect(localStorage.getItem('shelf:game-list')).toBe('hidden')
    document.documentElement.removeAttribute('data-game-list')
    new Function(preferenceScript())()
    expect(document.documentElement).toHaveAttribute('data-game-list', 'hidden')
    await userEvent.click(button)
    expect(button).toHaveAccessibleName('Hide list')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem('shelf:game-list')).toBeNull()
  })

  it('puts Ready to play last and exposes its selected state', () => {
    const onReady = vi.fn()
    renderWithIntl(<ListControls group="status" onGroup={vi.fn()} ready onReady={onReady} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.at(-1)).toHaveAccessibleName('Ready to play')
    expect(buttons.at(-1)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(buttons.at(-1)!)
    expect(onReady).toHaveBeenCalledOnce()
  })
})
