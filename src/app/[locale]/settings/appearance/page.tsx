import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AppearanceSettings } from '@/features/settings/appearance'
import { SettingsFrame } from '@/features/settings/settings-frame'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings')
  return { title: t('pages.appearance.title'), robots: { index: false, follow: false } }
}

/** Appearance: this device's, whole when built, for anyone. */
export default async function AppearancePage() {
  const t = await getTranslations('Settings')
  return (
    <SettingsFrame current="appearance" title={t('pages.appearance.title')}>
      <AppearanceSettings />
    </SettingsFrame>
  )
}
