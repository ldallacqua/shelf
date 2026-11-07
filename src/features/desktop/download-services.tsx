'use client'

import { useTranslations } from 'next-intl'

import { SECTIONS, SettingsSection, titleClass } from '@/features/settings/settings-section'
import { cn } from '@/ui/cn'

import { AppWords } from './app-words'
import { RealDebrid } from './real-debrid'

function Body() {
  const t = useTranslations('AppSettings')
  return (
    <>
      <h1 className={titleClass}>{t('pages.download-services.title')}</h1>
      <div className={cn('mt-8', SECTIONS)}>
        <SettingsSection title={t('services.title')} scope="device">
          <p className="max-w-xl text-pretty text-muted">{t('services.intro')}</p>
          {/* One card each, all of the same shape: another service is one more item (issue 152). */}
          <ul className="grid gap-4">
            <li>
              <RealDebrid />
            </li>
          </ul>
        </SettingsSection>
      </div>
    </>
  )
}

/**
 * The services that download for me (ADR 007): Real-Debrid today, each one a card of the same
 * shape, connected on this computer alone. Fetched only in the app.
 */
export default function DownloadServices() {
  return (
    <AppWords>
      <Body />
    </AppWords>
  )
}
