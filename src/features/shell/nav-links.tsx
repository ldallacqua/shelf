'use client'

import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/ui/cn'

import { isCurrent, navItems, placingItem } from './nav'
import { useNavHandle, useOwnHandle, useOwnWaiting } from './nav-handle'
import { WaitingCount } from './waiting-count'

const linkClass = cn(
  'relative flex items-center rounded-control px-3 text-sm font-medium text-muted',
  'transition-colors duration-quick ease-settle hover:text-text',
  'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:opacity-0',
  'after:shadow-[0_0_calc(var(--glow)*12px)_var(--accent)]',
  'aria-[current=page]:text-text aria-[current=page]:after:opacity-100',
)

function NavList({ handle, pathname }: { handle?: string; pathname?: string }) {
  const t = useTranslations('Shell')
  const waiting = useOwnWaiting(handle)

  if (!handle) return null
  return (
    <ul className="flex h-full items-stretch gap-1">
      {navItems.map((item) => (
        <li key={item.label} className="flex">
          <Link
            href={item.href(handle)}
            aria-current={isCurrent(item, pathname) ? 'page' : undefined}
            className={linkClass}
          >
            {t(item.label)}
          </Link>
        </li>
      ))}
      {waiting === undefined ? null : (
        <li className="flex">
          <Link
            href={placingItem.href}
            aria-current={isCurrent(placingItem, pathname) ? 'page' : undefined}
            className={linkClass}
          >
            {t(placingItem.label)}
            <WaitingCount count={waiting} />
          </Link>
        </li>
      )}
    </ul>
  )
}

function NavListForPage() {
  return <NavList handle={useNavHandle()} pathname={usePathname()} />
}

function NavListForAccount() {
  return <NavList handle={useOwnHandle()} />
}

/**
 * The header's links into a shelf, with the current page marked by a lit
 * line; on one's own, a link on to placing the games that wait for a status,
 * counting them. Until the address is known, the links to one's own shelf
 * show, with none marked.
 */
export function NavLinks() {
  return (
    <Suspense fallback={<NavListForAccount />}>
      <NavListForPage />
    </Suspense>
  )
}
