import type { Library, LibraryGame } from '@/domain/library/library'
import { sortByTitle } from '@/domain/library/sort'
import { libraryStats } from '@/domain/library/stats'
import type { Status } from '@/domain/library/values'

/** What a trophy shows (spec 3.9): the cover under its own light, the title, the day, the hours, my rating. */
export type Trophy = Pick<
  LibraryGame,
  'slug' | 'title' | 'year' | 'cover' | 'colors' | 'hash' | 'completedOn' | 'minutes' | 'rating'
>

/** The games finished in one year; without a year, the ones whose day was never recorded. */
export type TrophyYear = { year?: number; trophies: Trophy[] }

export type TrophyStats = {
  finished: number
  /** Finished in `year`. */
  thisYear: number
  /** The year it was when the wall was worked out. */
  year: number
  /** Whole hours played, across the whole library. */
  hours: number
  /** Of every rating given, finished or not, out of 100. */
  averageRating?: number
  /** Of the games started, how many were finished, from 0 to 1. */
  finishedShare?: number
  longest?: { slug: string; title: string; minutes: number }
  /** By the hours on each game's main copy: the library does not split a game's hours by copy. */
  platform?: { id: number; name: string; minutes: number }
}

export type TrophyWall = { stats: TrophyStats; years: TrophyYear[] }

/** Begun, whether or not finished: backlog and wishlist games are not. */
const STARTED: ReadonlySet<Status> = new Set(['playing', 'completed', 'dropped'])

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
})

const statsOf = (library: Library, finished: readonly LibraryGame[], year: number): TrophyStats => {
  const { hours } = libraryStats(library.games)
  const ratings = library.games.flatMap((game) => (game.rating === undefined ? [] : [game.rating]))
  const started = library.games.filter((game) => STARTED.has(game.status)).length

  let longest: TrophyStats['longest']
  for (const game of finished) {
    if (game.minutes > (longest?.minutes ?? 0)) {
      longest = { slug: game.slug, title: game.title, minutes: game.minutes }
    }
  }

  const byPlatform = new Map<number, number>()
  for (const game of library.games) {
    const main = game.copies[0]
    if (main && game.minutes > 0) {
      byPlatform.set(main.platform, (byPlatform.get(main.platform) ?? 0) + game.minutes)
    }
  }
  let platform: TrophyStats['platform']
  for (const [id, minutes] of byPlatform) {
    const named = library.names.platform.find((each) => each.id === id)
    if (named && minutes > (platform?.minutes ?? 0)) {
      platform = { id, name: named.name, minutes }
    }
  }

  return {
    finished: finished.length,
    thisYear: finished.filter((game) => game.completedOn?.startsWith(`${year}-`)).length,
    year,
    hours,
    averageRating:
      ratings.length > 0
        ? ratings.reduce((sum, each) => sum + each, 0) / ratings.length
        : undefined,
    finishedShare: started > 0 ? finished.length / started : undefined,
    longest,
    platform,
  }
}

/**
 * The trophy wall (spec 3.9): every finished game, grouped by the year it
 * was finished, newest first, and the stats above it. `year` is this year,
 * passed in so the same library always makes the same wall.
 */
export const trophyWall = (library: Library, year: number, locale = 'en'): TrophyWall => {
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
  if (undated.length > 0) years.push({ trophies: undated.map(trophyOf) })

  return { stats: statsOf(library, finished, year), years }
}
