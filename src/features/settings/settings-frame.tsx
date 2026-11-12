import { ChevronLeftIcon, RotateCcwIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Page } from '@/features/shell/page'
import { Link } from '@/i18n/navigation'

import { AppGroupLater } from './app-group-later'
import { accountPages, appPages, devicePages, type AppPage, type PageKey } from './pages'
import { PageGroup, PageRow, SideGroup, SideLink } from './settings-links'
import { titleClass } from './settings-section'

const isAppPage = (key: PageKey | undefined): key is AppPage =>
  (appPages as readonly string[]).includes(key ?? '')

/**
 * Setting the shelf up again from its first step (spec 4.6): a page of its own, not a setting, so
 * it ends the account's group in both lists. The address names the first step, which the setup
 * opens on whatever this device remembers; nothing the steps chose is cleared.
 */
const SETUP_AGAIN = { pathname: '/account/start', hash: 'play' } as const

/** The side list beside each page on a wide window, the current page marked. */
export function SettingsNav({ current }: { current?: PageKey }) {
  const t = useTranslations('Settings')
  return (
    <nav aria-label={t('title')} className="grid gap-6">
      <SideGroup title={t('groups.account')}>
        {accountPages.map((page) => (
          <SideLink key={page.key} href={page.href} icon={page.icon} current={page.key === current}>
            {t(`pages.${page.key}.title`)}
          </SideLink>
        ))}
        <SideLink href={SETUP_AGAIN} icon={RotateCcwIcon} current={false}>
          {t('setupAgain.side')}
        </SideLink>
      </SideGroup>
      <SideGroup title={t('groups.device')}>
        {devicePages.map((page) => (
          <SideLink key={page.key} href={page.href} icon={page.icon} current={page.key === current}>
            {t(`pages.${page.key}.title`)}
          </SideLink>
        ))}
      </SideGroup>
      <AppGroupLater as="side" current={isAppPage(current) ? current : undefined} />
    </nav>
  )
}

/** Every page, by whose it is, with what each holds: where a phone starts, and an overview anywhere. */
export function SettingsHub() {
  const t = useTranslations('Settings')
  return (
    <div className="mt-8 grid gap-10">
      <PageGroup id="settings-account" title={t('groups.account')}>
        {accountPages.map((page) => (
          <PageRow
            key={page.key}
            href={page.href}
            icon={page.icon}
            title={t(`pages.${page.key}.title`)}
            description={t(`pages.${page.key}.description`)}
          />
        ))}
        <PageRow
          href={SETUP_AGAIN}
          icon={RotateCcwIcon}
          title={t('setupAgain.title')}
          description={t('setupAgain.description')}
        />
      </PageGroup>
      <PageGroup id="settings-device" title={t('groups.device')}>
        {devicePages.map((page) => (
          <PageRow
            key={page.key}
            href={page.href}
            icon={page.icon}
            title={t(`pages.${page.key}.title`)}
            description={t(`pages.${page.key}.description`)}
          />
        ))}
      </PageGroup>
      <AppGroupLater as="rows" />
    </div>
  )
}

/**
 * A settings page (issue 152): the side list beside it on a wide window; on a narrower one, the
 * way back to every page above its title, as a phone's settings lead from their list into a page
 * and back. Built ahead, like every page, and filled in for the account in the browser.
 */
export function SettingsFrame({
  current,
  title,
  children,
}: {
  current: PageKey
  /** Left out by Shelf for Windows' pages, which draw it with the app's words. */
  title?: ReactNode
  children: ReactNode
}) {
  const t = useTranslations('Settings')
  return (
    <Page className="pb-16">
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-12 xl:gap-x-16">
        <aside className="hidden lg:block">
          <div className="sticky top-14 pt-14">
            <SettingsNav current={current} />
          </div>
        </aside>
        <div className="max-w-3xl min-w-0">
          <Link
            href="/settings"
            className="mt-6 inline-flex min-h-6 items-center gap-1 rounded-control text-sm font-medium text-muted transition-colors duration-quick ease-settle hover:text-text lg:hidden"
          >
            <ChevronLeftIcon aria-hidden="true" className="size-4" />
            {t('title')}
          </Link>
          {title ? <h1 className={titleClass}>{title}</h1> : null}
          <div className={title ? 'mt-8' : undefined}>{children}</div>
        </div>
      </div>
    </Page>
  )
}
