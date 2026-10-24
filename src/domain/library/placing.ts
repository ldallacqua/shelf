import { z } from 'zod'

import type { Palette } from '@/domain/color/palette'
import type { PlatformLabel } from '@/domain/library/adding'
import { sortByTitle } from '@/domain/library/sort'
import { statuses, type Day, type Status, type SyncSource } from '@/domain/library/values'

/**
 * Placing what a sync brought in (spec 4.5): my unsorted games, with what
 * helps me say where each stands, and how many games stand in each status.
 * A game is placed by giving it a status; a rating alone leaves it waiting.
 */

/** What a source says of a game: its hours there, and when I last played it there. */
export type PlayedOn = {
  source: SyncSource
  minutes: number
  /** Milliseconds since 1970. */
  lastPlayedAt?: number
}

export type UnsortedGame = {
  entryId: string
  slug: string
  title: string
  year?: number
  /** IGDB image id. */
  cover?: string
  colors?: Palette
  hash?: string
  /** Mine, 0 to 100. */
  rating?: number
  addedOn: Day
  /** Minutes played, as the shelf counts them. */
  minutes: number
  /** The platforms of its copies, the shown one first. */
  platforms: number[]
  played: PlayedOn[]
}

export type Tally = Record<Status, number>

export type Placing = {
  version: number
  games: UnsortedGame[]
  /** Every game in the library, by status. */
  tally: Tally
  platforms: PlatformLabel[]
}

/** Where a game can be placed: every status but the one it waits in. */
export const placements = statuses.filter(
  (status): status is Exclude<Status, 'unsorted'> => status !== 'unsorted',
)

export const emptyTally = (): Tally =>
  Object.fromEntries(statuses.map((status) => [status, 0])) as Tally

/** Games moved from one status to another: the tally as it now stands. */
export const moveInTally = (tally: Tally, from: Status, to: Status, count = 1): Tally =>
  from === to ? tally : { ...tally, [from]: tally[from] - count, [to]: tally[to] + count }

/** How the list is ordered: longest played first, as Minimap opens. */
export const placingSorts = ['played', 'recent', 'title', 'added'] as const
export type PlacingSort = (typeof placingSorts)[number]

export const isPlacingSort = (value: unknown): value is PlacingSort =>
  typeof value === 'string' && (placingSorts as readonly string[]).includes(value)

/** When I last played it anywhere. */
export const lastPlayed = (game: Pick<UnsortedGame, 'played'>): number | undefined => {
  const times = game.played.flatMap((each) => each.lastPlayedAt ?? [])
  return times.length > 0 ? Math.max(...times) : undefined
}

/**
 * The list in one of its orders. Ties, and games a source never saw played,
 * go by title, so the order never depends on how the games arrived.
 */
export const sortUnsorted = <Game extends UnsortedGame>(
  games: readonly Game[],
  sort: PlacingSort,
  locale: string,
): Game[] => {
  const titled = sortByTitle(games, locale)
  if (sort === 'title') return titled
  const value = (game: Game): number =>
    sort === 'played'
      ? game.minutes
      : sort === 'recent'
        ? (lastPlayed(game) ?? -1)
        : Number(game.addedOn.replaceAll('-', ''))
  // A stable sort over the title order keeps titles in order within a tie.
  return titled.sort((a, b) => value(b) - value(a))
}

/** "Everything under an hour": games barely played, which are often the easiest to place. */
export const UNDER_AN_HOUR = 60

/** At most this many games are placed in one request. */
export const MAX_PLACED = 1000

/** Many games given one status at once, by their entries' ids. */
export const placeMany = z.object({
  entries: z.array(z.string().min(1).max(100)).min(1).max(MAX_PLACED),
  status: z.enum(statuses),
})

export type PlaceMany = z.infer<typeof placeMany>
