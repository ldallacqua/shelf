'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useShelf } from '@/features/library/shelf'
import { useIsMine } from '@/features/owner/account'
import { Button } from '@/ui/button'

import { openAddGame } from './add-button'

/** The empty library's one action, on one's own shelf (spec 3.10): there is nothing for a visitor to do. */
export function AddFirstGame() {
  const t = useTranslations('Add')
  if (!useIsMine(useShelf().handle)) return null
  return (
    <Button variant="primary" onClick={openAddGame}>
      <PlusIcon aria-hidden="true" />
      {t('first')}
    </Button>
  )
}
