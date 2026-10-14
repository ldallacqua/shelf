'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { statuses, type Status } from '@/domain/library/values'
import { cn } from '@/ui/cn'
import { Segmented, SegmentedItem } from '@/ui/segmented'

type StatusRowProps = {
  /** The one status the filter is set to; `all` for none; undefined when it says something else. */
  value: Status | 'all' | undefined
  /** Games per status, given the rest of the filter. Unknown until the library has arrived. */
  counts?: Partial<Record<Status, number>>
  onChange: (status: Status | 'all') => void
}

/**
 * All, Playing, Backlog, Completed, Dropped, Wishlist (spec 3.1): the
 * commonest filter gets the shortest path. One tap sets the status, in every
 * group of the filter; All takes it away. On a phone the row scrolls sideways.
 */
export function StatusRow({ value, counts, onChange }: StatusRowProps) {
  const t = useTranslations('Filters')
  const library = useTranslations('Library')
  const format = useFormatter()

  return (
    <Segmented
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
