import { describe, expect, it } from 'vitest'

import { fitted } from './card-image'

/** The trophy card's line of figures (issue 68): what fits beside the games finished, the genre giving way first. */

const figures = [
  { value: '10,197', label: 'HOURS' },
  { value: '3,442', label: 'ACHIEVEMENTS' },
  { value: '6', label: 'PERFECT' },
  { value: 'Role-playing', label: 'TOP GENRE' },
]
const labels = (shown: readonly { label: string }[]) => shown.map(({ label }) => label)

describe('the trophy card’s figures', () => {
  it('are all said beside a short count', () => {
    expect(labels(fitted(figures, '69', 'GAMES FINISHED'))).toEqual([
      'HOURS',
      'ACHIEVEMENTS',
      'PERFECT',
      'TOP GENRE',
    ])
  })

  it('lose the genre first, then the next, as the count grows', () => {
    expect(labels(fitted(figures, '412', 'GAMES FINISHED'))).toEqual([
      'HOURS',
      'ACHIEVEMENTS',
      'PERFECT',
    ])
    expect(labels(fitted(figures, '1,284', 'GAMES FINISHED'))).toEqual([
      'HOURS',
      'ACHIEVEMENTS',
      'PERFECT',
    ])
    expect(fitted(figures, '1,284,567', 'GAMES FINISHED').length).toBeLessThan(3)
  })

  it('keep the first, whatever the room', () => {
    expect(
      labels(fitted(figures.slice(0, 1), '1,284,567', 'GAMES FINISHED IN A VERY LONG LANGUAGE')),
    ).toEqual(['HOURS'])
  })
})
