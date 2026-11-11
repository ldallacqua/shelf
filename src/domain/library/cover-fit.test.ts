import { describe, expect, it } from 'vitest'

import { coverFit, ratioOfCover } from './cover-fit'

describe('how a cover stands in its frame', () => {
  it('fills a 2:3 frame with a 2:3 cover, or one within a twentieth of it', () => {
    expect(coverFit(67)).toBe('fill')
    expect(coverFit(68)).toBe('fill')
    expect(coverFit(64)).toBe('fill')
  })

  it('draws a 3:4 cover, or any other, whole inside it', () => {
    expect(coverFit(75)).toBe('whole')
    expect(coverFit(71)).toBe('whole')
    expect(coverFit(100)).toBe('whole')
    expect(coverFit(56)).toBe('whole')
  })

  it('draws a cover whose shape isn’t known whole: nothing is cut from it', () => {
    expect(coverFit(undefined)).toBe('whole')
  })

  it('takes another frame’s shape', () => {
    expect(coverFit(75, 3 / 4)).toBe('fill')
    expect(coverFit(67, 3 / 4)).toBe('whole')
  })

  it('knows a capsule from Steam is 2:3, and nothing of an IGDB cover the library file doesn’t', () => {
    expect(ratioOfCover('steam/apps/10/aa/library_capsule.jpg@2x')).toBe(67)
    expect(ratioOfCover('co1abc')).toBeUndefined()
    expect(ratioOfCover('co1abc', 75)).toBe(75)
    expect(ratioOfCover(undefined)).toBeUndefined()
  })
})
