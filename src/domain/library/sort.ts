import type { LibraryGame } from '@/domain/library/library'

/**
 * Ordering games. This step has the one order every shelf starts in: by
 * title. The other sort keys from the spec (section 6) join it at step 5.
 */

/** A leading article is ignored: "The Witcher 3" files under W. */
const ARTICLE = /^(the|an|a)\s+/i

/** The text a title is filed under. */
export const titleKey = (title: string): string => title.trim().replace(ARTICLE, '')

const collators = new Map<string, Intl.Collator>()

/** Follows the language's alphabet, ignores case and accents, and reads "2" before "10". */
const collatorFor = (locale: string): Intl.Collator => {
  let collator = collators.get(locale)
  if (!collator) {
    collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
    collators.set(locale, collator)
  }
  return collator
}

/**
 * Games in title order. Same-titled games (Resident Evil 4, twice) go oldest
 * first, and the slug settles anything still tied, so the order never
 * depends on the order the games arrived in.
 */
export const sortByTitle = <Game extends Pick<LibraryGame, 'title' | 'slug' | 'year'>>(
  games: readonly Game[],
  locale: string,
): Game[] => {
  const collator = collatorFor(locale)
  return games
    .map((game) => ({ game, key: titleKey(game.title) }))
    .sort(
      (a, b) =>
        collator.compare(a.key, b.key) ||
        (a.game.year ?? Infinity) - (b.game.year ?? Infinity) ||
        (a.game.slug < b.game.slug ? -1 : a.game.slug > b.game.slug ? 1 : 0),
    )
    .map((item) => item.game)
}
