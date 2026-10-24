import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PlaceGames } from '@/features/placing/place-games'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Placing')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/**
 * Placing the games a sync brought in (spec 4.5): built ahead as an empty
 * frame, filled in the browser for whoever is signed in.
 */
export default async function UnsortedPage() {
  const t = await getTranslations('Placing')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <PlaceGames />
    </Page>
  )
}
