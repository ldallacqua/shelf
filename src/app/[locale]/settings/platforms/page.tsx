import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PlatformSettings } from '@/features/owner/account-settings'
import { SettingsFrame } from '@/features/settings/settings-frame'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings')
  return { title: t('pages.platforms.title'), robots: { index: false, follow: false } }
}

/** Platforms (ADR 003): built ahead as its ghosts, filled in the browser for whoever is signed in. */
export default async function PlatformsPage() {
  const t = await getTranslations('Settings')
  return (
    <SettingsFrame current="platforms" title={t('pages.platforms.title')}>
      <PlatformSettings />
    </SettingsFrame>
  )
}
