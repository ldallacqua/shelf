'use client'

import { ChevronRightIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useId, useState } from 'react'

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
import { FilterGhosts } from './filter-ghosts'
import { ListSection } from './list-section'
import { RangeSection } from './range-section'
import { SEARCH_ID } from './search-field'

/** The column the filters stand in beside the library, for the F key to reach. */
export const FILTERS_ID = 'library-filters'

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
  /** The sheet's state. It never opens while the filters stand beside the library. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The window is wide enough for the filters to stand beside the library (`beside.ts`); undefined until known. */
  beside: boolean | undefined
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
 * on the next frame; there is no Apply button. The count says how many games
 * match.
 *
 * On a wide window the panel is a column beside the library, always there
 * (issue #62); narrower, it is a sheet the Filters button opens. Both are
 * drawn from here, so which sections are open carries over when the window
 * changes width. The column is in every page, as the server cannot tell a
 * window's width, and hidden by CSS where it does not fit. Its sections are
 * drawn only once the browser says it fits: until the browser has said, ghosts
 * hold their place, so a phone hydrates no filter it cannot see, and once it
 * has said no, the hidden column holds nothing.
 */
export function FilterPanel({
  open,
  onOpenChange,
  beside,
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
  const titleId = useId()

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

  // Each takes the index it counts from: the column's is withheld while the column is hidden.
  const summary = (key: FilterKey, at: LibraryIndex | undefined): string | undefined => {
    if (isListKey(key)) {
      const condition = group.lists[key]
      if (!condition) return undefined
      const parts = [
        ...condition.include.map((word) => valueLabel(key, word, at, words)),
        ...condition.exclude.map((word) =>
          t('panel.notValue', { value: valueLabel(key, word, at, words) }),
        ),
      ]
      return parts.length > 0
        ? format.list(parts, { type: condition.all ? 'conjunction' : 'disjunction' })
        : undefined
    }
    const range = group.ranges[key]
    return range ? comparisonLabel(key, range, words) : undefined
  }

  const section = (key: FilterKey, at: LibraryIndex | undefined) => {
    const label = keyLabel(key, words)
    const isOpen = opened.has(key)
    const said = summary(key, at)
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
        {isOpen ? <div className="pb-4 pl-6">{body(key, label, at)}</div> : null}
      </details>
    )
  }

  const body = (key: FilterKey, label: string, at: LibraryIndex | undefined) => {
    if (!at) return <p className="text-sm text-muted">{t('panel.loading')}</p>
    if (isListKey(key)) {
      if (key === 'keyword' && !at.keywords) {
        return <p className="text-sm text-muted">{t('panel.loadingKeywords')}</p>
      }
      return (
        <ListSection
          filterKey={key}
          label={label}
          condition={group.lists[key] ?? NO_CONDITION}
          values={facetCounts(at, node, key)}
          labelOf={(word) => valueLabel(key, word, at, words)}
          isEnglish={(word) => isIgdbName(key, word)}
          onChange={(condition) => editList(key, condition)}
        />
      )
    }
    const rangeKey = key as RangeKey
    const extent = extentOf(isDateKey(rangeKey) ? at.dates[rangeKey] : at.numbers[rangeKey])
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

  /** Everything but the title, the count and Clear: the same in the column and in the sheet. */
  const controls = (at: LibraryIndex | undefined) => (
    <>
      {count > 1 ? (
        <div className="mb-3 grid gap-2">
          <p className="text-xs text-muted">{t('panel.groups')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              aria-label={t('panel.groupsLabel')}
              value={String(current)}
              onValueChange={(value) => setChosen(Number(value))}
            >
              {Array.from({ length: count }, (_, place) => (
                <SegmentedItem key={place} value={String(place)}>
                  {t('panel.group', { number: place + 1 })}
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
            {written.map((part, place) => (
              <li key={place}>
                <code className="font-mono text-xs">{writeQuery(part)}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="pt-1 readout text-[0.625rem] text-muted uppercase">{t('panel.mine')}</h3>
      {MINE.map((key) => section(key, at))}
      <h3 className="pt-5 readout text-[0.625rem] text-muted uppercase">{t('panel.igdb')}</h3>
      {IGDB.map((key) => section(key, at))}

      <Button
        variant="ghost"
        size="sm"
        className="mt-4 self-start"
        disabled={starting || groups.length === 0}
        onClick={() => {
          setStarting(true)
          setChosen(count)
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('panel.addGroup')}
      </Button>
    </>
  )

  const results =
    matching === undefined ? t('panel.loading') : t('panel.results', { count: matching })
  const clear = (
    <Button variant="secondary" size="sm" onClick={onClear} disabled={!tree}>
      {t('chips.clear')}
    </Button>
  )

  return (
    <>
      <aside id={FILTERS_ID} aria-labelledby={titleId} className="library-filters">
        {/* Past every filter to the search field, which leads on to the shelves. */}
        <button
          type="button"
          className="sr-only rounded-control bg-accent text-sm font-medium text-on-accent focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-3 focus-visible:z-10 focus-visible:px-3 focus-visible:py-2"
          onClick={() => document.getElementById(SEARCH_ID)?.focus()}
        >
          {t('panel.skip')}
        </button>
        <div className="flex flex-none items-center justify-between gap-3 px-4 pt-4">
          <h2 id={titleId} className="title text-xl">
            {t('panel.title')}
          </h2>
          {clear}
        </div>
        {/* Not a status: the library says what a filter leaves (`ResultStatus`) once it settles. */}
        <p className="flex-none px-4 pt-1 pb-3 text-sm text-muted">{results}</p>
        <div className="library-filters-body flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-line px-4 pt-3 pb-4">
          {beside ? controls(index) : beside === undefined ? <FilterGhosts /> : null}
        </div>
      </aside>

      <Sheet open={open && !beside} onOpenChange={onOpenChange}>
        <SheetContent
          title={t('panel.title')}
          description={t('panel.description')}
          closeLabel={t('panel.close')}
          className="sm:w-[28rem]"
          data-slot="filter-panel"
          footer={
            <>
              <p role="status" className="text-sm">
                {results}
              </p>
              {clear}
            </>
          }
        >
          {controls(index)}
        </SheetContent>
      </Sheet>
    </>
  )
}
