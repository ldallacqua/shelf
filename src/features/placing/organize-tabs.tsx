'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { useAccount } from '@/features/owner/account'
import { useLibraryChange } from '@/features/owner/library-change'
import { Link } from '@/i18n/navigation'
import { cn } from '@/ui/cn'

/** Each tab of Organize: a list of my games with one thing to say of each (spec 4.5). */
const tabs = [
  { key: 'unsorted', href: '/account/unsorted' },
  { key: 'hours', href: '/account/hours' },
  { key: 'archived', href: '/account/archived' },
] as const

export type OrganizeTab = (typeof tabs)[number]['key']

const tabClass = cn(
  'relative flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium whitespace-nowrap text-muted',
  'transition-colors duration-quick ease-settle hover:text-text',
  // The lit line inside the tab's box: the row scrolls sideways on a phone, and a line past it would scroll too.
  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:opacity-0',
  'after:shadow-[0_0_calc(var(--glow)*12px)_var(--accent)]',
  'aria-[current=page]:text-text aria-[current=page]:after:opacity-100',
)

/**
 * How many games a tab's list holds, read here unless the page is that tab
 * and reads them itself. Read again when the library changes from this page:
 * a game archived from the unsorted tab joins the archived tab's count.
 */
function useListCount(address: string, given: number | undefined, own: boolean) {
  const [read, setRead] = useState<number>()
  const version = useLibraryChange()?.version
  useEffect(() => {
    if (own) return
    let current = true
    void fetch(address, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((answer: { games: unknown[] } | undefined) => {
        if (current && answer) setRead(answer.games.length)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [address, own, version])
  return own ? given : read
}

/**
 * Organize's tabs, each a page of its own, so a tab is an address and works
 * without a script. Each says how many games it holds, quietly: none of them
 * is an alarm, and the header's count is only of the games waiting for a
 * status. Only for one's own account, under its heading.
 */
export function OrganizeTabs({
  current,
  counts = {},
}: {
  current: OrganizeTab
  /** What the page knows already; the rest is read here. */
  counts?: Partial<Record<OrganizeTab, number>>
}) {
  const t = useTranslations('Placing.tabs')
  const format = useFormatter()
  const who = useAccount()
  const shown: Partial<Record<OrganizeTab, number>> = {
    unsorted: counts.unsorted ?? (who.status === 'signed-in' ? who.waiting : undefined),
    hours: useListCount('/api/v1/me/hours', counts.hours, current === 'hours'),
    archived: useListCount('/api/v1/me/archived', counts.archived, current === 'archived'),
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
                className={tabClass}
              >
                {t(tab.key)}
                {count ? (
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
