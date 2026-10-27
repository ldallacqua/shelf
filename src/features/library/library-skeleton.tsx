import { useTranslations } from 'next-intl'

import { FilterGhosts } from '@/features/filters/filter-ghosts'
import { cn } from '@/ui/cn'

import { GhostShelves, ghostOrder } from './ghosts'

/** A control's place: a button's height, or a group of buttons'. */
const BUTTON = 'h-10 rounded-control pointer-coarse:h-11'
const GROUP = 'h-[2.625rem] rounded-control pointer-coarse:h-[2.875rem]'

/**
 * The library before its first boxes arrive: the heading, ghosts where the
 * totals and controls will be, and the shelf with ghost cases standing on
 * its lit boards. It is part of the page built ahead of time, so it is what
 * a visitor sees first. Everything has the size and place of what replaces
 * it, so nothing moves when the page arrives: the boxes take the ghosts'
 * places.
 */
export function LibrarySkeleton({ title }: { title?: string }) {
  const t = useTranslations('Library')

  return (
    <div className="library" data-view="shelf" aria-busy="true">
      <div className="library-body">
        <div className="library-head flex flex-none flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-4 pb-3 sm:pt-10 sm:pb-5 filters-beside:pt-0">
          <h1 className="title text-2xl sm:text-5xl">{title ?? t('title')}</h1>
          {/* The totals: three, wrapping where the real ones would. */}
          <div aria-hidden="true" className="flex flex-wrap gap-x-5 gap-y-1">
            {['w-20', 'w-24', 'w-24'].map((width, index) => (
              <span key={width + index} className="flex h-6 items-center sm:h-7">
                <span className={cn('ghost h-3.5', width)} style={ghostOrder(index)} />
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only" role="status">
          {t('loading')}
        </p>
        {/* The filters' column, on a window wide enough for it: its title, then its sections. */}
        <div aria-hidden="true" className="library-filters">
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <span className="flex h-7 items-center">
              <span className="ghost h-4.5 w-20" />
            </span>
            <span className="ghost h-8 w-22 rounded-control" />
          </div>
          <span className="mx-4 mt-2 mb-4 block">
            <span className="ghost block h-3 w-28" />
          </span>
          <div className="border-t border-line px-4 pt-3">
            <FilterGhosts />
          </div>
        </div>
        <div className="library-main">
          <div aria-hidden="true" className="grid flex-none gap-3">
            {/* The search, and the smart shelves' menu. */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className={cn('flex-1 border border-line-strong bg-surface sm:max-w-xl', BUTTON)}
              />
              <span className={cn('ghost w-16 flex-none', BUTTON)} />
            </div>
            {/* The status row. */}
            <div className="flex h-[2.375rem] items-center gap-1 overflow-hidden pointer-coarse:h-[2.625rem]">
              {['w-11', 'w-18', 'w-19', 'w-23', 'w-19', 'w-21'].map((width, index) => (
                <span
                  key={width + index}
                  className={cn('ghost h-full flex-none rounded-control', width)}
                  style={ghostOrder(index)}
                />
              ))}
            </div>
          </div>
          {/* The toolbar: under the search on a wide screen, two rows at the bottom on a phone. */}
          <div
            aria-hidden="true"
            className="library-controls grid gap-2 sm:mt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3"
          >
            <div className="flex gap-2 sm:contents">
              <span className={cn('ghost w-22 flex-none sm:w-24 filters-beside:hidden', BUTTON)} />
              <span className={cn('ghost flex-1 sm:w-31 sm:flex-none', BUTTON)} />
              <span className={cn('ghost w-10 flex-none pointer-coarse:w-11', BUTTON)} />
            </div>
            <div className="flex gap-2 sm:contents">
              <span className={cn('ghost flex-1 sm:w-40 sm:flex-none', BUTTON)} />
              <span className={cn('ghost w-20 flex-none sm:ml-auto sm:w-23', GROUP)} />
              <span className={cn('ghost w-30 flex-none sm:w-40', GROUP)} />
              <span className={cn('ghost w-58 flex-none max-sm:hidden', GROUP)} />
            </div>
          </div>
          <GhostShelves />
        </div>
      </div>
    </div>
  )
}
