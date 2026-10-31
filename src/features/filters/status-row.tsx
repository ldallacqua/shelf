'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { occasionalStatuses, statuses, type Status } from '@/domain/library/values'
import { cn } from '@/ui/cn'
import { Segmented, SegmentedItem } from '@/ui/segmented'
import { Ghost } from '@/ui/ghost'

type StatusRowProps = {
  /** The one status the filter is set to; `all` for none; undefined when it says something else. */
  value: Status | 'all' | undefined
  /** Games per status, given the rest of the filter. Unknown until the library has arrived. */
  counts?: Partial<Record<Status, number>>
  /** Of the statuses shown only while used (Someday, Retired, Unsorted), those the shelf has, whatever the filter matches. */
  onShelf?: readonly Status[]
  onChange: (status: Status | 'all') => void
}

/** The row's own padding on a phone, kept beside a status scrolled into sight. */
const EDGE_PX = 16

/**
 * All, Playing, Backlog, Completed, Dropped, Wishlist; Someday and Retired
 * while a game has one, and Unsorted while a sync's games wait (spec 3.1,
 * 3.12): the commonest filter gets the shortest path.
 * One tap sets the status, in every group of the filter; All takes it away.
 * On a phone the row scrolls sideways, and keeps the pressed status in sight.
 * Where the filters stand beside the library, their Status section, open
 * from the start and counting, does the row's work, so the row is not shown.
 */
export function StatusRow({ value, counts, onShelf, onChange }: StatusRowProps) {
  const t = useTranslations('Filters')
  const library = useTranslations('Library')
  const format = useFormatter()
  const row = useRef<HTMLDivElement>(null)

  // Unsorted is last, past a phone's edge: an address that opens on it shows it pressed.
  // Only the row scrolls, never the page, and at once: a jump, not a movement.
  useEffect(() => {
    const group = row.current
    const pressed = group?.querySelector<HTMLElement>('[data-state="on"]')
    if (!group || !pressed) return
    const shown = group.getBoundingClientRect()
    const item = pressed.getBoundingClientRect()
    if (item.right > shown.right) group.scrollLeft += item.right - shown.right + EDGE_PX
    else if (item.left < shown.left) group.scrollLeft -= shown.left - item.left + EDGE_PX
  }, [value])

  return (
    <Segmented
      ref={row}
      aria-label={t('status.label')}
      // When the filter says something the row cannot show, nothing is pressed.
      value={(value ?? '') as Status | 'all'}
      onValueChange={onChange}
      // The group itself scrolls, edge to edge on a phone: the keyboard reaches what scrolls.
      className={cn(
        'max-w-full [scrollbar-width:none] overflow-x-auto border-transparent bg-transparent p-0',
        'max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:max-w-none max-sm:px-4',
        'filters-beside:hidden',
      )}
    >
      <SegmentedItem value="all" className="shrink-0">
        {t('status.all')}
      </SegmentedItem>
      {statuses.map((status) => {
        const count = counts?.[status]
        // Only a shelf a sync brought games into has unsorted ones, and only a shelf that uses
        // Someday or Retired has those: elsewhere each would always say 0. Where the shelf has
        // some, it stays while a filter matches none of them, saying 0.
        const occasional = (occasionalStatuses as readonly Status[]).includes(status)
        if (occasional && !count && !onShelf?.includes(status) && value !== status) return null
        return (
          <SegmentedItem
            key={status}
            value={status}
            aria-label={
              count === undefined
                ? library(`status.${status}`)
                : t('status.counted', { status: library(`status.${status}`), count })
            }
            className="shrink-0 gap-2"
          >
            <span aria-hidden="true">{library(`status.${status}`)}</span>
            {counts === undefined ? (
              <Ghost className="h-2.5 w-4" />
            ) : count === undefined ? null : (
              <span aria-hidden="true" className="readout text-[0.625rem]">
                {format.number(count)}
              </span>
            )}
          </SegmentedItem>
        )
      })}
    </Segmented>
  )
}
