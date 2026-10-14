import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { IMAGE_HOST } from '@/domain/igdb/images'
import { STARTER_SHELVES } from '@/domain/library/shelves'
import { ShelfMissing } from '@/features/filters/shelf-missing'
import { LibrarySkeleton } from '@/features/library/library-skeleton'
import { Page } from '@/features/shell/page'
import { getLibrary } from '@/server/services/library'
import { getShelf, getShelves } from '@/server/services/shelves'

import { LibraryFirstScreen } from '../../library/first-screen'

/**
 * The shelves there are when the site is built have their frame built
 * ahead; a new one, on its first visit. With Cache Components there must be
 * at least one, so a library with no shelves offers a starter's address,
 * which then says there is no shelf there.
 */
export async function generateStaticParams() {
  const slugs = (await getShelves()).map((shelf) => ({ slug: shelf.slug }))
  return slugs.length > 0 ? slugs : [{ slug: STARTER_SHELVES[0]!.slug }]
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/shelves/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const shelf = await getShelf(slug)
  if (shelf) return { title: shelf.name }
  const t = await getTranslations('Shelves')
  return { title: t('notFound'), robots: { index: false, follow: false } }
}

/** One smart shelf, by its slug and the address. Without a shelf at that slug, it says so. */
async function ShelfFirstScreen({
  params,
  searchParams,
}: Pick<PageProps<'/[locale]/shelves/[slug]'>, 'params' | 'searchParams'>) {
  const { slug } = await params
  const shelf = await getShelf(slug)
  if (!shelf) return <ShelfMissing />
  return <LibraryFirstScreen searchParams={searchParams} library={getLibrary()} shelf={shelf} />
}

/**
 * A smart shelf (spec 5.5): the library with a stored filter, sort and
 * grouping, at an address of its own. It shows the same games to everyone.
 */
export default function ShelfPage({ params, searchParams }: PageProps<'/[locale]/shelves/[slug]'>) {
  preconnect(IMAGE_HOST)

  return (
    <Page>
      <Suspense fallback={<LibrarySkeleton />}>
        <ShelfFirstScreen params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}
