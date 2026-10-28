'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { useExperimental } from '@/features/library/use-preference'
import { Switch } from '@/ui/checkbox'

/**
 * The 3D shelf and the compact one, offered or not (issue 63). A choice of
 * this device, not of the account: it is kept in this browser, beside the
 * other choices of how the shelf looks here.
 */
export function ExperimentalViews() {
  const t = useTranslations('AccountPage.experimental')
  const [experimental, setExperimental] = useExperimental()
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
          checked={experimental === 'on'}
          aria-describedby={bodyId}
          onChange={(event) => setExperimental(event.target.checked ? 'on' : 'off')}
        />
        <label htmlFor={switchId} className="text-sm font-medium">
          {t('label')}
        </label>
      </div>
    </section>
  )
}
