import { kindOf, type GameImage } from '@/domain/igdb/game'
import type { IgdbSearchHit } from '@/domain/igdb/schema'
import type { Kind } from '@/domain/library/values'

/**
 * Turns IGDB's raw search hits into the short list the add-game field shows
 * (spec, section 4.1): editions hidden, ports folded under their originals,
 * same-titled games told apart by year and platforms.
 */

export type SearchResult = {
  igdbId: number
  slug: string
  title: string
  year?: number
  kind: Kind
  cover?: GameImage
  /** Platforms the game itself was released on. */
  platforms: number[]
  /** Platforms it also reached through ports that were folded in. */
  alsoOn: number[]
  /** The ports folded into this result, so "in library" can match any of them. */
  ports: number[]
}

const toResult = (hit: IgdbSearchHit): SearchResult => {
  const result: SearchResult = {
    igdbId: hit.id,
    slug: hit.slug,
    title: hit.name.trim(),
    kind: kindOf(hit),
    platforms: [...new Set(hit.platforms)],
    alsoOn: [],
    ports: [],
  }
  if (hit.first_release_date !== undefined) {
    const year = new Date(hit.first_release_date * 1000).getUTCFullYear()
    if (year >= 1950 && year < 2100) result.year = year
  }
  if (hit.cover?.width && hit.cover.height) {
    result.cover = { id: hit.cover.image_id, width: hit.cover.width, height: hit.cover.height }
  }
  return result
}

export const MAX_SEARCH_RESULTS = 8

/**
 * IGDB's order is kept: it is IGDB's own relevance. A port whose original is
 * also among the hits disappears into it; a port whose original is not stays
 * as a result of its own, because it may be the only way to reach the game.
 */
export const foldSearchHits = (
  hits: readonly IgdbSearchHit[],
  limit = MAX_SEARCH_RESULTS,
): SearchResult[] => {
  const results = new Map<number, SearchResult>()
  const ports: IgdbSearchHit[] = []

  for (const hit of hits) {
    // An edition is the same game in a different box.
    if (hit.version_parent !== undefined) continue
    if (results.has(hit.id)) continue
    if (kindOf(hit) === 'port' && hit.parent_game !== undefined) ports.push(hit)
    results.set(hit.id, toResult(hit))
  }

  for (const port of ports) {
    const original = port.parent_game === undefined ? undefined : results.get(port.parent_game)
    if (!original) continue
    for (const platform of port.platforms) {
      if (!original.platforms.includes(platform) && !original.alsoOn.includes(platform)) {
        original.alsoOn.push(platform)
      }
    }
    original.ports.push(port.id)
    results.delete(port.id)
  }

  return [...results.values()].slice(0, limit)
}
