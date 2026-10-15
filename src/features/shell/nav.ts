import type { Pathname } from '@/i18n/routing'

/** The destinations in the main navigation, in order, with the other pages that belong to each. */
export const navItems = [
  // A smart shelf is the library with a filter kept, and a game is one of its
  // games, so both are in the library too.
  { href: '/library', label: 'library', under: ['/shelves', '/game'] },
  { href: '/trophies', label: 'trophies', under: [] },
] as const satisfies readonly { href: Pathname; label: string; under: readonly string[] }[]

export type NavItem = (typeof navItems)[number]

/** Whether the visitor is on this destination, or on a page under it. */
export function isCurrent(item: NavItem, pathname: string | undefined): boolean {
  if (pathname === undefined) return false
  return [item.href, ...item.under].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  )
}
