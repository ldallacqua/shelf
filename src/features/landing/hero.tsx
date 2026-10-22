import { ArrowDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { Eyebrow, Page } from '@/features/shell/page'
import { Button } from '@/ui/button'
import { Ledge } from '@/ui/ledge'

import { CreateShelf } from './create-shelf'
import { DemoCase, type DemoGame } from './demo-case'

/** How many bays the hero's shelf has, and how many games stand on each. */
const BAYS = 3
const PER_BAY = 9

/** A case on the hero's shelf is about this wide: 135 mm at the largest `--mm`. */
const HERO_SIZES = '(min-width: 64rem) 106px, (min-width: 40rem) 98px, 82px'

/**
 * The first screen: what Shelf is, in a line, the one call to action, and
 * the product itself beside it, a lit shelf of real covers. Its lights come
 * on bay by bay, once (landing.css). On a phone the shelf stands under the
 * words, two bays of it.
 */
export function Hero({ games }: { games: readonly DemoGame[] }) {
  const t = useTranslations('Landing.hero')
  const bays = Array.from({ length: BAYS }, (_, bay) =>
    games.slice(bay * PER_BAY, (bay + 1) * PER_BAY),
  )
  return (
    <section aria-labelledby="landing-title" className="overflow-x-clip">
      <Page className="grid min-h-[min(54rem,calc(100svh-4rem))] grid-cols-[minmax(0,1fr)] items-center gap-x-10 gap-y-12 pt-10 pb-16 sm:pt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pb-24">
        <div>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 id="landing-title" className="mt-4 title text-5xl text-balance sm:text-7xl">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-[42ch] text-lg text-pretty text-muted sm:text-xl">{t('lead')}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <CreateShelf />
            <Button variant="ghost" asChild className="h-12 px-5 text-base">
              <a href="#how">
                {t('how')}
                <ArrowDownIcon aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p className="mt-5 text-sm text-muted">{t('note')}</p>
        </div>
        <div
          role="img"
          aria-label={t('shelf', { count: games.length })}
          className="hero-shelf -mx-4 sm:mx-0"
        >
          {bays.map((bay, index) => (
            <div
              key={index}
              className="hero-bay max-lg:last:hidden"
              style={{ '--bay': index } as CSSProperties}
            >
              <Ledge itemsClassName="flex-nowrap">
                {bay.map((game, place) => (
                  <DemoCase
                    key={game.slug}
                    game={game}
                    sizes={HERO_SIZES}
                    // The middle of the first two bays is what a phone shows first.
                    eager={index < 2 && place >= 2 && place <= 6}
                  />
                ))}
              </Ledge>
              <div aria-hidden="true" className="hero-dark" />
            </div>
          ))}
        </div>
      </Page>
    </section>
  )
}
