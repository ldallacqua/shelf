import type { Palette } from '@/domain/color/palette'
import type { Library, LibraryGame } from '@/domain/library/library'
import { COMMUNITY_FROM } from '@/domain/library/trophy-taste'
import type { Day } from '@/domain/library/values'

/**
 * What is still to play, on the trophy page (issue 68's backlog): the
 * backlog, the games I mean to play, and beside it Someday, the games I may
 * play after it. How long it is comes from IGDB's time for a normal
 * playthrough, less the hours already played: an estimate, and said as one.
 * How soon it could be cleared comes from my own hours, those of the games I
 * finished in the last twelve months. Games a sync brought in and nobody
 * placed are neither, and only counted.
 *
 * Not here: how the backlog grew. A game's day in the library is the day it
 * came to Shelf, not the day it was bought, so no shelf has that history yet.
 */

/** How many games each of the backlog's lists shows. */
export const BACKLOG_SHOWN = 6

/** How many genres and platforms what is waiting is counted by. */
export const BACKLOG_RANKED = 5

/** A game waiting, as the backlog's lists show it. */
export type WaitingGame = {
  slug: string
  title: string
  cover?: string
  colors?: Palette
  hash?: string
  year?: number
  /** IGDB's minutes for a normal playthrough, less those played; absent when IGDB has no time. */
  left?: number
  /** IGDB's, 0 to 100, once enough of its players rated it. */
  igdbRating?: number
}

/** How many games waiting are of one genre or on one platform. */
export type WaitingCount = {
  id: number
  name: string
  /** Its value in the filter language: `genre:{slug}`, `owned:{slug}`. */
  slug: string
  games: number
}

export type BacklogStats = {
  /** In the backlog: games I mean to play. */
  backlog: number
  /** Someday: games I may play one day, after the backlog. */
  someday: number
  /** Brought by a sync and not placed yet: in neither. */
  unsorted: number
  /** Of the backlog, those already played a while. */
  begun: number
  /** Minutes left across the backlog's games IGDB has a time for: its estimate. */
  left: number
  /** How many of the backlog's games that estimate is of. */
  timed: number
  /** Minutes played on the games finished in the twelve months to today. */
  pace: number
  /** Months to finish the backlog at that pace, rounded up: an estimate, when both are known. */
  months?: number
  /** The backlog's games with the least left, by IGDB's time. */
  quickest: WaitingGame[]
  /** What is waiting, best rated by IGDB's players first. */
  bestRated: WaitingGame[]
  /** What is waiting, released longest ago first. */
  oldest: WaitingGame[]
  genres: WaitingCount[]
  platforms: WaitingCount[]
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** Minutes left of a game by IGDB's time: none when IGDB has none, nothing when played past it. */
const leftOf = (game: LibraryGame): number | undefined =>
  game.length === undefined ? undefined : Math.max(0, game.length - game.minutes)

const ratedOf = (game: LibraryGame): number | undefined =>
  game.igdbRatingCount >= COMMUNITY_FROM ? game.igdbRating : undefined

const waitingOf = (game: LibraryGame): WaitingGame => {
  const left = leftOf(game)
  const rating = ratedOf(game)
  return {
    slug: game.slug,
    title: game.title,
    ...(game.cover ? { cover: game.cover } : {}),
    ...(game.colors ? { colors: game.colors } : {}),
    ...(game.hash ? { hash: game.hash } : {}),
    ...(game.year === undefined ? {} : { year: game.year }),
    ...(left === undefined ? {} : { left }),
    ...(rating === undefined ? {} : { igdbRating: rating }),
  }
}

const byTitle = (a: LibraryGame, b: LibraryGame) => a.title.localeCompare(b.title)

/** The waiting games counted by each of their ids, most first, then by name. */
const countBy = (
  games: readonly LibraryGame[],
  idsOf: (game: LibraryGame) => readonly number[],
  names: ReadonlyMap<number, { name: string; slug: string }>,
): WaitingCount[] => {
  const counts = new Map<number, number>()
  for (const game of games) {
    // A game owned twice on one platform counts once there.
    for (const id of new Set(idsOf(game))) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts]
    .flatMap(([id, count]) => {
      const named = names.get(id)
      return named ? [{ id, name: named.name, slug: named.slug, games: count }] : []
    })
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, BACKLOG_RANKED)
}

/**
 * The backlog of a library, `today` being the day the twelve months of pace
 * end on. None when nothing is in the backlog or Someday.
 */
export const backlogOf = (library: Library, today?: Day): BacklogStats | undefined => {
  const backlog = library.games.filter((game) => game.status === 'backlog')
  const someday = library.games.filter((game) => game.status === 'someday')
  if (backlog.length === 0 && someday.length === 0) return undefined
  const waiting = [...backlog, ...someday]

  const timed = backlog.filter((game) => game.length !== undefined)
  const left = timed.reduce((sum, game) => sum + leftOf(game)!, 0)
  const end = today === undefined ? undefined : Date.parse(`${today}T00:00:00Z`)
  const pace =
    end === undefined
      ? 0
      : library.games
          .filter((game) => {
            if (game.status !== 'completed' || game.completedOn === undefined) return false
            const on = Date.parse(`${game.completedOn}T00:00:00Z`)
            return on <= end && on > end - YEAR_MS
          })
          .reduce((sum, game) => sum + game.minutes, 0)

  const quickest = timed
    // A game played past IGDB's time has no end it can say.
    .filter((game) => leftOf(game)! > 0)
    .sort((a, b) => leftOf(a)! - leftOf(b)! || byTitle(a, b))
  const bestRated = waiting
    .filter((game) => ratedOf(game) !== undefined)
    .sort((a, b) => ratedOf(b)! - ratedOf(a)! || byTitle(a, b))
  const oldest = waiting
    .filter((game) => game.year !== undefined)
    // By the year, then the day where both have one: a year alone says nothing of its month.
    .sort(
      (a, b) =>
        a.year! - b.year! ||
        (a.releasedOn && b.releasedOn ? a.releasedOn.localeCompare(b.releasedOn) : 0) ||
        byTitle(a, b),
    )

  const genres = new Map(library.names.genre.map((each) => [each.id, each]))
  const platforms = new Map(
    library.names.platform.map((each) => [each.id, { name: each.name, slug: each.key }]),
  )
  return {
    backlog: backlog.length,
    someday: someday.length,
    unsorted: library.games.filter((game) => game.status === 'unsorted').length,
    begun: backlog.filter((game) => game.minutes > 0).length,
    left,
    timed: timed.length,
    pace,
    ...(left > 0 && pace > 0 ? { months: Math.ceil((left / pace) * 12) } : {}),
    quickest: quickest.slice(0, BACKLOG_SHOWN).map(waitingOf),
    bestRated: bestRated.slice(0, BACKLOG_SHOWN).map(waitingOf),
    oldest: oldest.slice(0, BACKLOG_SHOWN).map(waitingOf),
    genres: countBy(waiting, (game) => game.genres, genres),
    platforms: countBy(waiting, (game) => game.copies.map((copy) => copy.platform), platforms),
  }
}
