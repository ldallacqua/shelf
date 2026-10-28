import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { IMAGE_HOST } from '@/domain/igdb/images'
import { NoShelf } from '@/features/library/no-shelf'
import { ShelfProvider } from '@/features/library/shelf'
import { Page } from '@/features/shell/page'
import { PrivateTrophiesLater } from '@/features/trophies/private-later'
import { TrophiesSkeleton } from '@/features/trophies/trophies-skeleton'
import { EmptyTrophies } from '@/features/trophies/empty-trophies'
import { PublicTrophies } from '@/features/trophies/public-trophies'
import { TrophyWallView } from '@/features/trophies/trophy-wall'
import { wallAddress } from '@/features/trophies/wall-address'
import { findLibrary, getTrophyWall } from '@/server/services/library'

import { NO_HANDLE, shelfInfoOf } from '../shelf-info'

/** Built on its first visit, as every page of a shelf is (`shelf-info.ts`). */
export function generateStaticParams() {
  return [{ handle: NO_HANDLE }]
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/u/[handle]/trophies'>): Promise<Metadata> {
  const { handle } = await params
  const library = await findLibrary(handle)
  const t = await getTranslations('Trophies')
  const shelf = await getTranslations('Library')
  const hidden = { index: false, follow: false }
  if (!library) return { title: shelf('noShelf.title'), robots: hidden }
  if (!library.public) return { title: shelf('privateTitle'), robots: hidden }
  const { stats } = await getTrophyWall(library.id)
  return {
    title: t('shelfMetaTitle', { name: library.name }),
    description: t('metaDescription', { count: stats.finished, name: library.name }),
    // An empty wall says nothing a search engine could use.
    ...(stats.finished === 0 ? { robots: hidden } : {}),
  }
}

/**
 * Whose wall, by the handle in the address: its trophies, a private shelf's
 * frame, or no shelf. The year and the filter in the address say which
 * trophies (issue 68).
 */
async function ShelfTrophies({
  params,
  searchParams,
}: Pick<PageProps<'/[locale]/u/[handle]/trophies'>, 'params' | 'searchParams'>) {
  const { handle } = await params
  const which = wallAddress(await searchParams, new Date().getUTCFullYear())
  const library = await findLibrary(handle)
  if (!library) return <NoShelf />
  const shelf = shelfInfoOf(library)
  if (!library.public) {
    return (
      <ShelfProvider shelf={shelf}>
        <PrivateTrophiesLater which={which} />
      </ShelfProvider>
    )
  }
  const wall = await getTrophyWall(library.id, which.scope, which.q)
  const asked = which.scope !== undefined || which.q !== undefined
  return (
    <PublicTrophies handle={library.handle} which={which}>
      {wall.years.length === 0 && !asked ? (
        <EmptyTrophies />
      ) : (
        <TrophyWallView wall={wall} handle={library.handle} q={which.q} />
      )}
    </PublicTrophies>
  )
}

/** A shelf's trophy wall (spec 3.9). */
export default function TrophiesPage({
  params,
  searchParams,
}: PageProps<'/[locale]/u/[handle]/trophies'>) {
  // Covers come from IGDB's image servers: open the connection while the page arrives.
  preconnect(IMAGE_HOST)

  return (
    <Page>
      <Suspense fallback={<TrophiesSkeleton />}>
        <ShelfTrophies params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}
