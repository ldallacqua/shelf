import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AccountSettings } from '@/features/owner/account-settings'
import { AccountTabs } from '@/features/owner/account-tabs'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountPage')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/** One's account (ADR 004): built ahead as an empty frame, filled in the browser for whoever is signed in. */
export default async function AccountPage() {
  const t = await getTranslations('AccountPage')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <AccountTabs current="account" />
      <AccountSettings />
    </Page>
  )
}
