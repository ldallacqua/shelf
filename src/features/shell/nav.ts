import type { Pathname } from '@/i18n/routing'

/** The destinations in the main navigation, in order. */
export const navItems = [
  { href: '/library', label: 'library' },
  { href: '/trophies', label: 'trophies' },
] as const satisfies readonly { href: Pathname; label: string }[]

export type NavItem = (typeof navItems)[number]

/** Whether the visitor is on this destination, or on a page under it. */
export function isCurrent(item: NavItem, pathname: string | undefined): boolean {
  if (pathname === undefined) return false
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
