'use client'

import { InboxIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

/**
 * The line under the status row, on my own shelf while any game waits for a
 * status: how many, as the way to the page for placing them (spec 4.5). A
 * link, not a notice: it says what is true and goes when the last is placed.
 */
export function PlaceWaiting({ count }: { count: number }) {
  const t = useTranslations('Placing')
  return (
    <Button asChild variant="link" size="sm" className="h-auto min-h-6 justify-self-start px-0">
      <Link href="/account/unsorted">
        <InboxIcon aria-hidden="true" />
        {t('placeWaiting', { count })}
      </Link>
    </Button>
  )
}
