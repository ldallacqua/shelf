'use client'

import { XIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { isDateKey } from '@/domain/query/keys'
import { rangeFrom, rangeInputs, type RangeCondition, type RangeKey } from '@/domain/query/panel'
import { writeComparison } from '@/domain/query/write'
import { cn } from '@/ui/cn'

type RangeSectionProps = {
  filterKey: RangeKey
  label: string
  range: RangeCondition | undefined
  /** The lowest and highest value in the library, shown as the boxes' placeholders. */
  extent?: [string, string]
  onChange: (range: RangeCondition | undefined) => void
}

const inputClass = cn(
  // Sixteen pixels on a phone, so focusing a box never zooms the page.
  'h-9 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-base tabular-nums sm:text-sm',
  'transition-[border-color] duration-quick ease-settle hover:border-muted',
  'placeholder:text-muted aria-invalid:border-dashed aria-invalid:border-text pointer-coarse:h-10',
)

/**
 * A number or a date in the panel: from, to, or both. Either box can be
 * left empty. Dates take a year, a month or a day (`2025`, `2025-06`,
 * `2025-06-14`). A comparison the boxes cannot show, such as `<10`, is
 * shown as written, with a way to clear it.
 */
export function RangeSection({ filterKey, label, range, extent, onChange }: RangeSectionProps) {
  const t = useTranslations('Filters')
  const format = useFormatter()
  const id = useId()
  const written = writeComparison(range ?? { op: 'eq', value: '' })
  const [inputs, setInputs] = useState(() => rangeInputs(range))
  const [seen, setSeen] = useState(written)
  const [editing, setEditing] = useState(false)

  // Changed from elsewhere (a chip, the search field): show it.
  if (written !== seen) {
    setSeen(written)
    if (!editing) setInputs(rangeInputs(range))
  }

  const parsed = rangeFrom(filterKey, inputs.from, inputs.to)
  const invalid = parsed === null
  const date = isDateKey(filterKey)

  const edit = (side: 'from' | 'to', text: string) => {
    const next = { from: inputs.from, to: inputs.to, [side]: text }
    setInputs(next)
    const value = rangeFrom(filterKey, next.from, next.to)
    if (value !== null) onChange(value)
  }

  const placeholder = (value: string | undefined) =>
    value === undefined ? '' : date ? value : format.number(Number(value))

  return (
    <fieldset className="grid gap-2" aria-describedby={invalid ? `${id}-invalid` : undefined}>
      <legend className="sr-only">{label}</legend>
      {inputs.written ? (
        <p className="flex items-center gap-2 text-sm">
          <span>{t('panel.written', { text: inputs.written })}</span>
          <button
            type="button"
            aria-label={t('panel.clearRange', { key: label })}
            onClick={() => {
              setInputs({ from: '', to: '' })
              onChange(undefined)
            }}
            className="inline-flex size-7 items-center justify-center rounded-control text-muted hover:bg-text/8 pointer-coarse:size-10"
          >
            <XIcon aria-hidden="true" className="size-3.5" />
          </button>
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {(['from', 'to'] as const).map((side, at) => (
          <label key={side} className="grid gap-1 text-xs text-muted">
            {t(`panel.${side}`)}
            <input
              inputMode={date ? 'numeric' : 'decimal'}
              autoComplete="off"
              aria-invalid={invalid && inputs[side].trim() !== '' ? true : undefined}
              placeholder={placeholder(extent?.[at])}
              value={inputs[side]}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              onChange={(event) => edit(side, event.target.value)}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      {invalid ? (
        <p id={`${id}-invalid`} role="status" className="text-xs text-muted">
          {t(date ? 'panel.notADate' : 'panel.notANumber')}
        </p>
      ) : date ? (
        <p className="text-xs text-muted">{t('panel.dateHint')}</p>
      ) : null}
    </fieldset>
  )
}
