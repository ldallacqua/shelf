import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { cn } from '@/ui/cn'

import './dashboard.css'
import './trophies.css'

/** The period chips while they are on their way: all time, then a few years. */
const PERIODS = ['w-24', 'w-15', 'w-15', 'w-15', 'w-15', 'w-15', 'w-15']

/** The headline's figures beside the games finished. */
const FIGURES = 7

/** The cards of what the figures say. */
const INSIGHTS = 6

/** The years' columns, and the months' rows of twelve beside them. */
const YEARS = 8
const MONTH_ROWS = 4

/**
 * The trophy page while it is on its way, in the shapes of its first screen:
 * the period and the filter, the games finished and the figures beside them,
 * the cards of what the figures say, and the two charts of the years: equal
 * columns on their line and empty months, so nothing reads as a figure. They
 * use the page's own rules, so the page arrives where they stood. Hidden from
 * assistive technology, which is told the trophies are loading instead.
 */
export function TrophiesSkeleton() {
  const t = useTranslations('Trophies')
  // Each ghost's turn in the wave that runs down the page, as the library's ghosts take theirs
  // (`ghostOrder`, not imported: its module brings the cases' shapes into this page's script).
  let turn = 0
  const ghost = (className: string, key?: number) => (
    <span key={key} className={cn('ghost', className)} style={{ '--i': turn++ } as CSSProperties} />
  )
  return (
    <div aria-busy="true">
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <div aria-hidden="true">
        <div className="trophy-filters">
          <span className="trophy-period">
            {PERIODS.map((width, index) => ghost(cn('h-9 flex-none rounded-full', width), index))}
          </span>
          <span className="trophy-filter-form">
            {ghost('h-9 flex-1 rounded-full')}
            {ghost('h-9 w-18 flex-none rounded-full')}
          </span>
        </div>
        <div className="trophy-headline">
          <div className="trophy-hero">
            {ghost('h-2.5 w-28')}
            {ghost('mt-2.5 h-14 w-28 sm:h-18 sm:w-36')}
            {ghost('mt-3 h-3 w-56 max-w-full')}
          </div>
          <div className="trophy-figures">
            {Array.from({ length: FIGURES }, (_, index) => (
              <div key={index} className="trophy-figure">
                {ghost('h-2.5 w-20')}
                {ghost('mt-3 h-8 w-24 sm:h-9')}
              </div>
            ))}
          </div>
        </div>
        <div className="trophy-insights-section">
          <div className="trophy-insights">
            {Array.from({ length: INSIGHTS }, (_, index) => (
              <div key={index} className="trophy-insight">
                {ghost('h-2.5 w-20')}
                {ghost('mt-3 h-3 w-full')}
                {ghost('mt-2 h-3 w-2/3')}
                {ghost('mt-3.5 h-2.5 w-24')}
              </div>
            ))}
          </div>
        </div>
        <div className="trophy-timeline">
          <div className="trophy-section">
            {ghost('h-6 w-64 max-w-full sm:h-7')}
            {ghost('h-2.5 w-72 max-w-full')}
            <span className="trophy-columns" style={{ '--columns': YEARS } as CSSProperties}>
              {Array.from({ length: YEARS }, (_, index) => (
                <span key={index} className="trophy-column">
                  <span className="trophy-column-plot">{ghost('h-16 w-6 rounded-b-none')}</span>
                  {ghost('mt-1.5 h-2 w-6')}
                </span>
              ))}
            </span>
          </div>
          <div className="trophy-section">
            {ghost('h-6 w-64 max-w-full sm:h-7')}
            <span className="trophy-heat">
              {Array.from({ length: MONTH_ROWS * 13 }, (_, index) =>
                // Each row starts with its year.
                ghost(index % 13 === 0 ? 'mr-1 h-2 w-6' : 'aspect-square w-full', index),
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
