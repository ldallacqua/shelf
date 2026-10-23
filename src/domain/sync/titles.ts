import type { SearchResult } from '@/domain/igdb/search'
import { titleKeyOf } from '@/domain/library/bulk'

/**
 * The ladder's third rung (ADR 003, decision 1): a title from a source
 * matched to an IGDB record by name. It answers only when exactly one
 * candidate is the same title once both are bared, is on the source's
 * platforms, and agrees on the year where the source gives one. Anything
 * less is asked: a wrong match puts the wrong game on the shelf with my hours
 * on it, which is worse than asking.
 */

/** Trademark and similar signs, which stores add and IGDB leaves out. */
const MARKS = /[™®©℠]/g

/**
 * Words that name an edition only when "Edition" follows them: "Mario Kart 8
 * Deluxe" is its own record, "Deluxe Edition" is a box.
 */
const BEFORE_EDITION = [
  'definitive',
  'digital deluxe',
  'deluxe',
  'complete',
  'ultimate',
  'gold',
  'premium',
  'standard',
  'enhanced',
  'special',
  "collector['’]?s",
  'anniversary',
  'legendary',
  'royal',
]

/**
 * Edition words at the end of a title: the same game in a different box,
 * which IGDB keeps as an edition of the game. "Remastered" and "Remake" are
 * not among them: those are different records, and ADR 001 decides them.
 */
const EDITION = new RegExp(
  String.raw`[\s:–—(-]+(?:the\s+)?(?:(?:game of the year|goty)(?:\s+edition)?|director['’]?s\s+cut|(?:${BEFORE_EDITION.join('|')})\s+edition)\)?$`,
  'i',
)

/** A platform named at the end of a store's title: "(PC)", "for Windows", "- Windows 10 Edition". */
const PLATFORM_SUFFIX =
  /[\s:–—-]+(?:\((?:pc|windows|mac|linux)\)|(?:for\s+)?windows(?:\s+10)?(?:\s+edition)?|pc\s+edition)\s*$/i

/**
 * A title with its marks, edition words and platform suffix removed, as
 * written otherwise: what to ask IGDB for when the title itself finds
 * nothing. "Shadow of the Tomb Raider: Definitive Edition™" is "Shadow of
 * the Tomb Raider".
 */
export const strippedTitle = (title: string): string => {
  let rest = title.replace(MARKS, '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3; i += 1) {
    const next = rest.replace(PLATFORM_SUFFIX, '').replace(EDITION, '').trim()
    if (next === rest || next === '') break
    rest = next
  }
  return rest
}

/** A stripped title, compared as `titleKeyOf` compares: what the rung matches on. */
export const bareTitle = (title: string): string => titleKeyOf(strippedTitle(title))

export type TitleQuery = {
  title: string
  /** IGDB platform ids the game must be on. */
  platforms: readonly number[]
  year?: number
}

/**
 * The one candidate the rung accepts, or nothing. Candidates come from IGDB
 * with editions left out and ports folded in (`foldSearchHits`), so a port on
 * the source's platform counts through `alsoOn`.
 */
export const matchByTitle = (
  query: TitleQuery,
  candidates: readonly SearchResult[],
): SearchResult | undefined => {
  const wanted = bareTitle(query.title)
  if (!wanted) return undefined
  const fits = new Map<number, SearchResult>()
  for (const candidate of candidates) {
    if (bareTitle(candidate.title) !== wanted) continue
    const on = [...candidate.platforms, ...candidate.alsoOn]
    if (!query.platforms.some((platform) => on.includes(platform))) continue
    if (query.year !== undefined && candidate.year !== undefined && candidate.year !== query.year) {
      continue
    }
    fits.set(candidate.igdbId, candidate)
  }
  return fits.size === 1 ? [...fits.values()][0] : undefined
}
