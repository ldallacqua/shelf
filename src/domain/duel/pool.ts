import type { Library, LibraryGame } from '@/domain/library/library'
import type { Status } from '@/domain/library/values'

/**
 * The games a duel may be drawn from (spec 3.14): mine with one of the chosen statuses, without
 * the games for adults while this device hides them (spec 3.13), by title, as the library opens.
 */
export function poolOf(
  library: Library,
  from: readonly Status[],
  hideAdult: boolean,
  locale: string,
): LibraryGame[] {
  const chosen = new Set(from)
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return library.games
    .filter((game) => chosen.has(game.status) && !(hideAdult && game.adult))
    .sort((one, other) => collator.compare(one.title, other.title))
}

/** How many games of the library have each status a duel draws from, for the choice of where. */
export function countsOf(library: Library, hideAdult: boolean): Partial<Record<Status, number>> {
  const counts: Partial<Record<Status, number>> = {}
  for (const game of library.games) {
    if (hideAdult && game.adult) continue
    counts[game.status] = (counts[game.status] ?? 0) + 1
  }
  return counts
}
