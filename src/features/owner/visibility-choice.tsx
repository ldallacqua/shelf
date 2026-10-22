'use client'

import { GlobeIcon, LockIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Radio } from '@/ui/checkbox'
import { cn } from '@/ui/cn'

type VisibilityChoiceProps = {
  /** The radio group's name, in its form. */
  name: string
  shelfPublic: boolean
  onChange: (shelfPublic: boolean) => void
  disabled?: boolean
}

/**
 * Who may see a shelf (ADR 004), chosen plainly: public, picked for you, or
 * private. Each says what it means. Private notes stay private either way.
 */
export function VisibilityChoice({ name, shelfPublic, onChange, disabled }: VisibilityChoiceProps) {
  const t = useTranslations('Account.visibility')

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{t('label')}</legend>
      {[true, false].map((open) => {
        const Icon = open ? GlobeIcon : LockIcon
        return (
          <label
            key={String(open)}
            className={cn(
              'flex cursor-pointer gap-3 rounded-control border border-line-strong bg-surface p-3',
              'transition-[border-color,background-color] duration-quick ease-settle hover:border-muted',
              'has-checked:border-accent has-checked:bg-surface-raised',
              'has-disabled:cursor-not-allowed has-disabled:opacity-50',
            )}
          >
            <Radio
              name={name}
              value={open ? 'public' : 'private'}
              checked={shelfPublic === open}
              onChange={() => onChange(open)}
              disabled={disabled}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon aria-hidden="true" className="size-4 text-muted" />
                {t(open ? 'public' : 'private')}
              </span>
              <span className="text-sm text-muted">{t(open ? 'publicBody' : 'privateBody')}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
