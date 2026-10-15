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
import { getGamePage, getLibrary } from '@/server/services/library'
import { siteUrl } from '@/server/site-url'

/**
 * Every game in the library has its page built with the site. A game added
 * since gets its page on its first visit, and keeps it. With Cache
 * Components there must be at least one, so an empty library offers an
 * address that then says there is no game there.
 */
export async function generateStaticParams() {
  const { games } = await getLibrary()
  return games.length > 0 ? games.map((game) => ({ slug: game.slug })) : [{ slug: 'none' }]
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/game/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const page = await getGamePage(slug)
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
 * The game, by its slug: its page, or a page saying there is no such game.
 * Not `notFound()`: on a route built ahead, Next.js would draw that only in
 * the browser.
 */
async function GameFrame({ params }: Pick<PageProps<'/[locale]/game/[slug]'>, 'params'>) {
  const { locale, slug } = await params
  const page = await getGamePage(slug)
  if (!page) return <GameMissing />

  const data = videoGameData(page, `${siteUrl()}/${locale}/game/${slug}`, {
    cover: (id) => imageUrl(id, 'cover_big_2x'),
    screenshot: (id) => imageUrl(id, 'screenshot_huge'),
  })
  const platforms = new Map(page.facts.names.platform.map((platform) => [platform.id, platform]))

  return (
    <>
      <script
        type="application/ld+json"
        // Our own data, with `<` escaped so no text in it can close the script.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }}
      />
      <GameDetail
        layout="page"
        game={page.game}
        tags={page.tags}
        platforms={platforms}
        facts={page.facts}
        above={
          <Suspense fallback={<LibraryLink />}>
            <BackToLibrary />
          </Suspense>
        }
      />
    </>
  )
}

/**
 * A game's own page (spec 7.1), for an address opened directly. Opened from
 * the library, the same page is the panel over the shelf instead.
 */
export default function GamePage({ params }: PageProps<'/[locale]/game/[slug]'>) {
  // Covers and key art come from IGDB's image servers: open the connection while the page arrives.
  preconnect(IMAGE_HOST)

  return (
    <Suspense fallback={<GameSkeleton />}>
      <GameFrame params={params} />
    </Suspense>
  )
}
