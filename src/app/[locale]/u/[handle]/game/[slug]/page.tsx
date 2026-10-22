import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { preconnect } from 'react-dom'

import { imageUrl, IMAGE_HOST } from '@/domain/igdb/images'
import { videoGameData } from '@/domain/library/game-page'
import { BackToLibrary, LibraryLink } from '@/features/game-detail/back-to-library'
import { GameDetail } from '@/features/game-detail/game-detail'
import { GameMissing } from '@/features/game-detail/game-missing'
import { GameSkeleton } from '@/features/game-detail/game-skeleton'
import { PrivateGame } from '@/features/game-detail/private-game'
import { NoShelf } from '@/features/library/no-shelf'
import { ShelfProvider } from '@/features/library/shelf'
import { findLibrary, getGamePage } from '@/server/services/library'
import { siteUrl } from '@/server/site-url'

import { NO_HANDLE, shelfInfoOf } from '../../shelf-info'

/**
 * No game's page is built ahead: each is built on its first visit, from
 * the shell built here, and kept until its library changes. Next.js 16.4
 * answers a client navigation to a page built ahead with a 404 once a change
 * has expired it, until its HTML has been asked for once; a page built on a
 * visit has no such trouble. Cache Components needs one path to build the
 * shell from, and `none` is no game's and no shelf's.
 */
export function generateStaticParams() {
  return [{ handle: NO_HANDLE, slug: 'none' }]
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/u/[handle]/game/[slug]'>): Promise<Metadata> {
  const { handle, slug } = await params
  const library = await findLibrary(handle)
  const page = library?.public ? await getGamePage(library.id, slug) : undefined
  if (!page) {
    const t = await getTranslations('Game')
    return { title: t('metaNotFound'), robots: { index: false, follow: false } }
  }
  const { game, facts } = page
  return {
    title: game.title,
    description: facts.summary?.slice(0, 300),
    openGraph: game.cover ? { images: [imageUrl(game.cover, 'cover_big_2x')] } : undefined,
  }
}

/**
 * The game, by its shelf's handle and its slug: its page, a private shelf's
 * frame for its own account to fill, or a page saying there is no such game
 * or shelf. Not `notFound()`: on a route built ahead, Next.js would draw
 * that only in the browser.
 */
async function GameFrame({
  params,
}: Pick<PageProps<'/[locale]/u/[handle]/game/[slug]'>, 'params'>) {
  const { locale, handle, slug } = await params
  const library = await findLibrary(handle)
  if (!library) return <NoShelf />
  const shelf = shelfInfoOf(library)
  if (!library.public) {
    return (
      <ShelfProvider shelf={shelf}>
        <PrivateGame slug={slug} />
      </ShelfProvider>
    )
  }

  const page = await getGamePage(library.id, slug)
  if (!page) {
    return (
      <ShelfProvider shelf={shelf}>
        <GameMissing />
      </ShelfProvider>
    )
  }

  const data = videoGameData(page, `${siteUrl()}/${locale}/u/${library.handle}/game/${slug}`, {
    cover: (id) => imageUrl(id, 'cover_big_2x'),
    screenshot: (id) => imageUrl(id, 'screenshot_huge'),
  })
  const platforms = new Map(page.facts.names.platform.map((platform) => [platform.id, platform]))

  return (
    <ShelfProvider shelf={shelf}>
      <script
        type="application/ld+json"
        // Our own data, with `<` escaped so no text in it can close the script.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '<') }}
      />
      <GameDetail
        layout="page"
        handle={library.handle}
        game={page.game}
        tags={page.tags}
        platforms={platforms}
        facts={page.facts}
        above={
          <Suspense fallback={<LibraryLink handle={library.handle} />}>
            <BackToLibrary handle={library.handle} />
          </Suspense>
        }
        // For its account, once the browser knows it is theirs; every change is checked on the server.
        editable
      />
    </ShelfProvider>
  )
}

/**
 * A game's own page (spec 7.1), for an address opened directly. Opened from
 * the library, the same page is the panel over the shelf instead.
 */
export default function GamePage({ params }: PageProps<'/[locale]/u/[handle]/game/[slug]'>) {
  // Covers and key art come from IGDB's image servers: open the connection while the page arrives.
  preconnect(IMAGE_HOST)

  return (
    <Suspense fallback={<GameSkeleton />}>
      <GameFrame params={params} />
    </Suspense>
  )
}
