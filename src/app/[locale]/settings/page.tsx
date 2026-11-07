import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SettingsHub } from '@/features/settings/settings-frame'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/**
 * Settings (issue 152): every page, by whose it is. A phone starts here and goes into a page; a
 * wide window shows the same list beside each page.
 */
export default async function SettingsPage() {
  const t = await getTranslations('Settings')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <p className="mt-4 max-w-xl text-pretty text-muted">{t('intro')}</p>
      <SettingsHub />
    </Page>
  )
}
