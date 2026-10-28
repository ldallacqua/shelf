'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { useAdult } from '@/features/library/use-preference'
import { Switch } from '@/ui/checkbox'

/**
 * Adult games hidden or shown (spec 3.13). A choice of this device, not of
 * the account: it holds on every shelf seen in this browser. It is here, not
 * beside the shelf, so nothing on a shelf shows that anything is hidden.
 */
export function AdultGames() {
  const t = useTranslations('AccountPage.adult')
  const [adult, setAdult] = useAdult()
  const switchId = useId()
  const bodyId = useId()

  return (
    <section aria-labelledby={`${switchId}-title`} className="grid gap-5 border-t border-line pt-8">
      <h2 id={`${switchId}-title`} className="title text-xl sm:text-2xl">
        {t('title')}
      </h2>
      <p id={bodyId} className="max-w-xl text-pretty text-muted">
        {t('body')}
      </p>
      <div className="flex max-w-xl items-center gap-3">
        <Switch
          id={switchId}
          checked={adult === 'hidden'}
          aria-describedby={bodyId}
          onChange={(event) => setAdult(event.target.checked ? 'hidden' : 'shown')}
        />
        <label htmlFor={switchId} className="text-sm font-medium">
          {t('label')}
        </label>
      </div>
    </section>
  )
}
