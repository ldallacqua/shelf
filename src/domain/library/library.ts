import type { Palette } from '@/domain/color/palette'
import type { Day, Format, Kind, Status } from '@/domain/library/values'
import type { CaseShape, Family, Plastic } from '@/domain/platforms/platforms'

/**
 * The library as every view reads it: one object per game, with everything a
 * shelf, a filter or a sort needs, and name tables for the ids. Summaries,
 * screenshots and notes are not here; a game's own page fetches those.
 */

export type LibraryCopy = {
  /** IGDB platform id. */
  platform: number
  format: Format
  /** Set when this copy is a version with its own cover (a port, a special edition). */
  cover?: string
}

export type LibraryGame = {
  /** The game's public address: `/game/{slug}`. Unique in the library. */
  slug: string
  title: string
  status: Status
  /** Mine, 0 to 100. */
  rating?: number
  addedOn: Day
  completedOn?: Day
  /** Minutes played: the larger of what I typed and what every source reports together. */
  minutes: number
  releasedOn?: Day
  year?: number
  /** IGDB's, 0 to 100. */
  igdbRating?: number
  igdbRatingCount: number
  /** Minutes for a normal playthrough. */
  length?: number
  kind: Kind
  /** IGDB image id. */
  cover?: string
  /** Width over height of the cover, times 100: 75 is a 3:4 cover. */
  coverRatio?: number
  colors?: Palette
  /** A ThumbHash of the cover, base64: about 25 bytes that become a blurred preview. */
  hash?: string
  featured: boolean
  /** True when there are notes a visitor may read. */
  hasNotes: boolean
  /** The copy shown when the game stands once is first. */
  copies: LibraryCopy[]
  genres: number[]
  themes: number[]
  modes: number[]
  perspectives: number[]
  /** Every platform the game was released on, across its versions. */
  platforms: number[]
  franchises: number[]
  series: number[]
  developers: number[]
  publishers: number[]
  /** Positions in `names.tag`. */
  tags: number[]
  /** On the wishlist, the platforms I want it on, the first standing for its case (spec 7.5). */
  wanted?: number[]
}

export type Named = { id: number; name: string; slug: string }

export type LibraryPlatform = {
  id: number
  key: string
  name: string
  short: string
  family: Family
  generation?: number
  shape: CaseShape
  plastic: Plastic
}

export type LibraryTag = { name: string; slug: string }

export type LibraryNames = {
  genre: Named[]
  theme: Named[]
  mode: Named[]
  perspective: Named[]
  franchise: Named[]
  series: Named[]
  company: Named[]
  platform: LibraryPlatform[]
  tag: LibraryTag[]
}

export type Library = {
  /** Raised by one on every write. The library file's address contains it. */
  version: number
  games: LibraryGame[]
  names: LibraryNames
}

export const emptyNames = (): LibraryNames => ({
  genre: [],
  theme: [],
  mode: [],
  perspective: [],
  franchise: [],
  series: [],
  company: [],
  platform: [],
  tag: [],
})

export const emptyLibrary = (version = 0): Library => ({ version, games: [], names: emptyNames() })
