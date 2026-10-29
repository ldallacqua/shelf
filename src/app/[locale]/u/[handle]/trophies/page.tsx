import type { Metadata } from 'next'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import type { AchievementLanguage } from '@/domain/achievements/achievements'
import { IMAGE_HOST } from '@/domain/igdb/images'
import { NoShelf } from '@/features/library/no-shelf'
import { ShelfProvider } from '@/features/library/shelf'
import { Page } from '@/features/shell/page'
import { PrivateTrophiesLater } from '@/features/trophies/private-later'
import { TrophiesSkeleton } from '@/features/trophies/trophies-skeleton'
import { EmptyTrophies } from '@/features/trophies/empty-trophies'
import { PublicTrophies } from '@/features/trophies/public-trophies'
import { TrophyWallView, type CardOf } from '@/features/trophies/trophy-wall'
import { wallAddress, type Which } from '@/features/trophies/wall-address'
import { getAchievementWall, languageOf } from '@/server/services/achievements'
import {
  findLibrary,
  getTrophyWall,
  trophyCardPath,
  type LibraryInfo,
} from '@/server/services/library'

import { NO_HANDLE, shelfInfoOf } from '../shelf-info'

/** Built on its first visit, as every page of a shelf is (`shelf-info.ts`). */
export function generateStaticParams() {
  return [{ handle: NO_HANDLE }]
}

/**
 * A public shelf's card for a page of its trophies (issue 68): of all time
 * or a year's recap. A filtered page has none: the card says the whole
 * period, and would say more than the page.
 */
const cardOf = async (
  library: LibraryInfo,
  locale: AchievementLanguage,
  which: Which,
  finished: number,
): Promise<CardOf | undefined> => {
  if (which.q !== undefined) return undefined
  const t = await getTranslations({ locale, namespace: 'Trophies.card' })
  const year = which.scope === undefined ? undefined : String(which.scope)
  return {
    src: trophyCardPath(library.key, locale, which.scope),
    alt: year
      ? t('altYear', { name: library.name, year, count: finished })
      : t('alt', { name: library.name, count: finished }),
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/[locale]/u/[handle]/trophies'>): Promise<Metadata> {
  const { handle, locale } = await params
  const library = await findLibrary(handle)
  const t = await getTranslations('Trophies')
  const shelf = await getTranslations('Library')
  const hidden = { index: false, follow: false }
  if (!library) return { title: shelf('noShelf.title'), robots: hidden }
  if (!library.public) return { title: shelf('privateTitle'), robots: hidden }
  const query = await searchParams
  // Asked at the request, as the page's own year is: the year turns.
  await connection()
  const which = wallAddress(query, new Date().getUTCFullYear())
  const wall = await getTrophyWall(library.id, which.scope, which.q, which.by)
  // What is shared is drawn without adult games, as the card is.
  const { finished } = wall.hidden ?? wall.stats
  const year = which.scope === undefined ? undefined : String(which.scope)
  const title = year
    ? t('shelfYearMetaTitle', { name: library.name, year })
    : t('shelfMetaTitle', { name: library.name })
  const description = year
    ? t('yearMetaDescription', { count: finished, name: library.name, year })
    : t('metaDescription', { count: finished, name: library.name })
  const card = await cardOf(library, languageOf(locale), which, finished)
  const picture = card && {
    url: card.src,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: card.alt,
  }
  return {
    title,
    description,
    ...(picture
      ? {
          openGraph: { type: 'website', title, description, images: [picture] },
          twitter: { card: 'summary_large_image', images: [picture] },
        }
      : {}),
    // An empty wall says nothing a search engine could use.
    ...(wall.stats.finished === 0 ? { robots: hidden } : {}),
  }
}

/**
 * Whose wall, by the handle in the address: its trophies, a private shelf's
 * frame, or no shelf. The year and the filter in the address say which
 * trophies, and the rarity which of their unlocks the vault keeps (issue 68).
 */
async function ShelfTrophies({
  params,
  searchParams,
}: Pick<PageProps<'/[locale]/u/[handle]/trophies'>, 'params' | 'searchParams'>) {
  const { handle, locale } = await params
  const query = await searchParams
  // Asked at the request: the year turns.
  await connection()
  const which = wallAddress(query, new Date().getUTCFullYear())
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
  const [wall, achievements] = await Promise.all([
    getTrophyWall(library.id, which.scope, which.q, which.by),
    getAchievementWall(library.id, languageOf(locale), {
      scope: which.scope,
      q: which.q,
      rarity: which.rarity,
    }),
  ])
  const asked = which.scope !== undefined || which.q !== undefined
  const card = await cardOf(
    library,
    languageOf(locale),
    which,
    (wall.hidden ?? wall.stats).finished,
  )
  return (
    <PublicTrophies handle={library.handle} which={which} card={card}>
      {wall.years.length === 0 && !asked ? (
        <EmptyTrophies />
      ) : (
        <TrophyWallView
          wall={wall}
          achievements={achievements}
          handle={library.handle}
          q={which.q}
          card={card}
        />
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
