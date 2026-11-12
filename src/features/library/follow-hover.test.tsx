import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Palette } from '@/domain/color/palette'
import { setDevice } from '@/test/device'

import { useFollowOnHover } from './follow-hover'

const root = document.documentElement
const palettes: Palette[] = [
  ['#c8302a', '#1d2a3a', '#120b0a'],
  ['#f2a33a', '#3a6a5a', '#1a2a30'],
]

/** A wall's grid in miniature: cells that name their place, as the real ones do. */
function Wall() {
  const follow = useFollowOnHover((index) => palettes[index])
  return (
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul role="list" {...follow}>
      {palettes.map((_, index) => (
        <li key={index} data-cell="" aria-posinset={index + 1} aria-setsize={palettes.length}>
          <button type="button">Game {index + 1}</button>
        </li>
      ))}
    </ul>
  )
}

/** A list's rows, which name their place from 2, the heading being 1. */
function List() {
  const follow = useFollowOnHover((index) => palettes[index])
  return (
    <table>
      <tbody {...follow}>
        {palettes.map((_, index) => (
          <tr key={index} data-cell="" aria-rowindex={index + 2}>
            <td>
              <button type="button">Row {index + 1}</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

describe('useFollowOnHover', () => {
  beforeEach(() => {
    root.dataset.follow = ''
    root.dataset.theme = 'dark'
    setDevice({ hover: true })
  })

  afterEach(() => {
    root.removeAttribute('data-follow')
    delete root.dataset.game
    delete root.dataset.colorsChanging
    root.removeAttribute('style')
  })

  it('follows the cover the pointer rests on, by its place, and gives the room back on leaving', async () => {
    render(<Wall />)

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Game 2' }), { pointerType: 'mouse' })
    await waitFor(() => expect(root.dataset.game).toBe(palettes[1]!.join('')), { timeout: 2000 })

    fireEvent.pointerLeave(screen.getByRole('list'), { pointerType: 'mouse' })
    await waitFor(() => expect(root.dataset.game).toBeUndefined(), { timeout: 2000 })
  })

  it('follows the row the keyboard reaches in a list', async () => {
    render(<List />)

    screen.getByRole('button', { name: 'Row 1' }).focus()
    await waitFor(() => expect(root.dataset.game).toBe(palettes[0]!.join('')), { timeout: 2000 })
  })

  it('glides the room to the colors, and stops gliding after', async () => {
    render(<Wall />)

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Game 1' }), { pointerType: 'mouse' })
    await waitFor(() => expect(root.dataset.game).toBeDefined(), { timeout: 2000 })
    expect(root.dataset.colorsChanging).toBe('')
    await waitFor(() => expect(root.dataset.colorsChanging).toBeUndefined(), { timeout: 2000 })
  })

  it('ignores a finger, which opens the game instead', async () => {
    render(<Wall />)

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Game 1' }), { pointerType: 'touch' })
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(root.dataset.game).toBeUndefined()
  })
})
