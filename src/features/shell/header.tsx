import { useTranslations } from 'next-intl'

import type { AddActions } from '@/features/add-game/actions'
import { AddButton } from '@/features/add-game/add-button'
import { LanguageSwitch } from '@/features/language/language-switch'
import { AccountMenu } from '@/features/owner/account-menu'
import { ThemeSwitch } from '@/features/theme/theme-switch'
import { Link } from '@/i18n/navigation'
import { LogoMark } from '@/ui/logo'

import { HeaderSearch } from './header-search'
import { MobileNav } from './mobile-nav'
import { NavLinks } from './nav-links'

/**
 * The header on every page: the name, the links into the shelf in the
 * address (or one's own), search, theme and language, and the account's
 * menu. Signed in, Add, for one's own shelf.
 */
export function Header({ add }: { add?: AddActions }) {
  const t = useTranslations('Shell')
  const meta = useTranslations('Meta')

  return (
    // It stays in view while the page scrolls, so theme and language are always in reach.
    <header className="sticky top-0 z-40 border-b border-line/70 bg-wall/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-360 items-stretch gap-2 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          aria-label={t('home')}
          className="-ml-1 flex items-center gap-2 self-center rounded-control px-1 py-1 title text-lg"
        >
          <LogoMark />
          {meta('siteName')}
        </Link>

        <nav aria-label={t('mainNav')} className="ml-4 hidden sm:block">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-0.5">
          {add ? <AddButton actions={add} /> : null}
          <HeaderSearch />
          <ThemeSwitch />
          <LanguageSwitch />
          <AccountMenu />
          <MobileNav className="sm:hidden" />
        </div>
      </div>
    </header>
  )
}
