'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/ui/button'
import { ShelfLabel } from '@/ui/ledge'
import { Segmented, SegmentedItem } from '@/ui/segmented'

const views = ['shelf', 'wall', 'list'] as const
type View = (typeof views)[number]

/** The controls Shelf is built from, in their real states. */
export function ControlsDemo() {
  const t = useTranslations('Foundations.controls')
  const [view, setView] = useState<View>('shelf')

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary">{t('primary')}</Button>
        <Button variant="secondary">{t('secondary')}</Button>
        <Button variant="ghost">{t('ghost')}</Button>
        <Button variant="secondary" disabled>
          {t('disabled')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Segmented aria-label={t('view')} value={view} onValueChange={setView}>
          {views.map((option) => (
            <SegmentedItem key={option} value={option}>
              {t(option)}
            </SegmentedItem>
          ))}
        </Segmented>
        <ShelfLabel count={38}>{t('shelfLabel')}</ShelfLabel>
      </div>
    </div>
  )
}
