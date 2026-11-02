import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AppSettings } from '@/features/owner/account-settings'
import { AccountTabs } from '@/features/owner/account-tabs'
import { Page } from '@/features/shell/page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountPage')
  return { title: t('settingsTitle'), robots: { index: false, follow: false } }
}

/** How Shelf behaves here: built ahead as an empty frame, filled in the browser for whoever is signed in. */
export default async function SettingsPage() {
  const t = await getTranslations('AccountPage')
  return (
    <Page className="pb-16">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('settingsTitle')}</h1>
      <AccountTabs current="settings" />
      <AppSettings />
    </Page>
  )
}
