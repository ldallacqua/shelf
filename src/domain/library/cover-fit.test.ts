import { describe, expect, it } from 'vitest'

import {
  WALL_FILL_WITHIN,
  WALL_FRAME,
  coverFit,
  ratioOfCover,
  ratioOfVersionCover,
} from './cover-fit'

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

  it('fills the wall’s 7:10 frame with a capsule or an IGDB cover, so neither leaves a band', () => {
    expect(coverFit(67, WALL_FRAME, WALL_FILL_WITHIN)).toBe('fill')
    expect(coverFit(75, WALL_FRAME, WALL_FILL_WITHIN)).toBe('fill')
    expect(coverFit(70, WALL_FRAME, WALL_FILL_WITHIN)).toBe('fill')
    expect(coverFit(76, WALL_FRAME, WALL_FILL_WITHIN)).toBe('fill')
    expect(coverFit(77, WALL_FRAME, WALL_FILL_WITHIN)).toBe('fill')
    expect(coverFit(80, WALL_FRAME, WALL_FILL_WITHIN)).toBe('whole')
    // A wide cover, or one whose shape isn't known, still stands whole.
    expect(coverFit(100, WALL_FRAME, WALL_FILL_WITHIN)).toBe('whole')
    expect(coverFit(56, WALL_FRAME, WALL_FILL_WITHIN)).toBe('whole')
    expect(coverFit(undefined, WALL_FRAME, WALL_FILL_WITHIN)).toBe('whole')
  })

  it('takes a version’s own cover as a capsule from Steam, and as 3:4 from IGDB', () => {
    expect(ratioOfVersionCover('steam/apps/10/aa/library_capsule.jpg')).toBe(67)
    expect(ratioOfVersionCover('co2def')).toBe(75)
    expect(coverFit(ratioOfVersionCover('co2def'), WALL_FRAME, WALL_FILL_WITHIN)).toBe('fill')
  })

  it('knows a capsule from Steam is 2:3, and nothing of an IGDB cover the library file doesn’t', () => {
    expect(ratioOfCover('steam/apps/10/aa/library_capsule.jpg@2x')).toBe(67)
    expect(ratioOfCover('co1abc')).toBeUndefined()
    expect(ratioOfCover('co1abc', 75)).toBe(75)
    expect(ratioOfCover(undefined)).toBeUndefined()
  })
})
