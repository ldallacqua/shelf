'use client'

import { LockIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { useEffect, useState } from 'react'

import type { Library } from '@/domain/library/library'
import type { SmartShelf } from '@/domain/library/shelves'
import {
  buildFirstScreen,
  FIRST_BOXES,
  FIRST_BOXES_PHONE,
  parseLibraryQuery,
} from '@/domain/library/view'
import type { ShelfActions } from '@/features/filters/shelf-controls'
import { useAccount } from '@/features/owner/account'
import { Link } from '@/i18n/navigation'

import { EmptyLibrary } from './empty-library'
import { LibrarySkeleton } from './library-skeleton'
import { LibraryView } from './library-view'
import { PrivateShelf } from './private-shelf'
import { useShelf } from './shelf'
import { StatsLine } from './stats-line'
import { loadMine } from './use-library'

/** One's own library and smart shelves, fetched fresh: nothing of a private shelf is kept anywhere. */
const loadOwn = async (): Promise<{ library: Library; shelves: SmartShelf[] }> => {
  const [library, answer] = await Promise.all([
    loadMine(),
    fetch('/api/v1/me/shelves', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`The shelves answered ${response.status}`)
      return response.json() as Promise<{ shelves: SmartShelf[] }>
    }),
  ])
  return { library, shelves: answer.shelves }
}

/** "Only you can see this shelf", above one's own private shelf, with the way to change it. */
function OnlyYou() {
  const t = useTranslations('Library')
  return (
    <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-line px-3 py-2 text-sm text-muted">
      <LockIcon aria-hidden="true" className="size-4 flex-none" />
      {t('onlyYou')}
      <Link href="/account" className="text-text underline underline-offset-4">
        {t('changeVisibility')}
      </Link>
    </p>
  )
}

/** One's own private library, built in the browser from what `/api/v1/me/…` answers. */
function MyLibrary({
  smart,
  name,
  actions,
}: {
  smart?: string
  name: string
  actions: ShelfActions
}) {
  const locale = useLocale()
  const params = useSearchParams()
  const [own, setOwn] = useState<{ library: Library; shelves: SmartShelf[] }>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    loadOwn()
      .then((loaded) => current && setOwn(loaded))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [])

  if (failed) throw new Error('Your library could not be read.')
  if (!own) return <LibrarySkeleton title={name} />
  const shelf = smart ? own.shelves.find((each) => each.slug === smart) : undefined
  if (smart && !shelf) return <PrivateShelf missing />
  if (own.library.games.length === 0) return <EmptyLibrary />

  const query = parseLibraryQuery({
    ...Object.fromEntries(params),
    q: params.get('q') ?? shelf?.query,
    sort: params.get('sort') ?? shelf?.sort,
    group: params.get('group') ?? shelf?.group,
  })
  // A phone shows fewer boxes at once; the rest follow in a moment, as on a public shelf.
  const boxes = window.matchMedia('(width < 40rem)').matches ? FIRST_BOXES_PHONE : FIRST_BOXES
  const first = buildFirstScreen(own.library, query, locale, boxes)
  return (
    <>
      <OnlyYou />
      <NuqsAdapter>
        <LibraryView
          first={first}
          stats={<StatsLine stats={first.stats} />}
          shelves={own.shelves}
          shelf={shelf}
          actions={actions}
        />
      </NuqsAdapter>
    </>
  )
}

/**
 * A private shelf's library, or one of its smart shelves (ADR 004). Its page
 * is a frame with nothing of the library in it; for its own account the
 * browser fills it in, and anyone else is told the shelf is private.
 */
export function PrivateLibrary({ smart, actions }: { smart?: string; actions: ShelfActions }) {
  const account = useAccount()
  const { handle } = useShelf()
  if (account.status === 'checking') return <LibrarySkeleton />
  if (account.status !== 'signed-in' || account.handle !== handle) return <PrivateShelf />
  return <MyLibrary smart={smart} name={account.name} actions={actions} />
}
