'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { Switch } from '@/ui/checkbox'
import { cn } from '@/ui/cn'

import { useColorway } from './use-colorway'

/**
 * Pure black with the lights off, for OLED screens: a switch under the theme,
 * as it changes the dark theme of every colorway. Only the walls go fully
 * black; panels, shelves and lines stay a shade lighter, so depth still shows.
 */
export function BlackSwitch({ className }: { className?: string }) {
  const t = useTranslations('Settings.theme.black')
  const { black, setBlack } = useColorway()
  const id = useId()
  return (
    <div className={cn('grid max-w-xl gap-1.5', className)}>
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={black}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setBlack(event.target.checked)}
        />
        <label htmlFor={id} className="text-sm font-medium">
          {t('label')}
        </label>
      </div>
      <p id={`${id}-hint`} className="pl-13 text-xs text-pretty text-muted">
        {t('hint')}
      </p>
    </div>
  )
}
