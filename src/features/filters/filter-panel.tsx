'use client'

import { ChevronRightIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { numberToDay } from '@/domain/library/snapshot'
import type { LibraryIndex } from '@/domain/query/evaluate'
import { extentOf, facetCounts } from '@/domain/query/facets'
import { isDateKey, isListKey, type FilterKey, type ListKey } from '@/domain/query/keys'
import {
  groupsOf,
  NO_CONDITION,
  readGroup,
  removeGroup,
  setList,
  setRange,
  type ListCondition,
  type RangeCondition,
  type RangeKey,
} from '@/domain/query/panel'
import type { QueryNode } from '@/domain/query/tree'
import { writeQuery } from '@/domain/query/write'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Sheet, SheetContent } from '@/ui/sheet'

import { comparisonLabel, isIgdbName, keyLabel, valueLabel } from './labels'
import { ListSection } from './list-section'
import { RangeSection } from './range-section'

/** The panel's sections, mine first (spec 5.1). */
const MINE: readonly FilterKey[] = [
  'status',
  'owned',
  'wanted',
  'format',
  'copies',
  'rating',
  'hours',
  'completed',
  'added',
  'tag',
  'has',
  'is',
]
const IGDB: readonly FilterKey[] = [
  'genre',
  'theme',
  'mode',
  'perspective',
  'kind',
  'platform',
  'franchise',
  'series',
  'developer',
  'publisher',
  'keyword',
  'year',
  'igdb',
  'length',
]

/** Open from the start: the filters asked for most. */
const OPEN_AT_FIRST: readonly FilterKey[] = ['status', 'owned', 'genre']

type FilterPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: QueryNode | undefined
  /** Undefined while the library is still arriving. */
  index: LibraryIndex | undefined
  /** How many games the filter matches now. */
  matching: number | undefined
  onChange: (tree: QueryNode | undefined) => void
  onClear: () => void
  /** The keyword list was opened: fetch the keywords. */
  onWantKeywords: () => void
}

/**
 * The filter panel (spec 5.2): level 1 is each value off, included or
 * excluded, with any-of or all-of per filter, and filters combined with and;
 * level 2 is groups of those, joined with or. Every change applies at once,
 * on the next frame; there is no Apply button. The count at the foot says
 * how many games match.
 */
