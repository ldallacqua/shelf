import { isGrouping, type Grouping } from '@/domain/library/group'
import { parseSort, writeSort } from '@/domain/library/sort'

/**
 * Smart shelves (spec 5.5): a named filter with a sort and a grouping. It
 * updates itself as the library changes, and has an address of its own:
 * `/en/shelves/{slug}`. The filter is kept as text, in the filter language,
 * so a shelf saved today still reads the same after the language grows.
 */

export type SmartShelf = {
  slug: string
  name: string
  /** The filter, as text. */
  query: string
  /** As in the address: `title`, `-rating`. */
  sort: string
  group: Grouping
}

/**
 * Present from day one, and editable (spec 5.5). They are written into the
 * database by a migration, once, so a new library has them, and by every
 * seed. Their names are the owner's to change, so they are kept as words,
 * not translated.
 */
export const STARTER_SHELVES: readonly SmartShelf[] = [
  {
    slug: 'playing-now',
    name: 'Playing now',
    query: 'status:playing',
    sort: 'title',
    group: 'none',
  },
  { slug: 'backlog', name: 'Backlog', query: 'status:backlog', sort: 'added', group: 'none' },
  {
    slug: 'short-ones',
    name: 'Short ones',
    query: 'status:backlog length:<10',
    sort: 'length',
    group: 'none',
  },
  {
    slug: 'on-the-shelf',
    name: 'On the shelf',
    query: 'format:physical',
    sort: 'title',
    group: 'platform',
  },
  { slug: 'favorites', name: 'Favorites', query: 'rating:>=9', sort: '-rating', group: 'none' },
  { slug: 'wishlist', name: 'Wishlist', query: 'status:wishlist', sort: 'title', group: 'none' },
]

/** A shelf's address from its name: lower case, hyphens, no accents. */
export const shelfSlug = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** A slug no other shelf has: `backlog`, then `backlog-2`, `backlog-3`. */
export const freeSlug = (name: string, taken: ReadonlySet<string>): string => {
  const base = shelfSlug(name) || 'shelf'
  if (!taken.has(base)) return base
  for (let count = 2; ; count += 1) {
    const slug = `${base}-${count}`
    if (!taken.has(slug)) return slug
  }
}

export const MAX_SHELF_NAME = 60

/** A shelf's sort and grouping as stored, made safe: anything unknown falls back to the default. */
export const cleanShelf = (shelf: SmartShelf): SmartShelf => ({
  ...shelf,
  sort: writeSort(parseSort(shelf.sort)),
  group: isGrouping(shelf.group) ? shelf.group : 'none',
})
