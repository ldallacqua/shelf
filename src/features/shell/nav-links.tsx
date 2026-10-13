'use client'

import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/ui/cn'

import { isCurrent, navItems } from './nav'

function NavList({ pathname }: { pathname?: string }) {
  const t = useTranslations('Shell')

  return (
    <ul className="flex h-full items-stretch gap-1">
      {navItems.map((item) => (
        <li key={item.href} className="flex">
          <Link
            href={item.href}
            aria-current={isCurrent(item, pathname) ? 'page' : undefined}
            className={cn(
              'relative flex items-center rounded-control px-3 text-sm font-medium text-muted',
              'transition-colors duration-quick ease-settle hover:text-text',
              'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:opacity-0',
              'after:shadow-[0_0_calc(var(--glow)*12px)_var(--accent)]',
              'aria-[current=page]:text-text aria-[current=page]:after:opacity-100',
            )}
          >
            {t(item.label)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function NavListForPage() {
  return <NavList pathname={usePathname()} />
}

/**
 * The header's links, with the current page marked by a lit line.
 * Until the address is known, the links show with none marked.
 */
export function NavLinks() {
  return (
    <Suspense fallback={<NavList />}>
      <NavListForPage />
    </Suspense>
  )
}
