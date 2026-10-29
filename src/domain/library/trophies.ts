import type { Library, LibraryGame } from '@/domain/library/library'
import { sortByTitle } from '@/domain/library/sort'
import { buildIndex, evaluate, gamesIn } from '@/domain/query/evaluate'
import { parseQuery } from '@/domain/query/parse'
import { statsOf, type TrophyStats } from '@/domain/library/trophy-stats'
import type { Measure } from '@/domain/library/trophy-taste'
import type { Day } from '@/domain/library/values'

export type { TrophyStats } from '@/domain/library/trophy-stats'

/** What a trophy shows (spec 3.9): the cover under its own light, the title, the day, the hours, my rating. */
export type Trophy = Pick<
  LibraryGame,
  | 'slug'
  | 'title'
  | 'year'
  | 'cover'
  | 'colors'
  | 'hash'
  | 'completedOn'
  | 'minutes'
  | 'rating'
  | 'adult'
>

/** The games finished in one year; without a year, the ones whose day was never recorded. */
export type TrophyYear = { year?: number; trophies: Trophy[] }

export type TrophyWall = {
  stats: TrophyStats
  years: TrophyYear[]
  /** When the library has adult games: the stats without them, for a device that hides them (spec 3.13). */
  hidden?: TrophyStats
}

const trophyOf = ({
  slug,
  title,
  year,
  cover,
  colors,
  hash,
  completedOn,
  minutes,
  rating,
  adult,
}: LibraryGame): Trophy => ({
  slug,
  title,
  year,
  cover,
  colors,
  hash,
  completedOn,
  minutes,
  rating,
  ...(adult ? { adult } : {}),
})

/** Which games a wall is of, and the day it is worked out on. */
export type WallOptions = {
  /** Only the games finished in this year. */
  scope?: number
  /** Only the games this filter matches, in the library's filter language (issue 68). */
  q?: string
  /** Today, for the months in a row with a game finished. */
  today?: Day
  /** What the kinds are ranked by; games finished when not said. */
  by?: Measure
}

/**
 * The games a filter matches, as a library of their own; the whole library
 * without one. A part of the filter that cannot be understood is left out,
 * as in the library. Keywords are not in the library file, so `keyword:`
 * matches nothing here.
 */
export const filterLibrary = (library: Library, q: string | undefined): Library => {
  const { tree } = parseQuery(q?.trim() ?? '')
  if (!tree) return library
  const index = buildIndex(library)
  return { ...library, games: gamesIn(index, evaluate(index, tree)) }
}

/**
 * The trophy wall (spec 3.9): every finished game, grouped by the year it
 * was finished, newest first, and the stats above it. `year` is this year,
 * passed in so the same library always makes the same wall.
 */
export const trophyWall = (
  library: Library,
  year: number,
  locale = 'en',
  options: WallOptions = {},
): TrophyWall => {
  library = filterLibrary(library, options.q)
  // Title order first, so games finished on the same day stay in it.
  const finished = sortByTitle(
    library.games.filter((game) => game.status === 'completed'),
    locale,
  )
  const dated = finished
    .filter((game) => game.completedOn !== undefined)
    .sort((a, b) =>
      a.completedOn! < b.completedOn! ? 1 : a.completedOn! > b.completedOn! ? -1 : 0,
    )

  const years: TrophyYear[] = []
  for (const game of dated) {
    const finishedIn = Number(game.completedOn!.slice(0, 4))
    const last = years.at(-1)
    if (last?.year === finishedIn) last.trophies.push(trophyOf(game))
    else years.push({ year: finishedIn, trophies: [trophyOf(game)] })
  }
  const undated = finished.filter((game) => game.completedOn === undefined)
  if (undated.length > 0 && options.scope === undefined)
    years.push({ trophies: undated.map(trophyOf) })

  const wall: TrophyWall = {
    stats: statsOf(library, finished, year, options),
    years:
      options.scope === undefined ? years : years.filter((each) => each.year === options.scope),
  }
  if (library.games.some((game) => game.adult)) {
    const games = library.games.filter((game) => !game.adult)
    wall.hidden = statsOf(
      { ...library, games },
      finished.filter((game) => !game.adult),
      year,
      options,
    )
  }
  return wall
}
