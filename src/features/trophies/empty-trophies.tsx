import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'

/** The trophy wall before any game is finished. */
export function EmptyTrophies() {
  const t = useTranslations('Trophies')

  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <EmptyLedge label={t('shelfLabel')} title={t('emptyTitle')} body={t('emptyBody')} />
    </>
  )
}
