'use client'

import { MenuIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

import { isCurrent, navItems } from './nav'

type MenuProps = { pathname?: string; className?: string }

function Menu({ pathname, className }: MenuProps) {
  const t = useTranslations('Shell')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('menu')} className={className}>
          <MenuIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        {navItems.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} aria-current={isCurrent(item, pathname) ? 'page' : undefined}>
              {t(item.label)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuForPage({ className }: { className?: string }) {
  return <Menu pathname={usePathname()} className={className} />
}

/**
 * On a phone the main links fold into one menu button.
 * Until the address is known, the menu shows with no link marked as current.
 */
export function MobileNav({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Menu className={className} />}>
      <MenuForPage className={className} />
    </Suspense>
  )
}
