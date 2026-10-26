import type { PlayableGame } from './editing'
import type { Library } from './library'

/**
 * Ready to play (spec 7.7): which of my games this computer can start. What
 * it has comes from Shelf for Windows; what each game may be, from Shelf.
 */

/** What this computer has: the entries whose chosen file is still there, and every Steam app installed. */
export type OnThisComputer = { entries: readonly string[]; steam: readonly string[] }

/** The addresses of my games ready to play here: a file chosen that is still there, or an app on Steam installed. */
export const readySlugs = (games: readonly PlayableGame[], here: OnThisComputer): Set<string> => {
  const files = new Set(here.entries)
  const steam = new Set(here.steam)
  return new Set(
    games
      .filter((game) => files.has(game.entryId) || game.steam.some((app) => steam.has(app)))
      .map((game) => game.slug),
  )
}

const kept = new WeakMap<Library, { slugs: ReadonlySet<string>; library: Library }>()

/**
 * The library with only the games ready here, before anything is drawn from
 * it, as `withoutAdult` leaves adult games out: no box, no count, no filter
 * value of another. The same object for the same two, so what is worked out
 * from it (its index, its shelves) is kept.
 */
export const onlyReady = (library: Library, slugs: ReadonlySet<string>): Library => {
  const known = kept.get(library)
  if (known?.slugs === slugs) return known.library
  const ready = { ...library, games: library.games.filter((game) => slugs.has(game.slug)) }
  kept.set(library, { slugs, library: ready })
  return ready
}
