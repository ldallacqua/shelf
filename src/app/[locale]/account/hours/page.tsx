import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { StoreHours } from '@/features/placing/store-hours'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Placing')
  return { title: t('storeHours.metaTitle'), robots: { index: false, follow: false } }
}

/**
 * Organize's hours tab (spec 4.7): built ahead as an empty frame, filled in
 * the browser for whoever is signed in.
 */
export default async function StoreHoursPage() {
  const t = await getTranslations('Placing')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <StoreHours />
    </Page>
  )
}
