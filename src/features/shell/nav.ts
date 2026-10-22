import { libraryHref, trophiesHref } from '@/features/library/shelf-address'
import type { Pathname } from '@/i18n/routing'

/**
 * The destinations in the main navigation, in order, each a page of a shelf
 * (ADR 004), with the other pages that belong to it. The header links to the
 * shelf in the address, or, elsewhere, to one's own.
 */
export const navItems = [
  // A smart shelf is the library with a filter kept, and a game is one of its
  // games, so both are in the library too.
  {
    label: 'library',
    href: libraryHref,
    pages: ['/u/[handle]', '/u/[handle]/shelves/[slug]', '/u/[handle]/game/[slug]'],
  },
  { label: 'trophies', href: trophiesHref, pages: ['/u/[handle]/trophies'] },
] as const satisfies readonly {
  label: string
  href: (handle: string) => { pathname: Pathname }
  pages: readonly Pathname[]
}[]

export type NavItem = (typeof navItems)[number]

/** Whether the visitor is on this destination, or on a page under it, by the page's pathname template. */
export function isCurrent(item: NavItem, pathname: string | undefined): boolean {
  return pathname !== undefined && (item.pages as readonly string[]).includes(pathname)
}
