import { describe, expect, it } from 'vitest'

import { imageSizes, coverSources, imageUrl, screenshotSources } from '@/domain/igdb/images'
import { igdbSearchHitSchema, type IgdbSearchHit } from '@/domain/igdb/schema'
import { foldSearchHits, MAX_SEARCH_RESULTS } from '@/domain/igdb/search'

const hit = (record: Record<string, unknown>): IgdbSearchHit =>
  igdbSearchHitSchema.parse({ slug: `game-${String(record.id)}`, ...record })

describe('foldSearchHits (spec 4.1)', () => {
  it('tells same-titled games apart by year and platforms', () => {
    const results = foldSearchHits([
      hit({ id: 19531, name: 'Prey', first_release_date: 1493942400, platforms: [6, 48, 49] }),
      hit({ id: 480, name: 'Prey', first_release_date: 1152576000, platforms: [6, 12] }),
    ])
    expect(results.map((result) => [result.title, result.year, result.platforms])).toEqual([
      ['Prey', 2017, [6, 48, 49]],
      ['Prey', 2006, [6, 12]],
    ])
  })

  it('hides editions', () => {
    const results = foldSearchHits([
      hit({ id: 37777, name: 'Shadow of the Tomb Raider' }),
      hit({
        id: 123051,
        name: 'Shadow of the Tomb Raider: Definitive Edition',
        version_parent: 37777,
      }),
    ])
    expect(results.map((result) => result.igdbId)).toEqual([37777])
  })

  it('folds a port under its original as "also on"', () => {
    const [skyrim, ...rest] = foldSearchHits([
      hit({ id: 472, name: 'The Elder Scrolls V: Skyrim', platforms: [6, 9, 12] }),
      hit({
        id: 37034,
        name: 'The Elder Scrolls V: Skyrim',
        game_type: { id: 11 },
        parent_game: 472,
        platforms: [130, 6],
      }),
    ])
    expect(rest).toEqual([])
    expect(skyrim).toMatchObject({
      igdbId: 472,
      platforms: [6, 9, 12],
      alsoOn: [130],
      ports: [37034],
    })
  })

  it('keeps a port whose original is not among the results', () => {
    const results = foldSearchHits([
      hit({ id: 37034, name: 'Skyrim', game_type: { id: 11 }, parent_game: 472, platforms: [130] }),
    ])
    expect(results.map((result) => [result.igdbId, result.kind])).toEqual([[37034, 'port']])
  })

  it('marks remakes, remasters and expanded editions, and keeps them as results', () => {
    const results = foldSearchHits([
      hit({ id: 974, name: 'Resident Evil 4' }),
      hit({ id: 132181, name: 'Resident Evil 4', game_type: { id: 8 }, parent_game: 974 }),
      hit({ id: 114283, name: 'Persona 5 Royal', game_type: { id: 10 }, parent_game: 9927 }),
    ])
    expect(results.map((result) => result.kind)).toEqual(['main', 'remake', 'expanded'])
  })

  it('keeps IGDB’s order and shows at most eight', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      hit({ id: index + 1, name: `Game ${index}` }),
    )
    const results = foldSearchHits(many)
    expect(results).toHaveLength(MAX_SEARCH_RESULTS)
    expect(results.map((result) => result.igdbId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('drops repeats of the same record', () => {
    expect(foldSearchHits([hit({ id: 1, name: 'A' }), hit({ id: 1, name: 'A' })])).toHaveLength(1)
  })

  it('includes the cover only when its size is known', () => {
    const [withCover, without] = foldSearchHits([
      hit({ id: 1, name: 'A', cover: { image_id: 'co1', width: 600, height: 800 } }),
      hit({ id: 2, name: 'B', cover: { image_id: 'co2' } }),
    ])
    expect(withCover?.cover).toEqual({ id: 'co1', width: 600, height: 800 })
    expect(without?.cover).toBeUndefined()
  })
})

describe('image addresses', () => {
  it('builds an address on IGDB’s image servers, always WebP', () => {
    expect(imageUrl('co1vcn', 'cover_big')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1vcn.webp',
    )
  })

  it('refuses an id that is not an IGDB image id', () => {
    expect(() => imageUrl('../../etc/passwd', 'cover_big')).toThrow()
    expect(() => imageUrl('co1vcn?x=1', 'cover_big')).toThrow()
    expect(() => imageUrl('', 'cover_big')).toThrow()
  })

  it('offers a cover at four widths', () => {
    const { src, srcSet } = coverSources('co1vcn')
    expect(src).toContain('/t_cover_big/')
    expect(srcSet.split(', ').map((entry) => entry.split(' ')[1])).toEqual([
      '90w',
      '180w',
      '264w',
      '528w',
    ])
  })

  it('can leave the largest file out, for covers drawn small', () => {
    const { src, srcSet } = coverSources('co1vcn', 'cover_big')
    expect(src).toContain('/t_cover_big/')
    expect(srcSet).not.toContain('528w')
    expect(coverSources('co1vcn', 'cover_small_2x').src).toContain('/t_cover_small_2x/')
  })

  it('offers a screenshot at three widths', () => {
    expect(screenshotSources('sc1').srcSet).toContain(`${imageSizes.screenshot_huge.width}w`)
  })
})
