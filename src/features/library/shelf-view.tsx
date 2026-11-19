'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { shareFirstBoxes } from '@/domain/library/view'
import { caseShapes } from '@/ui/game-case'

import { describeBox, shelfName } from './describe'
import { FoldBody, FoldToggle, foldedAway } from './fold-toggle'
import { EAGER_COVERS } from './opening-covers'
import type { Density } from './preferences'
import { ShelfGrid } from './shelf-grid'
import type { DrawnShelf, OpenBox, ViewProps } from './view-props'

/** A shelf that mixes platforms leaves room for the widest and tallest common cases. */
const MIXED = { slot: caseShapes.jewel.width, tall: caseShapes.keepCase.height }

const sizeOf = (shelf: DrawnShelf): { slot: number; tall: number } => {
  if (shelf.kind !== 'platform') return MIXED
  const shape = caseShapes[shelf.platform.shape]
  return { slot: shape.width, tall: shape.height }
}

type ShelfViewProps = ViewProps & { density: Density }

/** A shelf's Tab stop, if its games are drawn: none while it is folded away, wider than a phone. */
const stopOf = (panel: Element | undefined): HTMLElement | undefined => {
  const box = panel?.querySelector<HTMLElement>('[data-shelf-body] .game-box[tabindex="0"]')
  return box && !foldedAway(box) ? box : undefined
}

type ShelfSectionProps = {
  shelf: DrawnShelf
  /** This shelf's place among the shelves, from 0. */
  position: number
  unmeasured: number
  platforms: ReadonlyMap<number, LibraryPlatform>
  density: Density
  enter: boolean
  onOpen: (box: OpenBox) => void
  onLeave: (position: number, direction: -1 | 1) => void
}

/**
 * One shelf: its name, its counts, its games.
 *
 * A component of its own so that its words are worked out once. Counting and
 * wording a shelf ("36 games", "2 playing") goes through the translator, and
 * with a dozen shelves that was repeated for all of them every time anything
 * on the page changed: a game opened, the first boxes settled.
 */
function ShelfSection({
  shelf,
  position,
  unmeasured,
  platforms,
  density,
  enter,
  onOpen,
  onLeave,
}: ShelfSectionProps) {
  const t = useTranslations('Library')
  const name = shelfName(shelf, t)
  // On a shelf that is not about status, say how many of its games are being played.
  const playing =
    shelf.kind === 'status'
      ? 0
      : shelf.items.filter((item) => item.game.status === 'playing').length
  const headingId = `shelf-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`
  const describe = (item: ShelfItem, platform: LibraryPlatform | undefined) =>
    describeBox(item, platform, t)

  return (
    <section
      className="shelf-panel sm:mt-10 sm:first:mt-6"
      data-scroll-root=""
      data-shelf={shelf.key}
      aria-labelledby={headingId}
      // Where Tab from its phone tab lands when no game of it is drawn in time (`onTabKey`).
      tabIndex={-1}
    >
      {/* The counts go under the name when it needs the room, not into narrow columns beside it
          (step 10's review, 01, finding 54). */}
      <header className="flex flex-wrap items-baseline gap-x-3 pt-3 pb-1 sm:pt-0">
        <FoldToggle shelfKey={shelf.key} name={name} controls={`${headingId}-games`} />
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
      <FoldBody shelfKey={shelf.key} id={`${headingId}-games`}>
        <ShelfGrid
          shelfKey={shelf.key}
          items={shelf.items}
          total={shelf.total}
          unmeasured={unmeasured}
          platforms={platforms}
          density={density}
          {...sizeOf(shelf)}
          label={t('shelf.games', { shelf: name })}
          describe={describe}
          eager={position === 0 ? EAGER_COVERS : 0}
          enter={enter}
          position={position}
          onOpen={onOpen}
          onLeave={onLeave}
        />
      </FoldBody>
    </section>
  )
}

/**
 * The shelf in 2D. Wider than a phone, shelves stack down the page. On a
 * phone, one shelf fills the screen: swipe sideways for the next, and a row
 * of tabs shows where you are (spec 3.4).
 */
