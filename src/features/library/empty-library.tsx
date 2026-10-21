import { useTranslations } from 'next-intl'

import { AddFirstGame } from '@/features/add-game/add-first'
import { EmptyLedge } from '@/features/shell/empty-ledge'

/** The library before any game is on it: a visitor reads that it is coming; the owner can begin. */
export function EmptyLibrary() {
  const t = useTranslations('Library')

  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <EmptyLedge
        label={t('shelfLabel')}
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={<AddFirstGame />}
      />
    </>
  )
}
