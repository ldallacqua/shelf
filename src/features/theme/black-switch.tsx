'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { Switch } from '@/ui/checkbox'
import { cn } from '@/ui/cn'

import { useColorway } from './use-colorway'

/** A switch named by its label and described by a line under it, as Appearance's are. */
export function SettingSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
  className,
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('grid max-w-xl gap-1.5', className)}>
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={checked}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      </div>
      <p id={`${id}-hint`} className="pl-13 text-xs text-pretty text-muted">
        {hint}
      </p>
    </div>
  )
}

/**
 * Pure black with the lights off, for OLED screens: a switch under the theme,
 * as it changes the dark theme of every colorway. Only the walls go fully
 * black; panels, shelves and lines stay a shade lighter, so depth still shows.
 */
export function BlackSwitch({ className }: { className?: string }) {
  const t = useTranslations('Settings.theme.black')
  const { black, setBlack } = useColorway()
  return (
    <SettingSwitch
      label={t('label')}
      hint={t('hint')}
      checked={black}
      onCheckedChange={setBlack}
      className={className}
    />
  )
}

/**
 * Following the game in focus: a switch under the colorways, as the room
 * leaves the colorway chosen for the game's own colors, and comes back to it.
 */
export function FollowSwitch({ className }: { className?: string }) {
  const t = useTranslations('Settings.colors.follow')
  const { follow, setFollow } = useColorway()
  return (
    <SettingSwitch
      label={t('label')}
      hint={t('hint')}
      checked={follow}
      onCheckedChange={setFollow}
      className={className}
    />
  )
}
