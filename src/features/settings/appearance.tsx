'use client'

import { CheckIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { ExperimentalViews } from '@/features/owner/experimental-views'
import { BlackSwitch } from '@/features/theme/black-switch'
import { ColorwayPicker } from '@/features/theme/colorway-picker'
import { ThemePicker } from '@/features/theme/theme-picker'
import { Link } from '@/i18n/navigation'
import { localeLabels, routing } from '@/i18n/routing'
import { buttonVariants } from '@/ui/button'
import { cn } from '@/ui/cn'

import { SECTIONS, SettingsSection } from './settings-section'

/**
 * Appearance (issue 152): how Shelf looks on this device. The theme and the language are also the
 * header's switches, and stay there; here they sit with the colors (issue 206) and the views this
 * device offers. Nothing here is the account's, so the page is whole for anyone, signed in or not.
 */
export function AppearanceSettings() {
  const t = useTranslations('Settings')
  const locale = useLocale()
  return (
    <div className={SECTIONS}>
      <SettingsSection title={t('theme.title')} scope="device">
        <p className="max-w-xl text-pretty text-muted">{t('theme.body')}</p>
        <ThemePicker className="w-fit" />
        <BlackSwitch />
      </SettingsSection>
      <SettingsSection id="colors" title={t('colors.title')} scope="device">
        <p id="colors-body" className="max-w-xl text-pretty text-muted">
          {t('colors.body')}
        </p>
        <ColorwayPicker labelledBy="colors-title" describedBy="colors-body" className="max-w-3xl" />
      </SettingsSection>
      <SettingsSection title={t('language.title')} scope="device">
        <p className="max-w-xl text-pretty text-muted">{t('language.body')}</p>
        <ul className="flex flex-wrap gap-2">
          {routing.locales.map((each) => {
            const current = each === locale
            return (
              <li key={each}>
                <Link
                  href="/settings/appearance"
                  locale={each}
                  hrefLang={each}
                  lang={each}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    buttonVariants({ variant: current ? 'secondary' : 'ghost' }),
                    current && 'border-accent',
                  )}
                >
                  {current ? <CheckIcon aria-hidden="true" /> : null}
                  {localeLabels[each].name}
                  {current ? <span className="sr-only">{t('language.current')}</span> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </SettingsSection>
      <ExperimentalViews />
    </div>
  )
}
