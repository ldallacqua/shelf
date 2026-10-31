'use client'

import { LibraryBigIcon, LogOutIcon, SettingsIcon, UserRoundIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { libraryHref } from '@/features/library/shelf-address'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tip } from '@/ui/tooltip'
import { cn } from '@/ui/cn'

import { signOut, useAccount } from './account'

/** The menu's button's place, as a ghost: plain, as `Ghost` would put its module in every page's script. */
const GHOST = 'ghost size-10 flex-none rounded-control pointer-coarse:size-11'

/**
 * The header's right end (ADR 004). Signed in: a menu with one's own shelf,
 * the account page and the way out. A visitor: the ways in, which fold into
 * the phone's menu on a narrow screen. While the browser is asking who is
 * signed in, a ghost the size of the button, so nothing moves. Built ahead
 * for a visitor, it swaps the ways in for that ghost before the first paint
 * where the browser has signed in.
 */
export function AccountMenu() {
  const t = useTranslations('Account')
  const library = useTranslations('Library')
  const account = useAccount()
  const router = useRouter()

  if (account.status === 'checking') {
    return <span className={GHOST} />
  }
  if (account.status === 'visitor') {
    return (
      <>
        <span className={cn(GHOST, 'hidden hinted:block')} />
        <div className="ml-1 hidden items-center gap-1 sm:flex hinted:hidden">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">{t('signIn')}</Link>
          </Button>
          <Button variant="primary" size="sm" asChild>
            <Link href="/sign-up">{t('createShelf')}</Link>
          </Button>
        </div>
      </>
    )
  }

  return (
    <DropdownMenu>
      <Tip label={t('menuTip')} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('menu', { name: account.name })}>
            <UserRoundIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate">{account.name}</span>
          <span className="truncate font-normal text-muted">
            {library('atHandle', { handle: account.handle })}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={libraryHref(account.handle)}>
            <LibraryBigIcon aria-hidden="true" />
            {t('myShelf')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <SettingsIcon aria-hidden="true" />
            {t('settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            if (await signOut()) router.refresh()
          }}
        >
          <LogOutIcon aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
