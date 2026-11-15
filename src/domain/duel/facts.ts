import type { LibraryGame, LibraryNames } from '@/domain/library/library'
import type { Day, Format } from '@/domain/library/values'

/**
 * What a duel sets side by side (spec 3.14): what tells two games apart when choosing what to play
 * next, from what the library file knows. One fact a row, the same rows for every duel, in one
 * order: how long each takes to beat, how IGDB rates it, how long each has waited, how far I got,
 * then what each is. A row neither game has anything for is left out; a row one game lacks says so on
 * its side. Nothing is called better: a shorter game is not a better one, so the facts are set
 * side by side and the choice stays mine.
 */

export type Pair<T> = [T | undefined, T | undefined]

export type MeasuredFact =
  | {
      key: 'length'
      /** Minutes for a normal playthrough, and IGDB's hasty one where it is shorter. */
      values: Pair<{ minutes: number; hasty?: number }>
      shares: [number, number]
    }
  | { key: 'score'; values: Pair<{ rating: number; count: number }>; shares: [number, number] }
  | { key: 'waiting'; values: Pair<{ days: number }>; shares: [number, number] }
  | { key: 'played'; values: Pair<{ minutes: number }>; shares: [number, number] }

export type DescribedFact =
  | { key: 'released'; values: Pair<{ year: number }> }
  | {
      key: 'platforms'
      /** Where I own it, copy by copy; or, for a game on my wishlist, where I want it. */
      values: Pair<{ owned: { platform: string; format: Format }[] } | { wanted: string[] }>
    }
  | { key: 'genres'; values: Pair<{ names: string[] }> }
  | { key: 'modes'; values: Pair<{ names: string[] }> }

export type Fact = MeasuredFact | DescribedFact

export const isMeasured = (fact: Fact): fact is MeasuredFact => 'shares' in fact

/** How many genres a side lists: past three, a game's genres stop telling it apart. */
const MOST_NAMES = 3

const DAY = 24 * 60 * 60 * 1000

/** Whole days from one calendar day to another, never fewer than none. */
export const daysBetween = (from: Day, to: Day): number =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY))

/** Each side's bar, as a share of the larger of the two, so the longer bar is always full. */
const sharesOf = (a: number | undefined, b: number | undefined): [number, number] => {
  const most = Math.max(a ?? 0, b ?? 0)
  return most > 0 ? [(a ?? 0) / most, (b ?? 0) / most] : [0, 0]
}

const named = (ids: readonly number[], table: LibraryNames['genre']): string[] =>
  ids
    .map((id) => table.find((each) => each.id === id)?.name)
    .filter((name): name is string => name !== undefined)
    .slice(0, MOST_NAMES)

const nonEmpty = <T>(list: T[]): T[] | undefined => (list.length > 0 ? list : undefined)

/** The facts of two games side by side, in the rows' order, each with something on one side. */
export function factsOf(
  [a, b]: readonly [LibraryGame, LibraryGame],
  names: LibraryNames,
  today: Day,
): Fact[] {
  const platformName = (id: number) =>
    names.platform.find((each) => each.id === id)?.short ?? undefined
  const both = <T>(read: (game: LibraryGame) => T | undefined): Pair<T> => [read(a), read(b)]

  const length = both((game) =>
    game.length && game.length > 0
      ? {
          minutes: game.length,
          ...(game.hastyShare && game.hastyShare < 100
            ? { hasty: Math.round((game.length * game.hastyShare) / 100) }
            : {}),
        }
      : undefined,
  )
  const score = both((game) =>
    game.igdbRating === undefined
      ? undefined
      : { rating: game.igdbRating, count: game.igdbRatingCount },
  )
  const waiting = both((game) => ({ days: daysBetween(game.addedOn, today) }))
  const played = both((game) => (game.minutes > 0 ? { minutes: game.minutes } : undefined))
  const released = both((game) => (game.year === undefined ? undefined : { year: game.year }))
  const platforms = both((game) => {
    if (game.status === 'wishlist') {
      const wanted = nonEmpty(
        (game.wanted ?? []).map(platformName).filter((name): name is string => name !== undefined),
      )
      return wanted ? { wanted } : undefined
    }
    const owned = game.copies.flatMap(({ platform, format }) => {
      const name = platformName(platform)
      return name ? [{ platform: name, format }] : []
    })
    return owned.length > 0 ? { owned } : undefined
  })
  const genres = both((game) => {
    const list = nonEmpty(named(game.genres, names.genre))
    return list ? { names: list } : undefined
  })
  const modes = both((game) => {
    const list = nonEmpty(named(game.modes, names.mode))
    return list ? { names: list } : undefined
  })

  const facts: Fact[] = [
    {
      key: 'length',
      values: length,
      shares: sharesOf(length[0]?.minutes, length[1]?.minutes),
    },
    {
      key: 'score',
      values: score,
      shares: [(score[0]?.rating ?? 0) / 100, (score[1]?.rating ?? 0) / 100],
    },
    { key: 'waiting', values: waiting, shares: sharesOf(waiting[0]?.days, waiting[1]?.days) },
    { key: 'played', values: played, shares: sharesOf(played[0]?.minutes, played[1]?.minutes) },
    { key: 'released', values: released },
    { key: 'platforms', values: platforms },
    { key: 'genres', values: genres },
    { key: 'modes', values: modes },
  ]
  return facts.filter(({ values }) => values[0] !== undefined || values[1] !== undefined)
}
