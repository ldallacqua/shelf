import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Palette } from '@/domain/color/palette'
import { setDevice } from '@/test/device'

import { FollowGame, useFollowGame } from './follow-game'

const root = document.documentElement
const hades: Palette = ['#c8302a', '#1d2a3a', '#120b0a']
const tunic: Palette = ['#f2a33a', '#3a6a5a', '#1a2a30']

function Shelf({ palette }: { palette: Palette | undefined }) {
  useFollowGame(palette)
  return null
}

describe('following the game', () => {
  beforeEach(() => {
    root.dataset.follow = ''
    root.dataset.theme = 'dark'
  })

  afterEach(() => {
    vi.useRealTimers()
    root.removeAttribute('data-follow')
    delete root.dataset.game
    root.removeAttribute('style')
  })

  it("paints the room in a game's colors as its page opens, worked out from its cover", async () => {
    render(<FollowGame colors={hades} />)

    await waitFor(() => expect(root.dataset.game).toBe(hades.join('')))
    expect(root.style.getPropertyValue('--game-dark-wall')).toMatch(/^#[0-9a-f]{6}$/)
    expect(root.style.getPropertyValue('--game-light-accent')).toMatch(/^#[0-9a-f]{6}$/)
    expect(root.style.getPropertyValue('--game-led')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('gives the room back as the page closes', async () => {
    const page = render(<FollowGame colors={hades} />)
    await waitFor(() => expect(root.dataset.game).toBeDefined())

    page.unmount()
    await waitFor(() => expect(root.dataset.game).toBeUndefined())
  })

  it('does nothing while following is off', async () => {
    root.removeAttribute('data-follow')
    render(<FollowGame colors={hades} />)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(root.dataset.game).toBeUndefined()
  })

  it('works pastel colors out when the colorway chosen is pastel', async () => {
    root.dataset.follow = 'pastel'
    render(<FollowGame colors={hades} />)
    await waitFor(() => expect(root.dataset.game).toBeDefined())
    const pastelAccent = root.style.getPropertyValue('--game-dark-accent')

    root.dataset.follow = ''
    delete root.dataset.game
    render(<FollowGame colors={tunic} />)
    await waitFor(() => expect(root.dataset.game).toBe(tunic.join('')))
    expect(pastelAccent).not.toBe('')
  })

  it('follows a game on the shelf once the pointer has rested on it', async () => {
    setDevice({ hover: true })
    const shelf = render(<Shelf palette={hades} />)

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(root.dataset.game).toBeUndefined()
    await waitFor(() => expect(root.dataset.game).toBe(hades.join('')), { timeout: 2000 })

    shelf.rerender(<Shelf palette={undefined} />)
    await waitFor(() => expect(root.dataset.game).toBeUndefined(), { timeout: 2000 })
  })

  it('never follows on the shelf for a touch screen or under reduced motion', async () => {
    render(<Shelf palette={hades} />)
    setDevice({ hover: true, reducedMotion: true })
    render(<Shelf palette={tunic} />)

    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(root.dataset.game).toBeUndefined()
  })
})