export function FilterPanel({
  open,
  onOpenChange,
  tree,
  index,
  matching,
  onChange,
  onClear,
  onWantKeywords,
}: FilterPanelProps) {
  const t = useTranslations('Filters')
  const library = useTranslations('Library')
  const format = useFormatter()
  const words = { t, library, format }

  const groups = groupsOf(tree)
  const [chosen, setChosen] = useState(0)
  /** A group being started, not yet in the filter because it holds nothing yet. */
  const [starting, setStarting] = useState(false)
  const count = Math.max(1, groups.length) + (starting ? 1 : 0)
  const current = Math.min(chosen, count - 1)
  const node = groups[current]
  const group = readGroup(node)
  // Words in the title belong to the search field, where they were typed. What else the panel
  // has no control for is listed, so nothing in the filter is out of sight.
  const written = group.other.filter(
    (part) => part.type !== 'text' && !(part.type === 'not' && part.child.type === 'text'),
  )
  const [opened, setOpened] = useState<ReadonlySet<FilterKey>>(() => new Set(OPEN_AT_FIRST))

  const editList = (key: ListKey, condition: ListCondition) => {
    onChange(setList(tree, current, key, condition))
    if (current >= groups.length) setStarting(false)
  }
  const editRange = (key: RangeKey, range: RangeCondition | undefined) => {
    onChange(setRange(tree, current, key, range))
    if (current >= groups.length) setStarting(false)
  }

  const toggle = (key: FilterKey, isOpen: boolean) => {
    setOpened((before) => {
      const next = new Set(before)
      if (isOpen) next.add(key)
      else next.delete(key)
      return next
    })
    if (isOpen && key === 'keyword') onWantKeywords()
  }

  const summary = (key: FilterKey): string | undefined => {
    if (isListKey(key)) {
      const condition = group.lists[key]
      if (!condition) return undefined
      const parts = [
        ...condition.include.map((word) => valueLabel(key, word, index, words)),
        ...condition.exclude.map((word) =>
          t('panel.notValue', { value: valueLabel(key, word, index, words) }),
        ),
      ]
      return parts.length > 0
        ? format.list(parts, { type: condition.all ? 'conjunction' : 'disjunction' })
        : undefined
    }
    const range = group.ranges[key]
    return range ? comparisonLabel(key, range, words) : undefined
  }

  const section = (key: FilterKey) => {
    const label = keyLabel(key, words)
    const isOpen = opened.has(key)
    const said = summary(key)
    return (
      <details
        key={key}
        open={isOpen}
        onToggle={(event) => {
          const now = event.currentTarget.open
          if (now !== isOpen) toggle(key, now)
        }}
        className="group/section border-b border-line"
        data-filter={key}
      >
        <summary
          className={cn(
            'flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium',
            '[&::-webkit-details-marker]:hidden',
          )}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 flex-none text-muted transition-transform duration-quick ease-settle group-open/section:rotate-90"
          />
          <span className="flex-none">{label}</span>
          {said ? (
            <span className="min-w-0 truncate text-xs font-normal text-muted">{said}</span>
          ) : null}
        </summary>
        {isOpen ? <div className="pb-4 pl-6">{body(key, label)}</div> : null}
      </details>
    )
  }

  const body = (key: FilterKey, label: string) => {
    if (!index) return <p className="text-sm text-muted">{t('panel.loading')}</p>
    if (isListKey(key)) {
      if (key === 'keyword' && !index.keywords) {
        return <p className="text-sm text-muted">{t('panel.loadingKeywords')}</p>
      }
      return (
        <ListSection
          filterKey={key}
          label={label}
          condition={group.lists[key] ?? NO_CONDITION}
          values={facetCounts(index, node, key)}
          labelOf={(word) => valueLabel(key, word, index, words)}
          isEnglish={(word) => isIgdbName(key, word)}
          onChange={(condition) => editList(key, condition)}
        />
      )
    }
    const rangeKey = key as RangeKey
    const extent = extentOf(isDateKey(rangeKey) ? index.dates[rangeKey] : index.numbers[rangeKey])
    const shown = extent
      ? ((isDateKey(rangeKey)
          ? [numberToDay(extent[0]).slice(0, 4), numberToDay(extent[1]).slice(0, 4)]
          : [String(Math.floor(extent[0])), String(Math.ceil(extent[1]))]) as [string, string])
      : undefined
    return (
      <RangeSection
        filterKey={rangeKey}
        label={label}
        range={group.ranges[rangeKey]}
        extent={shown}
        onChange={(range) => editRange(rangeKey, range)}
      />
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t('panel.title')}
        description={t('panel.description')}
        closeLabel={t('panel.close')}
        className="sm:w-[28rem]"
        data-slot="filter-panel"
        footer={
          <>
            <p role="status" className="text-sm">
              {matching === undefined
                ? t('panel.loading')
                : t('panel.results', { count: matching })}
            </p>
            <Button variant="secondary" size="sm" onClick={onClear} disabled={!tree}>
              {t('chips.clear')}
            </Button>
          </>
        }
      >
        {count > 1 ? (
          <div className="mb-3 grid gap-2">
            <p className="text-xs text-muted">{t('panel.groups')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                aria-label={t('panel.groupsLabel')}
                value={String(current)}
                onValueChange={(value) => setChosen(Number(value))}
              >
                {Array.from({ length: count }, (_, at) => (
                  <SegmentedItem key={at} value={String(at)}>
                    {t('panel.group', { number: at + 1 })}
                  </SegmentedItem>
                ))}
              </Segmented>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (current >= groups.length) setStarting(false)
                  else onChange(removeGroup(tree, current))
                  setChosen(Math.max(0, current - 1))
                }}
              >
                <Trash2Icon aria-hidden="true" />
                {t('panel.removeGroup', { number: current + 1 })}
              </Button>
            </div>
          </div>
        ) : null}

        {written.length > 0 ? (
          <div className="mb-3 rounded-control border border-dashed border-line-strong p-3 text-sm">
            <p className="text-muted">{t('panel.asText')}</p>
            <ul className="mt-1 grid gap-1">
              {written.map((part, at) => (
                <li key={at}>
                  <code className="font-mono text-xs">{writeQuery(part)}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <h3 className="pt-1 readout text-[0.625rem] text-muted uppercase">{t('panel.mine')}</h3>
        {MINE.map(section)}
        <h3 className="pt-5 readout text-[0.625rem] text-muted uppercase">{t('panel.igdb')}</h3>
        {IGDB.map(section)}

        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          disabled={starting || groups.length === 0}
          onClick={() => {
            setStarting(true)
            setChosen(count)
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t('panel.addGroup')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
