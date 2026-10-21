'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useOwner } from '@/features/owner/owner'
import { Button } from '@/ui/button'

import { openAddGame } from './add-button'

/** The empty library's one action, for the owner (spec 3.10): there is nothing for a visitor to do. */
export function AddFirstGame() {
  const t = useTranslations('Add')
  if (useOwner().status !== 'owner') return null
  return (
    <Button variant="primary" onClick={openAddGame}>
      <PlusIcon aria-hidden="true" />
      {t('first')}
    </Button>
  )
}
