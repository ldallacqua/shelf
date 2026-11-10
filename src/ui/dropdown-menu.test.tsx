import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'

function Menu({ onSaves }: { onSaves: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">Ways to play</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSaves}>Saves</DropdownMenuItem>
        <DropdownMenuItem>Find a download</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('a menu', () => {
  it('opens on the click, so the press alone chooses nothing under the pointer', () => {
    const onSaves = vi.fn()
    render(<Menu onSaves={onSaves} />)
    const trigger = screen.getByRole('button', { name: 'Ways to play' })
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger, { detail: 1 })
    expect(screen.getByRole('menu')).toBeVisible()
    // Let go over an item that came up under the pointer: the click that opened it chose nothing.
    expect(onSaves).not.toHaveBeenCalled()
  })

  it('closes on a second click, and opens from the keys as before', async () => {
    const user = userEvent.setup()
    render(<Menu onSaves={() => undefined} />)
    const trigger = screen.getByRole('button', { name: 'Ways to play' })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeVisible()
    await user.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('chooses an item with a click of its own', async () => {
    const user = userEvent.setup()
    const onSaves = vi.fn()
    render(<Menu onSaves={onSaves} />)
    await user.click(screen.getByRole('button', { name: 'Ways to play' }))
    await user.click(screen.getByRole('menuitem', { name: 'Saves' }))
    expect(onSaves).toHaveBeenCalledOnce()
  })
})
