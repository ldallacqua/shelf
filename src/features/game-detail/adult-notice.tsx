'use client'

import { EyeIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { adultPreference, writePreference } from '@/features/library/preferences'
import { Button } from '@/ui/button'

/**
 * On an adult game's own page, while this device hides adult games (spec
 * 3.13): in place of its cover, art and screenshots, which CSS keeps hidden
 * from the first paint, what they are and a way to show them. Drawn for
 * every adult game; CSS shows it only while they are hidden.
 */
export function AdultNotice() {
  const t = useTranslations('Game')
  return (
    <div
      data-adult-notice=""
      className="mx-auto mt-4 flex w-full max-w-360 flex-wrap items-center gap-3 px-4 text-sm sm:px-6 lg:px-10"
    >
      <p className="text-pretty text-muted">{t('adultHidden')}</p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => writePreference(adultPreference, 'shown')}
      >
        <EyeIcon aria-hidden="true" />
        {t('showAdult')}
      </Button>
    </div>
  )
}
