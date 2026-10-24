import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Page } from '@/features/shell/page'
import { SetUpShelf } from '@/features/start/set-up-shelf'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Start')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/** Setting a new shelf up: built ahead as an empty frame, filled in the browser for whoever is signed in. */
export default async function StartPage() {
  const t = await getTranslations('Start')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <SetUpShelf />
    </Page>
  )
}
