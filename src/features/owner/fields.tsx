'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import type { Day } from '@/ui/calendar'
import { DatePicker } from '@/ui/date-picker'
import { Rating } from '@/ui/rating'
import { TagInput } from '@/ui/tag-input'

/**
 * The fields adding a game and editing one share: my rating, tags, and a
 * day. Each is a control from `src/ui` given its words, the page's language
 * and, for tags, the tags already in use.
 */

/** Today where I am, as `YYYY-MM-DD`: a day finished is never later than this. */
export const today = (): Day => {
  const now = new Date()
  const two = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

type RatingFieldProps = {
  /** Out of ten, in half steps; none while unrated. */
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** Once a value comes to rest, or is taken away: when to save. */
  onCommit?: (value: number | undefined) => void
  disabled?: boolean
}

export function RatingField({ value, onChange, onCommit, disabled }: RatingFieldProps) {
  const t = useTranslations('Fields')
  const format = useFormatter()
  const write = (rating: number) => format.number(rating, { maximumFractionDigits: 1 })
  return (
    <Rating
      label={t('rating')}
      value={value}
      onValueChange={onChange}
      onValueCommit={onCommit}
      onClear={() => {
        onChange(undefined)
        onCommit?.(undefined)
      }}
      unrated={t('unrated')}
      clearLabel={t('clearRating')}
      outOf={t('outOf')}
      valueText={(rating) => t('ratingValue', { value: write(rating) })}
      format={write}
      disabled={disabled}
    />
  )
}

let tagNames: Promise<string[]> | undefined

/** The tags in one's own library, most worn first, fetched once a page. None if they cannot be had. */
const loadTags = () =>
  (tagNames ??= fetch('/api/v1/me/tags', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`The tags answered ${response.status}`)
      return response.json() as Promise<{ tags: { name: string }[] }>
    })
    .then((answer) => answer.tags.map((tag) => tag.name))
    .catch(() => {
      // Asked again next time; typing a tag works without suggestions.
      tagNames = undefined
      return []
    }))

function useTagSuggestions(): string[] {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    let current = true
    void loadTags().then((loaded) => current && setNames(loaded))
    return () => {
      current = false
    }
  }, [])
  return names
}

type TagsFieldProps = {
  value: readonly string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
}

export function TagsField({ value, onChange, disabled }: TagsFieldProps) {
  const t = useTranslations('Fields')
  const id = useId()
  const suggestions = useTagSuggestions()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t('tags')}
      </label>
      <TagInput
        id={id}
        value={value}
        onChange={onChange}
        suggestions={suggestions}
        placeholder={t('tagsPlaceholder')}
        labels={{
          remove: (tag) => t('removeTag', { tag }),
          suggestions: t('tagSuggestions'),
        }}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        {t('tagsHint')}
      </p>
    </div>
  )
}

type DayFieldProps = {
  label: string
  value: Day | undefined
  onChange: (day: Day | undefined) => void
  /** Whether the day can be taken away again. */
  clearable?: boolean
  disabled?: boolean
  className?: string
}

/** A day up to today, from a calendar. */
export function DayField({
  label,
  value,
  onChange,
  clearable,
  disabled,
  className,
}: DayFieldProps) {
  const t = useTranslations('Fields')
  const locale = useLocale()
  const labelId = useId()
  const now = today()
  return (
    <div className={className ?? 'grid gap-1.5'}>
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <DatePicker
        aria-labelledby={labelId}
        value={value}
        onChange={onChange}
        placeholder={t('pickDay')}
        max={now}
        today={now}
        locale={locale}
        labels={{
          previousMonth: t('previousMonth'),
          nextMonth: t('nextMonth'),
          ...(clearable ? { clear: t('clearDay') } : {}),
        }}
        disabled={disabled}
      />
    </div>
  )
}
