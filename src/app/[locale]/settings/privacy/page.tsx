import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PrivacySettings } from '@/features/owner/account-settings'
import { SettingsFrame } from '@/features/settings/settings-frame'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings')
  return { title: t('pages.privacy.title'), robots: { index: false, follow: false } }
}

/** Privacy and content: built ahead as its ghosts, filled in the browser for whoever is signed in. */
export default async function PrivacyPage() {
  const t = await getTranslations('Settings')
  return (
    <SettingsFrame current="privacy" title={t('pages.privacy.title')}>
      <PrivacySettings />
    </SettingsFrame>
  )
}
