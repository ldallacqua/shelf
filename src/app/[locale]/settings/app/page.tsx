import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'

import { AppOnly } from '@/features/settings/app-only'
import { SettingsFrame } from '@/features/settings/settings-frame'
import en from '@messages/app/en.json'
import ptBR from '@messages/app/pt-BR.json'

export async function generateMetadata(): Promise<Metadata> {
  const words = (await getLocale()) === 'pt-BR' ? ptBR : en
  return {
    title: words.AppSettings.pages['app'].title,
    robots: { index: false, follow: false },
  }
}

/**
 * A page of Shelf for Windows' (issue 152): built ahead for everyone, it is drawn only in the app,
 * whose words and code it fetches there; a browser is told whose page it is.
 */
export default function AppPage() {
  return (
    <SettingsFrame current="app">
      <AppOnly page="app" />
    </SettingsFrame>
  )
}
