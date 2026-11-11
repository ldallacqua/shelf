import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Meter } from './score-meter'

const drawn = (game: string, share = 80) => {
  const { container, unmount } = render(<Meter share={share} game={game} source="igdb" />)
  const meter = container.querySelector('.game-score-meter')!
  const still = meter.hasAttribute('data-still')
  unmount()
  return still
}

describe('a score’s bar (spec 7.11)', () => {
  it('fills as a game’s page opens, and stands at its mark when the page is drawn again', () => {
    // The page the library draws, then the server's in its place.
    expect(drawn('hades')).toBe(false)
    expect(drawn('hades')).toBe(true)
  })

  it('fills again for another game, and for a mark that moved', () => {
    expect(drawn('celeste')).toBe(false)
    expect(drawn('celeste', 90)).toBe(false)
    expect(drawn('celeste', 90)).toBe(true)
    // Back to a game opened before: its page opens again, so its bars fill again.
    expect(drawn('hades')).toBe(false)
  })

  it('always fills when it says nothing of whose score it is', () => {
    const { container } = render(<Meter share={50} />)
    expect(container.querySelector('.game-score-meter')).not.toHaveAttribute('data-still')
  })
})
