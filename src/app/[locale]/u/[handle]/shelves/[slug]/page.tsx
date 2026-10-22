import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { removeShelfAction, saveShelfAction } from '@/app/actions/shelves'
import { IMAGE_HOST } from '@/domain/igdb/images'
import { ShelfMissing } from '@/features/filters/shelf-missing'
import { LibrarySkeleton } from '@/features/library/library-skeleton'
import { NoShelf } from '@/features/library/no-shelf'
import { PrivateLibrary } from '@/features/library/private-library'
import { ShelfProvider } from '@/features/library/shelf'
import { Page } from '@/features/shell/page'
import { findLibrary, getLibrary } from '@/server/services/library'
import { getShelf } from '@/server/services/shelves'

import { LibraryFirstScreen } from '../../first-screen'
import { NO_HANDLE, shelfInfoOf } from '../../shelf-info'

/** Built on its first visit, as every page of a shelf is (`shelf-info.ts`). */
export function generateStaticParams() {
  return [{ handle: NO_HANDLE, slug: 'none' }]
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/u/[handle]/shelves/[slug]'>): Promise<Metadata> {
  const { handle, slug } = await params
  const library = await findLibrary(handle)
  const shelf = library?.public ? await getShelf(library.id, slug) : undefined
  if (shelf) return { title: shelf.name }
  const t = await getTranslations('Shelves')
  return { title: t('notFound'), robots: { index: false, follow: false } }
}

/**
 * One smart shelf, by its library's handle, its slug and the address.
 * Without a shelf at that slug, it says so. A private library's is drawn in
 * its own account's browser (ADR 004).
 */
async function ShelfFrame({
  params,
  searchParams,
}: Pick<PageProps<'/[locale]/u/[handle]/shelves/[slug]'>, 'params' | 'searchParams'>) {
  const { handle, slug } = await params
  const library = await findLibrary(handle)
  if (!library) return <NoShelf />
  const info = shelfInfoOf(library)
  if (!library.public) {
    return (
      <ShelfProvider shelf={info}>
        <PrivateLibrary
          smart={slug}
          actions={{ save: saveShelfAction, remove: removeShelfAction }}
        />
      </ShelfProvider>
    )
  }
  const shelf = await getShelf(library.id, slug)
  return (
    <ShelfProvider shelf={info}>
      {shelf ? (
        <Suspense fallback={<LibrarySkeleton title={shelf.name} />}>
          <LibraryFirstScreen
            searchParams={searchParams}
            libraryId={library.id}
            library={getLibrary(library.id)}
            shelf={shelf}
          />
        </Suspense>
      ) : (
        <ShelfMissing />
      )}
    </ShelfProvider>
  )
}

/**
 * A smart shelf (spec 5.5): a library with a stored filter, sort and
 * grouping, at an address of its own. It shows the same games to everyone
 * who may see its library.
 */
export default function ShelfPage({
  params,
  searchParams,
}: PageProps<'/[locale]/u/[handle]/shelves/[slug]'>) {
  preconnect(IMAGE_HOST)

  return (
    <Page>
      <Suspense fallback={<LibrarySkeleton />}>
        <ShelfFrame params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}
