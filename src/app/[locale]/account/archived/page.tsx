import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Archived } from '@/features/placing/archived'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Placing')
  return { title: t('archived.metaTitle'), robots: { index: false, follow: false } }
}

/**
 * Organize's archived tab (spec 7.4): built ahead as an empty frame, filled
 * in the browser for whoever is signed in.
 */
export default async function ArchivedPage() {
  const t = await getTranslations('Placing')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <Archived />
    </Page>
  )
}
