'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { statuses, type Status } from '@/domain/library/values'
import { cn } from '@/ui/cn'
import { Segmented, SegmentedItem } from '@/ui/segmented'

type StatusRowProps = {
  /** The one status the filter is set to; `all` for none; undefined when it says something else. */
  value: Status | 'all' | undefined
  /** Games per status, given the rest of the filter. Unknown until the library has arrived. */
  counts?: Partial<Record<Status, number>>
  /** Whether the shelf has unsorted games at all, whatever the filter matches. */
  unsortedOnShelf?: boolean
  onChange: (status: Status | 'all') => void
}

/** The row's own padding on a phone, kept beside a status scrolled into sight. */
const EDGE_PX = 16

/**
 * All, Playing, Backlog, Completed, Dropped, Wishlist, and Unsorted while a
 * sync's games wait (spec 3.1): the commonest filter gets the shortest path.
 * One tap sets the status, in every group of the filter; All takes it away.
 * On a phone the row scrolls sideways, and keeps the pressed status in sight.
 */
export function StatusRow({ value, counts, unsortedOnShelf, onChange }: StatusRowProps) {
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
      )}
    >
      <SegmentedItem value="all" className="shrink-0">
        {t('status.all')}
      </SegmentedItem>
      {statuses.map((status) => {
        const count = counts?.[status]
        // Only a shelf a sync brought games into has unsorted ones: elsewhere it would always say 0.
        // Where it has some, Unsorted stays while a filter matches none of them, saying 0.
        if (status === 'unsorted' && !count && !unsortedOnShelf && value !== 'unsorted') return null
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
            {count === undefined ? null : (
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
