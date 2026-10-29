import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { cn } from '@/ui/cn'

import './dashboard.css'
import './trophies.css'

/** The period chips while they are on their way: all time, then a few years. */
const PERIODS = ['w-24', 'w-15', 'w-15', 'w-15', 'w-15', 'w-15', 'w-15']

/** The chapter links, of their words' widths. */
const CHAPTERS = ['w-16', 'w-16', 'w-11', 'w-22', 'w-10', 'w-15', 'w-9']

/** The headline's figures beside the games finished. */
const FIGURES = 4

/** The cards of what the figures say. */
const INSIGHTS = 6

/**
 * The trophy page while it is on its way, in the shapes of its first screen:
 * the period and the filter, the chapter links, the band of the games
 * finished and the figures beside them, and the cards of what the figures
 * say, so nothing reads as a figure. They use the page's own rules, so the
 * page arrives where they stood. Hidden from assistive technology, which is
 * told the trophies are loading instead.
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
        <div className="trophy-nav">
          <span className="flex h-11 items-center gap-5">
            {CHAPTERS.map((width, index) => ghost(cn('h-3 flex-none', width), index))}
          </span>
        </div>
        <div>
          <div className="trophy-chapter">
            <div className="trophy-board">
              <div className="trophy-kpis-band">
                <div className="trophy-kpis" style={{ '--kpis': FIGURES + 2 } as CSSProperties}>
                  <div className="trophy-kpi" data-hero="">
                    {ghost('h-2.5 w-28')}
                    {ghost('mt-3 h-14 w-28 sm:h-18 sm:w-36')}
                    {ghost('mt-3 h-3 w-56 max-w-full')}
                  </div>
                  {Array.from({ length: FIGURES }, (_, index) => (
                    <div key={index} className="trophy-kpi">
                      {ghost('h-2.5 w-20')}
                      {ghost('mt-3 h-8 w-24 sm:h-9')}
                    </div>
                  ))}
                </div>
              </div>
              <div className="trophy-group">
                {ghost('h-4 w-40')}
                <div className="trophy-insights">
                  {Array.from({ length: INSIGHTS }, (_, index) => (
                    <div key={index} className="trophy-insight">
                      {ghost('h-2.5 w-20')}
                      {ghost('mt-1.5 h-3 w-full')}
                      {ghost('h-3 w-2/3')}
                      {ghost('mt-1.5 h-2.5 w-24')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
