'use client'

import { MenuIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { useAccount } from '@/features/owner/account'
import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

import { isCurrent, navItems, placingItem } from './nav'
import { useNavHandle, useOwnHandle, useOwnWaiting } from './nav-handle'
import { WaitingCount } from './waiting-count'

type MenuProps = { handle?: string; pathname?: string; className?: string }

function Menu({ handle, pathname, className }: MenuProps) {
  const t = useTranslations('Shell')
  const account = useTranslations('Account')
  // Signed in, the account menu beside this one has the way out; a visitor's ways in are here.
  const visitor = useAccount().status === 'visitor'
  const waiting = useOwnWaiting(handle)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('menu')} className={className}>
          <MenuIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {handle
          ? navItems.map((item) => (
              <DropdownMenuItem key={item.label} asChild>
                <Link
                  href={item.href(handle)}
                  aria-current={isCurrent(item, pathname) ? 'page' : undefined}
                >
                  {t(item.label)}
                </Link>
              </DropdownMenuItem>
            ))
          : null}
        {waiting === undefined ? null : (
          <DropdownMenuItem asChild>
            <Link
              href={placingItem.href}
              aria-current={isCurrent(placingItem, pathname) ? 'page' : undefined}
            >
              {t(placingItem.label)}
              <WaitingCount count={waiting} />
            </Link>
          </DropdownMenuItem>
        )}
        {visitor ? (
          <>
            {handle ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem asChild>
              <Link href="/sign-up">{account('createShelf')}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/sign-in">{account('signIn')}</Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuForPage({ className }: { className?: string }) {
  return <Menu handle={useNavHandle()} pathname={usePathname()} className={className} />
}

function MenuForAccount({ className }: { className?: string }) {
  return <Menu handle={useOwnHandle()} className={className} />
}

/**
 * On a phone the main links fold into one menu button, with a visitor's
 * ways in. Until the address is known, the menu shows one's own shelf, with
 * no link marked as current.
 */
export function MobileNav({ className }: { className?: string }) {
  return (
    <Suspense fallback={<MenuForAccount className={className} />}>
      <MenuForPage className={className} />
    </Suspense>
  )
}
