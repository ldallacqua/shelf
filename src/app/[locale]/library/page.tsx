import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { IMAGE_HOST } from '@/domain/igdb/images'
import { buildFirstScreen, parseLibraryQuery } from '@/domain/library/view'
import { EmptyLibrary } from '@/features/library/empty-library'
import { LibrarySkeleton } from '@/features/library/library-skeleton'
import { LibraryView } from '@/features/library/library-view'
import { Page } from '@/features/shell/page'
import { getLibrary } from '@/server/services/library'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Library')
  return { title: t('metaTitle') }
}

/** Boxes sent with the page: about a screen of them. The rest come with the library file. */
const FIRST_BOXES = 48

/**
 * The part of the page that depends on the address: which view, grouped how.
 * It is rendered per request and streamed into the frame, which was built
 * ahead of time.
 */
async function FirstScreen({ searchParams }: Pick<PageProps<'/[locale]/library'>, 'searchParams'>) {
  const query = parseLibraryQuery(await searchParams)
  const [library, locale] = await Promise.all([getLibrary(), getLocale()])
  if (library.games.length === 0) return <EmptyLibrary />

  const first = buildFirstScreen(library, query, locale, FIRST_BOXES)
  return (
    // Lets the library keep its view and grouping in the address. Only this
    // page needs it, so only this page carries its code.
    <NuqsAdapter>
      <LibraryView first={first} firstGroup={query.group} />
    </NuqsAdapter>
  )
}

export default function LibraryPage({ searchParams }: PageProps<'/[locale]/library'>) {
  // Covers come from IGDB's image servers. Opening the connection now, while
  // the page is still arriving, saves the first cover about three round trips.
  preconnect(IMAGE_HOST)

  return (
    <Page>
      <Suspense fallback={<LibrarySkeleton />}>
        <FirstScreen searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}
