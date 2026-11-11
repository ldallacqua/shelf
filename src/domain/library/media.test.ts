import { describe, expect, it } from 'vitest'
import { galleryItems, videoPoster } from './media'

describe('a game gallery', () => {
  it('puts named gameplay first, exposes screenshots after at most two videos, and keeps the rest', () => {
    const items = galleryItems(
      [{ id: 'shot', width: 1920, height: 1080 }],
      [
        { id: 'teaser', name: 'Teaser' },
        { id: 'launch', name: 'Launch trailer' },
        { id: 'play', name: 'Gameplay video' },
        { id: 'extra' },
      ],
    )
    expect(items.map((item) => (item.kind === 'video' ? item.video.id : item.shot.id))).toEqual([
      'play',
      'teaser',
      'shot',
      'launch',
      'extra',
    ])
    expect(items.map((item) => item.number)).toEqual([3, 1, 1, 2, 4])
  })
  it('does not invent a trailer or a screenshot for an empty game', () => {
    expect(galleryItems([], [])).toEqual([])
  })
  it('cannot turn an image id into an external address or extra path', () => {
    expect(videoPoster('../other?x=1')).toBe(
      'https://i.ytimg.com/vi/..%2Fother%3Fx%3D1/hqdefault.jpg',
    )
  })
})
