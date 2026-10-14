import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { IMAGE_HOST } from '@/domain/igdb/images'
import { LibrarySkeleton } from '@/features/library/library-skeleton'
import { Page } from '@/features/shell/page'
import { getLibrary } from '@/server/services/library'

import { LibraryFirstScreen } from './first-screen'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Library')
  return { title: t('metaTitle') }
}

export default function LibraryPage({ searchParams }: PageProps<'/[locale]/library'>) {
  // Covers come from IGDB's image servers. Opening the connection now, while
  // the page is still arriving, saves the first cover about three round trips.
  preconnect(IMAGE_HOST)

  // The library is read here, in the part of the page that is built ahead of
  // time, and not awaited: the read is cached, so its answer is kept with the
  // built page, and a visit does not wait for the database.
  const library = getLibrary()

  return (
    <Page>
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryFirstScreen searchParams={searchParams} library={library} />
      </Suspense>
    </Page>
  )
}
