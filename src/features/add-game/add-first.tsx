'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useShelf } from '@/features/library/shelf'
import { useIsMine } from '@/features/owner/account'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { openAddGame } from './add-button'

/**
 * The empty library's actions, on one's own shelf (spec 3.10): add a game,
 * or bring a whole library in from a platform, on the page that sets a new
 * shelf up. There is nothing for a visitor to do.
 */
export function AddFirstGame() {
  const t = useTranslations('Add')
  if (!useIsMine(useShelf().handle)) return null
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" onClick={openAddGame}>
        <PlusIcon aria-hidden="true" />
        {t('first')}
      </Button>
      <Button variant="secondary" asChild>
        <Link href="/account/start">{t('bringIn')}</Link>
      </Button>
    </div>
  )
}
