'use client'

import { useTranslations } from 'next-intl'

import { AddFirstGame } from '@/features/add-game/add-first'
import { useIsMine } from '@/features/owner/account'
import { EmptyLedge } from '@/features/shell/empty-ledge'

import { useShelf } from './shelf'

/**
 * The library before any game is on it, by whose shelf it is: a visitor
 * reads that it is coming; its own account can begin.
 */
export function EmptyLibrary() {
  const t = useTranslations('Library')
  const { handle, name } = useShelf()
  const mine = useIsMine(handle)

  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">
        {name ? t('shelfTitle', { name }) : t('title')}
      </h1>
      <EmptyLedge
        label={t('shelfLabel')}
        title={t(mine ? 'emptyMineTitle' : 'emptyTitle')}
        body={t(mine ? 'emptyMineBody' : 'emptyBody')}
        action={<AddFirstGame />}
      />
    </>
  )
}
