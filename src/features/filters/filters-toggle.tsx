'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import {
  filtersPreference,
  readPreference,
  subscribeToPreferences,
  writePreference,
} from '@/features/library/preferences'
import { PanelToggle } from '@/ui/panel-toggle'

import { FILTERS_ID } from './filter-panel'

import './filter-column.css'

/**
 * Whether the filters' column is shown where it stands beside the library (`filtersPreference`).
 * Unknown on the server and until the page is alive: the choice is on <html> before the first
 * paint, where CSS reads it.
 */
export function useFiltersColumn(): 'shown' | 'hidden' | undefined {
  return useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(filtersPreference),
    () => undefined,
  )
}

export const showFiltersColumn = () => writePreference(filtersPreference, 'shown')

/**
 * Hides the filters' column and brings it back, first in the toolbar, where the Filters button
 * stands on a narrower window (spec 12). Hidden, it counts the conditions on, as that button does:
 * it is then the filters' only way in.
 */
export function FiltersToggle({ count, className }: { count: number; className?: string }) {
  const t = useTranslations('Filters')
  const choice = useFiltersColumn()
  // Hidden, its name says the count the badge draws: "Show filters, 2 active".
  const show =
    count > 0 ? (
      <>
        <span aria-hidden="true">{t('show')}</span>
        <span
          aria-hidden="true"
          className="-mr-1 rounded-full bg-accent px-1.5 readout text-[0.625rem] text-on-accent"
        >
          {count}
        </span>
        <span className="sr-only">{t('showActive', { count })}</span>
      </>
    ) : (
      t('show')
    )
  return (
    <PanelToggle
      shown={choice === undefined ? undefined : choice === 'shown'}
      controls={FILTERS_ID}
      className={className}
      onToggle={() => writePreference(filtersPreference, choice === 'hidden' ? 'shown' : 'hidden')}
    >
      {choice === undefined ? (
        // Until the page is alive, the words follow the choice by CSS, as the column does.
        <>
          <span className="filters-hidden:hidden">{t('hide')}</span>
          <span className="hidden items-center gap-2 filters-hidden:inline-flex">{show}</span>
        </>
      ) : choice === 'shown' ? (
        t('hide')
      ) : (
        show
      )}
    </PanelToggle>
  )
}
