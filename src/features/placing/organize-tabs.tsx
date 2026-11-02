'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { useAccount } from '@/features/owner/account'
import { useLibraryChange } from '@/features/owner/library-change'
import { Link } from '@/i18n/navigation'
import { Ghost } from '@/ui/ghost'
import { pageTabClass } from '@/ui/page-tab'

/** Each tab of Organize: a list of my games with one thing to say of each (spec 4.5). */
const tabs = [
  { key: 'unsorted', href: '/account/unsorted' },
  { key: 'hours', href: '/account/hours' },
  { key: 'archived', href: '/account/archived' },
] as const

export type OrganizeTab = (typeof tabs)[number]['key']

/**
 * How many games a tab's list holds, read here unless the page is that tab
 * and reads them itself. Read again when the library changes from this page:
 * a game archived from the unsorted tab joins the archived tab's count. Never
 * read, it stays quiet as none: its ghost must not stay for good.
 */
function useListCount(address: string, wanted: boolean) {
  const [read, setRead] = useState<number>()
  const version = useLibraryChange()?.version
  useEffect(() => {
    if (!wanted) return
    let current = true
    void fetch(address, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((answer: { games: unknown[] } | undefined) => {
        const count = answer?.games.length
        if (current) setRead((now) => count ?? now ?? 0)
      })
      .catch(() => {
        if (current) setRead((now) => now ?? 0)
      })
    return () => {
      current = false
    }
  }, [address, wanted, version])
  return read
}

/**
 * Organize's tabs, each a page of its own, so a tab is an address and works
 * without a script. Each says how many games it holds, quietly: none of them
 * is an alarm, and the header's count is only of the games waiting for a
 * status. Only for one's own account, under its heading; while the browser
 * asks whose it is, or a count is read, a ghost holds the count's place.
 */
export function OrganizeTabs({
  current,
  counts = {},
}: {
  current: OrganizeTab
  /** What the page knows already, once it does; the rest is read here. */
  counts?: Partial<Record<OrganizeTab, number>>
}) {
  const t = useTranslations('Placing.tabs')
  const format = useFormatter()
  const who = useAccount('checking')
  const signedIn = who.status === 'signed-in'
  const hours = useListCount('/api/v1/me/hours', signedIn && current !== 'hours')
  const archived = useListCount('/api/v1/me/archived', signedIn && current !== 'archived')
  const shown: Partial<Record<OrganizeTab, number>> = {
    unsorted: counts.unsorted ?? (signedIn ? (who.waiting ?? 0) : undefined),
    hours: current === 'hours' ? counts.hours : hours,
    archived: current === 'archived' ? counts.archived : archived,
  }

  return (
    <nav aria-label={t('label')} className="mt-6 border-b border-line">
      <ul className="flex gap-1 overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => {
          const count = shown[tab.key]
          return (
            <li key={tab.key} className="flex">
              <Link
                href={tab.href}
                aria-current={tab.key === current ? 'page' : undefined}
                className={pageTabClass}
              >
                {t(tab.key)}
                {count === undefined ? (
                  <Ghost className="h-2.5 w-5" />
                ) : count ? (
                  <>
                    <span aria-hidden="true" className="readout text-[0.6875rem] text-muted">
                      {format.number(count)}
                    </span>
                    <span className="sr-only">{`, ${t('count', { count })}`}</span>
                  </>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
