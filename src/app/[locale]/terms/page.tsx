import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Page } from '@/features/shell/page'
import { Terms } from '@/features/shell/terms'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Terms')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

/** The terms for using Shelf: built ahead, the same for everyone. */
export default async function TermsPage() {
  const t = await getTranslations('Terms')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <Terms />
    </Page>
  )
}
