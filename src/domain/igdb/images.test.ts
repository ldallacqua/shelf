import { describe, expect, it } from 'vitest'

import {
  bannerSources,
  coverSources,
  imageIdOf,
  imageUrl,
  screenshotSources,
} from '@/domain/igdb/images'

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

describe('an image on Steam’s servers (ADR 006)', () => {
  const HOST = 'https://shared.akamai.steamstatic.com/store_item_assets'
  const COVER = 'steam/apps/620/ab12/library_capsule.jpg@2x'

  it('offers a cover in the two files there are', () => {
    expect(imageUrl(COVER, 'cover_big')).toBe(`${HOST}/steam/apps/620/ab12/library_capsule.jpg`)
    expect(imageUrl(COVER, 'cover_big_2x')).toBe(
      `${HOST}/steam/apps/620/ab12/library_capsule_2x.jpg`,
    )
    expect(coverSources(COVER).srcSet).toContain('library_capsule_2x.jpg 528w')
  })

  it('offers one file where there is only one', () => {
    const single = 'steam/apps/620/portrait.png'
    expect(imageUrl(single, 'cover_big_2x')).toBe(`${HOST}/${single}`)
  })

  it('offers a screenshot at the sizes Steam keeps', () => {
    const shot = 'steam/apps/620/ss_ab12.jpg'
    expect(imageUrl(shot, 'screenshot_med')).toBe(`${HOST}/steam/apps/620/ss_ab12.600x338.jpg`)
    expect(screenshotSources(shot).srcSet).toContain('ss_ab12.1920x1080.jpg 1280w')
  })

  it('refuses a path that is not a store asset', () => {
    for (const id of [
      'steam/apps/620/../../secret.jpg',
      'steam/apps/x/a.jpg',
      'https://evil.example/a.jpg',
      'steam/apps/620/a.svg',
    ]) {
      expect(() => imageUrl(id, 'cover_big')).toThrow()
    }
  })
})

describe('a banner’s files', () => {
  it('offers Steam’s header and, when it is there, the one twice as large', () => {
    expect(bannerSources('steam/apps/10/ab/header.jpg@2x')).toEqual({
      src: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/ab/header.jpg',
      srcSet:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/ab/header.jpg 460w, https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/ab/header_2x.jpg 920w',
    })
    expect(bannerSources('steam/apps/10/header.jpg').srcSet).toBe(
      'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/header.jpg 460w',
    )
  })

  it('offers IGDB’s art at its smaller screenshot sizes', () => {
    expect(bannerSources('ar1abc').srcSet).toContain('t_screenshot_med/ar1abc.webp 569w')
    expect(bannerSources('ar1abc').srcSet).toContain('t_screenshot_big/ar1abc.webp 889w')
  })
})
