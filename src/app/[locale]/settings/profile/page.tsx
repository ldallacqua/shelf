import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ProfileSettings } from '@/features/owner/account-settings'
import { SettingsFrame } from '@/features/settings/settings-frame'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings')
  return { title: t('pages.profile.title'), robots: { index: false, follow: false } }
}

/** Profile: built ahead as its ghosts, filled in the browser for whoever is signed in. */
export default async function ProfilePage() {
  const t = await getTranslations('Settings')
  return (
    <SettingsFrame current="profile" title={t('pages.profile.title')}>
      <ProfileSettings />
    </SettingsFrame>
  )
}
