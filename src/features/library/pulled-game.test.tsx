import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { LibraryPlatform } from '@/domain/library/library'
import { testGame } from '@/domain/library/testing'
import { renderWithIntl } from '@/test/render'

import { PulledGame } from './pulled-game'

/** The box pulled from the 3D wall, said in words, with the way to its page (ADR 009). */

const ps5: LibraryPlatform = {
  id: 167,
  key: 'ps5',
  name: 'PlayStation 5',
  short: 'PS5',
  family: 'playstation',
  generation: 9,
  shape: 'bluRay',
  plastic: 'blue',
}
const platforms = new Map([[ps5.id, ps5]])
const game = testGame('Hades', {
  status: 'playing',
  copies: [{ platform: 167, format: 'digital' }],
})

const pull = () => {
  const onOpen = vi.fn()
  const onPutBack = vi.fn()
  renderWithIntl(
    <PulledGame
      item={{ game, copy: game.copies[0]! }}
      platforms={platforms}
      onOpen={onOpen}
      onPutBack={onPutBack}
    />,
  )
  return { onOpen, onPutBack }
}

describe('PulledGame', () => {
  it('names the game, its status and its platform, and opens its page', async () => {
    const { onOpen } = pull()
    const bar = screen.getByRole('group', { name: 'Hades' })
    expect(bar).toHaveTextContent('Playing')
    expect(bar).toHaveTextContent('PlayStation 5')
    await userEvent.click(screen.getByRole('button', { name: 'Open Hades' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('puts the box back by its button or by Escape, but not while typing', async () => {
    const { onPutBack } = pull()
    await userEvent.click(screen.getByRole('button', { name: 'Put it back' }))
    expect(onPutBack).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    expect(onPutBack).toHaveBeenCalledTimes(2)

    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    await userEvent.keyboard('{Escape}')
    expect(onPutBack).toHaveBeenCalledTimes(2)
    field.remove()
  })
})
