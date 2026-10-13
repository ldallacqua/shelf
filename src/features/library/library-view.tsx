'use client'

import { useLocale, useTranslations } from 'next-intl'
import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { useEffect, useRef, useState } from 'react'

import { groupings, type Grouping } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import {
  arrangeLibrary,
  DEFAULT_GROUPING,
  DEFAULT_VIEW,
  firstScreenShelves,
  views,
  type FirstScreen,
  type View,
} from '@/domain/library/view'
import { Button } from '@/ui/button'
import { Ledge } from '@/ui/ledge'

import { GamePreview } from './game-preview'
import { ListView } from './list-view'
import { markPageLive } from './live'
import { ShelfView } from './shelf-view'
import { StatsLine } from './stats-line'
import { Toolbar } from './toolbar'
import { useFlip } from './use-flip'
import { useLibrary } from './use-library'
import { useDensity, useWallSize } from './use-preference'
import type { DrawnShelf, OpenBox } from './view-props'
import { WallView } from './wall-view'

// Each change of view or grouping is a step in the browser's history, so Back undoes it.
const viewParam = parseAsStringLiteral(views)
  .withDefault(DEFAULT_VIEW)
  .withOptions({ history: 'push' })
const groupParam = parseAsStringLiteral(groupings)
  .withDefault(DEFAULT_GROUPING)
  .withOptions({ history: 'push' })

/** How long the first boxes take to arrive on the shelf, with room to spare. */
const ARRIVAL_MS = 1400

type LibraryViewProps = {
  /** The start of the library, sent with the page. */
  first: FirstScreen
  /** The grouping the first screen was built for. */
  firstGroup: Grouping
}

/**
 * The library: one set of shelves, shown as a shelf, a wall or a list.
 *
 * The page arrives with the first screen of boxes in it. The whole library
 * follows as one cached file, and from then on every regroup happens here,
 * on the device, with no request.
 */
export function LibraryView({ first, firstGroup }: LibraryViewProps) {
  const t = useTranslations('Library')
  const locale = useLocale()
  const [view, setView] = useQueryState('view', viewParam)
  const [group, setGroup] = useQueryState('group', groupParam)
  const [density, setDensity] = useDensity()
  const [wallSize, setWallSize] = useWallSize()
  const [open, setOpen] = useState<OpenBox>()
  const state = useLibrary(first.version)
  const scope = useRef<HTMLDivElement>(null)

  // Boxes arrive in a stagger once, when the page is first drawn.
  const [arriving, setArriving] = useState(true)
  useEffect(() => {
    // From here on, whatever joins the page was added on this device.
    markPageLive()
    const timer = setTimeout(() => setArriving(false), ARRIVAL_MS)
    return () => clearTimeout(timer)
  }, [])

  const library = state.status === 'ready' ? state.library : undefined

  // Until the library file arrives there are only the boxes that came with
  // the page, and only for the grouping they were chosen for.
  let shelves: DrawnShelf[] = []
  if (library) {
    shelves = arrangeLibrary(library.games, library.names, { group }, locale).map((shelf) => ({
      ...shelf,
      total: shelf.items.length,
    }))
  } else if (group === firstGroup) {
    shelves = firstScreenShelves(first, { group }, locale)
  }

  const platforms = new Map<number, LibraryPlatform>(
    (library?.names.platform ?? first.platforms).map((platform) => [platform.id, platform]),
  )
  const tags = library?.names.tag ?? first.tags

  const capture = useFlip(scope, `${view}:${group}:${density}`)
  const change = <Value,>(set: (value: Value) => unknown, value: Value) => {
    capture()
    setOpen(undefined)
    void set(value)
  }

  // The game whose details are open, and its neighbors in the current order.
  const openShelf = open ? shelves.findIndex((shelf) => shelf.key === open.key) : -1
  const openItem = open ? shelves[openShelf]?.items[open.index] : undefined
  const step = (direction: -1 | 1): OpenBox | undefined => {
    if (!open || openShelf < 0) return undefined
    const index = open.index + direction
    const shelf = shelves[openShelf]
    if (shelf?.items[index]) return { key: shelf.key, index }
    // Off the end of a shelf: on to the next shelf's first box, or back to the last of the one before.
    for (let at = openShelf + direction; at >= 0 && at < shelves.length; at += direction) {
      const next = shelves[at]
      if (next && next.items.length > 0) {
        return { key: next.key, index: direction === 1 ? 0 : next.items.length - 1 }
      }
    }
    return undefined
  }
  const previous = step(-1)
  const next = step(1)

  // When the sheet closes, focus returns to the box of the game last shown
  // in it: stepping through games moves your place on the shelf with you.
  const lastOpen = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (openItem) {
      const { game, copy } = openItem
      lastOpen.current = copy ? `${game.slug}:${copy.platform}` : game.slug
    }
  })
  const returnFocus = (): boolean => {
    const key = lastOpen.current
    if (!key) return false
    const box = scope.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(key)}"]`)
    box?.focus()
    return Boolean(box)
  }

  const viewProps = { shelves, platforms, open, onOpen: setOpen, enter: arriving }

  return (
    <div ref={scope} className="library" data-view={view}>
      <div className="flex flex-none flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-4 pb-3 sm:pt-10 sm:pb-5">
        <h1 className="title text-2xl sm:text-5xl">{t('title')}</h1>
        <StatsLine stats={first.stats} />
      </div>

      <Toolbar
        view={view}
        onView={(value: View) => change(setView, value)}
        group={group}
        onGroup={(value: Grouping) => change(setGroup, value)}
        density={density}
        onDensity={(value) => change(setDensity, value)}
        wallSize={wallSize}
        onWallSize={setWallSize}
      />

      {state.status === 'failed' ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-sm"
        >
          <p>{t('error.title')}</p>
          <Button size="sm" onClick={state.retry}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}

      {shelves.length === 0 ? (
        // The wall and the boards first; the boxes follow.
        <div className="shelves pt-6" aria-busy="true">
          <p className="sr-only" role="status">
            {t('loading')}
          </p>
          <Ledge itemsClassName="h-40 sm:h-52" />
          <Ledge className="mt-10" itemsClassName="h-40 sm:h-52" />
        </div>
      ) : (
        <div key={`${view}:${group}`} className="motion-reduce:[&>*]:library-swap contents">
          {view === 'shelf' ? <ShelfView {...viewProps} density={density} /> : null}
          {view === 'wall' ? <WallView {...viewProps} size={wallSize} /> : null}
          {view === 'list' ? <ListView {...viewProps} /> : null}
        </div>
      )}

      <GamePreview
        item={openItem}
        platforms={platforms}
        tags={tags}
        onClose={() => setOpen(undefined)}
        onReturnFocus={returnFocus}
        onPrevious={previous ? () => setOpen(previous) : undefined}
        onNext={next ? () => setOpen(next) : undefined}
      />
    </div>
  )
}
