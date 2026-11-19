'use client'

import { BanIcon, CheckIcon, MinusIcon } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { fold } from '@/domain/query/evaluate'
import { rankFacets, type FacetValue } from '@/domain/query/facets'
import { platformFamilies, platformKeys, type ListKey } from '@/domain/query/keys'
import type { ListCondition } from '@/domain/query/panel'
import { cn } from '@/ui/cn'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Tip } from '@/ui/tooltip'

/** How many values a long list shows before its search box is needed (spec 5.4). */
export const TOP_VALUES = 8

/** Lists long enough to need a search box: platforms, names of companies and series, keywords. */
export const LONG_LISTS: readonly ListKey[] = [
  'owned',
  'franchise',
  'series',
  'developer',
  'publisher',
  'keyword',
  'platform',
]

type State = 'off' | 'include' | 'exclude'

const stateOf = (condition: ListCondition, word: string): State =>
  condition.include.includes(word)
    ? 'include'
    : condition.exclude.includes(word)
      ? 'exclude'
      : 'off'

/** The condition with one value set to a state. */
export const withState = (condition: ListCondition, word: string, state: State): ListCondition => ({
  include:
    state === 'include'
      ? [...condition.include.filter((value) => value !== word), word]
      : condition.include.filter((value) => value !== word),
  all: condition.all,
  exclude:
    state === 'exclude'
      ? [...condition.exclude.filter((value) => value !== word), word]
      : condition.exclude.filter((value) => value !== word),
})

type ListSectionProps = {
  filterKey: ListKey
  label: string
  condition: ListCondition
  values: readonly FacetValue[]
  /** The words each value is shown with. */
  labelOf: (word: string) => string
  /** Whether a value's name is IGDB's, in English. */
  isEnglish: (word: string) => boolean
  onChange: (condition: ListCondition) => void
}

/**
 * One list filter in the panel: each value with its count, off, included or
 * excluded. Values that would match nothing are dimmed and sink to the
 * bottom. A long list shows its top eight and a search box (spec 5.4).
 *
 * Each value is a box to check, which includes it, and a minus button beside
 * it, which leaves it out: the same with a mouse and on touch. A click that
 * cycled off, included, excluded looked like a checkbox and wasn't one: a
 * second click, meant to untick, excluded (step 10's review, 01, finding 8).
 */
