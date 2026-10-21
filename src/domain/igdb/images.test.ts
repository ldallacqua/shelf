import { describe, expect, it } from 'vitest'

import { imageIdOf, imageUrl } from '@/domain/igdb/images'

describe('an IGDB image address', () => {
  it('is made from an image id and a size, as WebP', () => {
    expect(imageUrl('co1rgi', 'cover_big')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgi.webp',
    )
  })

  it('refuses anything that is not an image id, so no id can smuggle a path', () => {
    expect(() => imageUrl('../secret', 'cover_big')).toThrow()
  })

  it('gives its image id back, and nothing for any other address', () => {
    expect(imageIdOf(imageUrl('co1rgi', 'cover_small'))).toBe('co1rgi')
    expect(imageIdOf('https://images.igdb.com/igdb/image/upload/t_720p/sc6abc.jpg')).toBe('sc6abc')
    expect(imageIdOf('https://example.com/t_cover_big/co1rgi.webp')).toBeUndefined()
    expect(imageIdOf('co1rgi')).toBeUndefined()
  })
})