export function ShelfView({
  shelves,
  platforms,
  onOpen,
  enter,
  firstBoxes,
  density,
}: ShelfViewProps) {
  const t = useTranslations('Library')
  const pager = useRef<HTMLDivElement>(null)
  const tabs = useRef<HTMLElement>(null)
  /** The shelf in view on a phone. */
  const [current, setCurrent] = useState(0)
  /** The tab chosen with the keyboard, while focus is among the tabs: where the pager is going. */
  const [chosen, setChosen] = useState<number>()
  // Arrived: from here the strip follows the swipe again. A tapped tab keeps focus, so the choice
  // outlived the glide, and the strip stopped following (step 10's review, 01, finding 62).
  if (chosen !== undefined && chosen === current) setChosen(undefined)

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

  // Keep the current tab in sight; while the keyboard has chosen one, that one, as the pager
  // glides past the shelves between (step 10's review, 01, finding 52).
  const inSight = chosen ?? current
  useEffect(() => {
    const strip = tabs.current
    const tab = strip?.querySelectorAll<HTMLElement>('.shelf-tab')[inSight]
    if (!tab || !strip) return
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2 })
  }, [inSight])

  const goTo = (index: number) => {
    const element = pager.current
    if (!element) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({ left: index * element.clientWidth, behavior: calm ? 'auto' : 'smooth' })
  }

  /** Page Up or Page Down from a shelf: focus moves to the one before or after, past any folded away. */
  const leave = (from: number, direction: -1 | 1) => {
    const panels = pager.current?.children
    for (let at = from + direction; panels && at >= 0 && at < panels.length; at += direction) {
      const box = stopOf(panels[at])
      if (box) return box.focus()
    }
  }

  // Before a shelf has measured itself it draws its share of the first screen.
  const shares = shareFirstBoxes(
    shelves.map((shelf) => shelf.items.length),
    firstBoxes,
  )

  /**
   * The tabs are one stop for Tab, as each shelf is: arrows, Home and End go between them. Tab
   * goes on into the shelf chosen, not the one the pager is still gliding past, which undid the
   * choice (step 10's review, 01, finding 32).
   */
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      const panel = pager.current?.children[at]
      if (!(panel instanceof HTMLElement)) return
      event.preventDefault()
      // A shelf the pager hasn't reached may not have drawn its box yet. If it never does, focus
      // goes to the shelf itself rather than staying here (finding 47).
      let frames = 0
      const enter = () => {
        const box = stopOf(panel)
        if (box) box.focus()
        else if ((frames += 1) < 90) requestAnimationFrame(enter)
        else panel.focus()
      }
      enter()
      return
    }
    const last = shelves.length - 1
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: last }[event.key]
    if (to === undefined || to < 0 || to > last) return
    event.preventDefault()
    setChosen(to)
    tabs.current?.querySelectorAll<HTMLElement>('.shelf-tab')[to]?.focus()
    goTo(to)
  }
  const stopTab = chosen ?? current

  return (
    <div className="shelves">
      {shelves.length > 1 ? (
        <nav
          ref={tabs}
          className="shelf-tabs"
          aria-label={t('shelf.tabs')}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setChosen(undefined)
          }}
        >
          {shelves.map((shelf, index) => (
            <button
              key={shelf.key}
              type="button"
              className="shelf-tab"
              aria-current={index === current ? 'true' : undefined}
              tabIndex={index === stopTab ? 0 : -1}
              onKeyDown={(event) => onTabKey(event, index)}
              onClick={() => {
                setChosen(index)
                goTo(index)
              }}
            >
              {shelfName(shelf, t, true)}
              <span className="shelf-tab-count">{shelf.total}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <div ref={pager} className="shelf-pager">
        {shelves.map((shelf, index) => (
          <ShelfSection
            key={shelf.key}
            shelf={shelf}
            position={index}
            unmeasured={shares[index] ?? 0}
            platforms={platforms}
            density={density}
            enter={enter}
            onOpen={onOpen}
            onLeave={leave}
          />
        ))}
      </div>
    </div>
  )
}
