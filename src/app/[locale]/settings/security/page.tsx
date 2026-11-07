import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { SecuritySettings } from '@/features/owner/account-settings'
import { SettingsFrame } from '@/features/settings/settings-frame'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings')
  return { title: t('pages.security.title'), robots: { index: false, follow: false } }
}

/** Security: built ahead as its ghosts, filled in the browser for whoever is signed in. */
export default async function SecurityPage() {
  const t = await getTranslations('Settings')
  return (
    <SettingsFrame current="security" title={t('pages.security.title')}>
      <SecuritySettings />
    </SettingsFrame>
  )
}
