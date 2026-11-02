import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { pageTabClass } from '@/ui/page-tab'

const tabs = [
  { key: 'account', href: '/account' },
  { key: 'settings', href: '/account/settings' },
] as const

/**
 * Who I am, and how Shelf behaves here (spec 2): each a page of its own, as Organize's tabs are. Drawn
 * before anyone is known, so the page doesn't move once they are.
 */
export function AccountTabs({ current }: { current: (typeof tabs)[number]['key'] }) {
  const t = useTranslations('AccountPage.tabs')
  return (
    <nav aria-label={t('label')} className="mt-6 border-b border-line">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.key} className="flex">
            <Link
              href={tab.href}
              aria-current={tab.key === current ? 'page' : undefined}
              className={pageTabClass}
            >
              {t(tab.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
