'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { caseShapes } from '@/ui/game-case'

import { describeBox, shelfName } from './describe'
import type { Density } from './preferences'
import { ShelfGrid } from './shelf-grid'
import type { DrawnShelf, ViewProps } from './view-props'

/** A shelf that mixes platforms leaves room for the widest and tallest common cases. */
const MIXED = { slot: caseShapes.jewel.width, tall: caseShapes.keepCase.height }

const sizeOf = (shelf: DrawnShelf): { slot: number; tall: number } => {
  if (shelf.kind !== 'platform') return MIXED
  const shape = caseShapes[shelf.platform.shape]
  return { slot: shape.width, tall: shape.height }
}

/**
 * How many of the first covers are fetched ahead of the rest: the first two
 * rows on a phone, most of the first on a desktop. More would compete with
 * each other on a slow connection and all arrive later.
 */
const EAGER = 6

type ShelfViewProps = ViewProps & { density: Density }

/**
 * The shelf in 2D. Wider than a phone, shelves stack down the page. On a
 * phone, one shelf fills the screen: swipe sideways for the next, and a row
 * of tabs shows where you are (spec 3.4).
 */
export function ShelfView({ shelves, platforms, open, onOpen, enter, density }: ShelfViewProps) {
  const t = useTranslations('Library')
  const pager = useRef<HTMLDivElement>(null)
  const tabs = useRef<HTMLElement>(null)
  /** The shelf in view on a phone. */
  const [current, setCurrent] = useState(0)

  // Follow the swipe: the shelf nearest the pager's left edge is the current one.
  useEffect(() => {
    const element = pager.current
    if (!element) return
    let frame = 0
    const read = () => {
      frame = 0
      if (element.scrollWidth <= element.clientWidth) return
      setCurrent(Math.round(element.scrollLeft / element.clientWidth))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      element.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Keep the current tab in sight.
  useEffect(() => {
    const tab = tabs.current?.querySelector<HTMLElement>('[aria-current="true"]')
    const strip = tabs.current
    if (!tab || !strip) return
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2 })
  }, [current])

  const goTo = (index: number) => {
    const element = pager.current
    if (!element) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({ left: index * element.clientWidth, behavior: calm ? 'auto' : 'smooth' })
  }

  /** Page Up or Page Down from a shelf: focus moves to the one before or after. */
  const leave = (from: number, direction: -1 | 1) => {
    const panel = pager.current?.children[from + direction]
    panel?.querySelector<HTMLElement>('.game-box[tabindex="0"]')?.focus()
  }

  const describe = (item: ShelfItem, platform: LibraryPlatform | undefined) =>
    describeBox(item, platform, t)

  return (
    <div className="shelves">
      {shelves.length > 1 ? (
        <nav ref={tabs} className="shelf-tabs" aria-label={t('shelf.tabs')}>
          {shelves.map((shelf, index) => (
            <button
              key={shelf.key}
              type="button"
              className="shelf-tab"
              aria-current={index === current ? 'true' : undefined}
              onClick={() => goTo(index)}
            >
              {shelfName(shelf, t, true)}
              <span className="shelf-tab-count">{shelf.total}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <div ref={pager} className="shelf-pager">
        {shelves.map((shelf, index) => {
          const name = shelfName(shelf, t)
          // On a shelf that is not about status, say how many of its games are being played.
          const playing =
            shelf.kind === 'status'
              ? 0
              : shelf.items.filter((item) => item.game.status === 'playing').length
          const headingId = `shelf-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`
          return (
            <section
              key={shelf.key}
              className="shelf-panel sm:mt-10 sm:first:mt-6"
              data-scroll-root=""
              aria-labelledby={headingId}
            >
              <header className="flex items-baseline gap-3 pt-3 pb-1 sm:pt-0">
                <h2 id={headingId} className="title text-lg sm:text-xl">
                  {name}
                </h2>
                <span className="readout text-[0.6875rem] text-muted">
                  {t('shelf.count', { count: shelf.total })}
                </span>
                {playing > 0 ? (
                  <span className="flex items-center gap-1.5 readout text-[0.6875rem] text-marker">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-marker shadow-[0_0_calc(2px+var(--glow)*6px)_var(--marker)]"
                    />
                    {t('shelf.playing', { count: playing })}
                  </span>
                ) : null}
              </header>
              <ShelfGrid
                shelfKey={shelf.key}
                items={shelf.items}
                total={shelf.total}
                platforms={platforms}
                density={density}
                {...sizeOf(shelf)}
                label={t('shelf.games', { shelf: name })}
                describe={describe}
                openIndex={open?.key === shelf.key ? open.index : undefined}
                eager={index === 0 ? EAGER : 0}
                enter={enter}
                onOpen={(at) => onOpen({ key: shelf.key, index: at })}
                onLeave={(direction) => leave(index, direction)}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
