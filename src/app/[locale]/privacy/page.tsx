import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Page } from '@/features/shell/page'
import { Privacy } from '@/features/shell/privacy'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Privacy')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

/** What Shelf keeps about you: built ahead, the same for everyone. */
export default async function PrivacyPage() {
  const t = await getTranslations('Privacy')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <Privacy />
    </Page>
  )
}
