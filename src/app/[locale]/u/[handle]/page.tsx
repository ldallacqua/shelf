import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { removeShelfAction, saveShelfAction } from '@/app/actions/shelves'
import { IMAGE_HOST } from '@/domain/igdb/images'
import { LibrarySkeleton } from '@/features/library/library-skeleton'
import { NoShelf } from '@/features/library/no-shelf'
import { PrivateLibraryLater } from '@/features/library/private-later'
import { ShelfProvider } from '@/features/library/shelf'
import { Page } from '@/features/shell/page'
import { findLibrary, getLibrary } from '@/server/services/library'

import { LibraryFirstScreen } from './first-screen'
import { NO_HANDLE, shelfInfoOf } from './shelf-info'

export function generateStaticParams() {
  return [{ handle: NO_HANDLE }]
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/u/[handle]'>): Promise<Metadata> {
  const { handle } = await params
  const library = await findLibrary(handle)
  const t = await getTranslations('Library')
  if (!library) return { title: t('noShelf.title'), robots: { index: false, follow: false } }
  if (!library.public) return { title: t('privateTitle'), robots: { index: false, follow: false } }
  return { title: t('shelfTitle', { name: library.name }) }
}

/**
 * Whose shelf, by the handle in the address: its library, a private
 * shelf's frame, or a page saying there is no shelf here (ADR 004).
 */
async function ShelfLibrary({
  params,
  searchParams,
}: Pick<PageProps<'/[locale]/u/[handle]'>, 'params' | 'searchParams'>) {
  const { handle } = await params
  const library = await findLibrary(handle)
  if (!library) return <NoShelf />
  const shelf = shelfInfoOf(library)
  const t = await getTranslations('Library')
  return (
    <ShelfProvider shelf={shelf}>
      {library.public ? (
        <Suspense fallback={<LibrarySkeleton title={t('shelfTitle', { name: shelf.name })} />}>
          <LibraryFirstScreen
            searchParams={searchParams}
            libraryId={library.id}
            // The library is read here, and not awaited: the read is cached, so
            // its answer is kept with the built page, and a visit does not wait
            // for the database.
            library={getLibrary(library.id)}
          />
        </Suspense>
      ) : (
        <PrivateLibraryLater actions={{ save: saveShelfAction, remove: removeShelfAction }} />
      )}
    </ShelfProvider>
  )
}

export default function ShelfPage({ params, searchParams }: PageProps<'/[locale]/u/[handle]'>) {
  // Covers come from IGDB's image servers. Opening the connection now, while
  // the page is still arriving, saves the first cover about three round trips.
  preconnect(IMAGE_HOST)

  return (
    <Page>
      <Suspense fallback={<LibrarySkeleton />}>
        <ShelfLibrary params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}