export function ListSection({
  filterKey,
  label,
  condition,
  values,
  labelOf,
  isEnglish,
  onChange,
}: ListSectionProps) {
  const t = useTranslations('Filters')
  const format = useFormatter()
  const locale = useLocale()
  const findId = useId()
  const [find, setFind] = useState('')
  const [all, setAll] = useState(false)
  const long = LONG_LISTS.includes(filterKey)

  const chosen = (word: string) => stateOf(condition, word) !== 'off'
  let shown: FacetValue[]
  if (long) {
    const needle = fold(find.trim())
    const ranked = rankFacets(values, locale)
    const found = needle
      ? ranked.filter((value) => fold(labelOf(value.word)).includes(needle))
      : ranked
    shown =
      all || needle
        ? found
        : [
            ...found.slice(0, TOP_VALUES),
            ...found.slice(TOP_VALUES).filter((value) => chosen(value.word)),
          ]
  } else {
    // A short list keeps its own order (statuses, families first), with what matches nothing last.
    const families = (word: string) =>
      platformKeys.includes(filterKey) && platformFamilies.includes(word) ? 0 : 1
    shown = values
      .map((value, at) => ({ value, at }))
      .sort(
        (a, b) =>
          Number(b.value.count > 0) - Number(a.value.count > 0) ||
          families(a.value.word) - families(b.value.word) ||
          a.at - b.at,
      )
      .map(({ value }) => value)
  }
  const hidden = long && !all && !find ? values.length - shown.length : 0

  return (
    <div className="grid gap-2">
      {condition.include.length >= 2 ? (
        <Segmented
          aria-label={t('panel.match', { key: label })}
          value={condition.all ? 'all' : 'any'}
          onValueChange={(value) => onChange({ ...condition, all: value === 'all' })}
          className="justify-self-start"
        >
          <SegmentedItem value="any">{t('panel.anyOf')}</SegmentedItem>
          <SegmentedItem value="all">{t('panel.allOf')}</SegmentedItem>
        </Segmented>
      ) : null}

      {long && values.length > TOP_VALUES ? (
        <>
          <label htmlFor={findId} className="sr-only">
            {t('panel.find', { key: label })}
          </label>
          <input
            id={findId}
            type="search"
            autoComplete="off"
            placeholder={t('panel.findPlaceholder')}
            value={find}
            onChange={(event) => setFind(event.target.value)}
            className="h-9 rounded-control border border-line-strong bg-surface px-3 text-base transition-[border-color] duration-quick ease-settle placeholder:text-muted hover:border-muted sm:text-sm pointer-coarse:h-10"
          />
        </>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{t(find ? 'panel.nothingFound' : 'panel.nothing')}</p>
      ) : (
        <ul className="grid gap-0.5" aria-label={label}>
          {shown.map((value) => {
            const state = stateOf(condition, value.word)
            const name = labelOf(value.word)
            const lang = isEnglish(value.word) && locale !== 'en' ? 'en' : undefined
            const count = format.number(value.count)
            return (
              <li
                key={value.word}
                data-state={state}
                data-empty={value.count === 0 && state === 'off' ? '' : undefined}
                className="flex items-center gap-1 data-empty:text-muted"
              >
                {/* The row is a box to check: checked includes the value, checked again takes it off. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={state === 'include'}
                  className={cn(
                    'flex min-h-9 flex-1 items-center gap-2.5 rounded-control px-2 text-left text-sm pointer-coarse:min-h-11',
                    'transition-colors duration-quick ease-settle hover:bg-text/8',
                  )}
                  aria-label={t(`panel.value.${state === 'exclude' ? 'exclude' : 'off'}`, {
                    value: name,
                    count: value.count,
                  })}
                  onClick={() =>
                    onChange(
                      withState(condition, value.word, state === 'include' ? 'off' : 'include'),
                    )
                  }
                >
                  <StateMark state={state} />
                  <span
                    lang={lang}
                    className={cn('min-w-0 flex-1 truncate', state === 'exclude' && 'line-through')}
                  >
                    {name}
                  </span>
                  <span className="readout text-[0.625rem] text-muted">{count}</span>
                </button>
                {/* Leaving a value out is a button of its own, in sight, never a second click. */}
                <Tip label={t('panel.exclude', { value: name })}>
                  <button
                    type="button"
                    aria-pressed={state === 'exclude'}
                    aria-label={t('panel.exclude', { value: name })}
                    onClick={() =>
                      onChange(
                        withState(condition, value.word, state === 'exclude' ? 'off' : 'exclude'),
                      )
                    }
                    className={excludeClass}
                  >
                    <MinusIcon aria-hidden="true" className="size-4" />
                  </button>
                </Tip>
              </li>
            )
          })}
        </ul>
      )}

      {long && (hidden > 0 || all) && !find ? (
        <button
          type="button"
          className="justify-self-start rounded-control px-2 py-1 text-sm text-accent underline-offset-4 hover:underline"
          onClick={() => setAll((before) => !before)}
        >
          {all ? t('panel.fewer') : t('panel.more', { count: hidden })}
        </button>
      ) : null}
    </div>
  )
}

const excludeClass = cn(
  'inline-flex size-8 flex-none items-center justify-center rounded-control border border-transparent text-muted',
  'transition-colors duration-quick ease-settle hover:border-line-strong hover:text-text pointer-coarse:size-11 pointer-coarse:border-line-strong',
  'aria-pressed:border-text aria-pressed:bg-text aria-pressed:text-wall',
)

/** Off, included or excluded, by shape: an empty box, a check, a bar. Never by color alone. */
function StateMark({ state }: { state: State }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-4.5 flex-none items-center justify-center rounded-[3px] border',
        state === 'off' && 'border-line-strong',
        state === 'include' && 'border-accent bg-accent text-on-accent',
        state === 'exclude' && 'border-text bg-text text-wall',
      )}
    >
      {state === 'include' ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
      {state === 'exclude' ? <BanIcon className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}
