import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { Consent, ConsentGhosts } from '@/features/owner/consent'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Consent')
  // Only ever reached in the middle of an assistant's sign-in: not a page to find.
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function ConsentPage() {
  const t = await getTranslations('Consent')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      {/* What the assistant asks for is in the address. */}
      <Suspense fallback={<ConsentGhosts />}>
        <Consent />
      </Suspense>
    </Page>
  )
}
