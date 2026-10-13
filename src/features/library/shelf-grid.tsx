'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'

import { GameBox, platformFor } from './game-box'
import type { Density } from './preferences'
import { useRowWindow } from './use-row-window'

/** Fewest boxes a row can hold, at the narrowest width: enough boards are drawn for that before the width is known. */
const FEWEST_COLUMNS = 3

/** How many boxes are drawn before the layout has been measured. */
const UNMEASURED = 48

type ShelfGridProps = {
  shelfKey: string
  /** The boxes known so far, from the shelf's first. */
  items: readonly ShelfItem[]
  /** How many boxes the shelf holds once the whole library has arrived. */
  total: number
  platforms: ReadonlyMap<number, LibraryPlatform>
  density: Density
  /** The widest and the tallest case on the shelf, in millimeters. */
  slot: number
  tall: number
  /** Names the list for assistive technology. */
  label: string
  describe: (item: ShelfItem, platform: LibraryPlatform | undefined) => string
  /** Position of the box whose details are open, if it stands on this shelf. */
  openIndex?: number
  /** How many of the first covers are fetched ahead of the rest. */
  eager?: number
  /** Boxes arrive in a stagger. Only for the first time a shelf is drawn. */
  enter?: boolean
  onOpen: (index: number) => void
  /** Page Up or Page Down: to the shelf before or after. */
  onLeave: (direction: -1 | 1) => void
}

type Range = [start: number, end: number]

/** Row ranges in order, with overlaps and neighbors joined. */
const joinRanges = (ranges: Range[]): Range[] => {
  const sorted = ranges.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0])
  const joined: Range[] = []
  for (const range of sorted) {
    const last = joined.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else joined.push([...range])
  }
  return joined
}

/**
 * One shelf's games, standing on lit boards.
 *
 * CSS lays the boxes out as a grid and decides how many fit on a row. The
 * boards and their light are a layer behind, one per row. Only rows near the
 * screen are in the page: `useRowWindow` says which.
 *
 * Keyboard: Tab stops at one box per shelf; arrows move between boxes, Home
 * and End go to the shelf's ends, Page Up and Page Down change shelf.
 */
export function ShelfGrid({
  shelfKey,
  items,
  total,
  platforms,
  density,
  slot,
  tall,
  label,
  describe,
  openIndex,
  eager = 0,
  enter,
  onOpen,
  onLeave,
}: ShelfGridProps) {
  const ref = useRef<HTMLUListElement>(null)
  const rowWindow = useRowWindow(ref, total)
  /** The box under the pointer or in focus. */
  const [hot, setHot] = useState<number>()
  /** The box Tab stops at. */
  const [stop, setStop] = useState(0)
  /** A box to move focus to once it is in the page. */
  const focusNext = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (focusNext.current === undefined) return
    const target = ref.current?.querySelector<HTMLElement>(`[data-index="${focusNext.current}"]`)
    if (target) {
      focusNext.current = undefined
      target.focus()
    }
  })

  const columns = rowWindow?.columns
  const tabStop = Math.min(stop, Math.max(0, items.length - 1))

  // Rows in the page: those near the screen, and the row of the box Tab
  // stops at, so focus can always land on it.
  const ranges: Range[] = rowWindow
    ? joinRanges([
        [rowWindow.start, rowWindow.end],
        [Math.floor(tabStop / rowWindow.columns), Math.floor(tabStop / rowWindow.columns) + 1],
      ])
    : [[0, Math.ceil(Math.min(items.length, UNMEASURED) / FEWEST_COLUMNS)]]
  const rows = rowWindow?.rows ?? ranges[0]?.[1] ?? 0
  const perRow = columns ?? FEWEST_COLUMNS

  const active = hot ?? openIndex
  const activeItem = active === undefined ? undefined : items[active]
  const activeRow = active === undefined || !columns ? undefined : Math.floor(active / columns)
  const activeLed = activeItem?.game.colors ? ledFrom(activeItem.game.colors[0]) : undefined

  const move = (to: number) => {
    const target = Math.min(items.length - 1, Math.max(0, to))
    if (target === tabStop && target !== to) return
    focusNext.current = target
    setStop(target)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, at: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const step = columns ?? 1
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(at + 1),
      ArrowLeft: () => move(at - 1),
      ArrowDown: () => at + step < items.length && move(at + step),
      ArrowUp: () => at - step >= 0 && move(at - step),
      Home: () => move(0),
      End: () => move(items.length - 1),
      PageDown: () => onLeave(1),
      PageUp: () => onLeave(-1),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  const indexOf = (target: EventTarget | null): number | undefined => {
    const box = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-index]')
    return box ? Number(box.dataset.index) : undefined
  }

  const cells = []
  const bays = []
  let previousEnd = 0
  for (const [start, end] of ranges) {
    if (start > previousEnd) {
      cells.push(
        <li
          key={`gap-${previousEnd}`}
          className="shelf-gap"
          aria-hidden="true"
          style={{ gridRow: `span ${start - previousEnd}` }}
        />,
      )
    }
    const from = start * perRow
    const to = columns ? Math.min(items.length, end * perRow) : Math.min(items.length, UNMEASURED)
    for (const index of Array.from({ length: Math.max(0, to - from) }, (_, at) => from + at)) {
      const item = items[index]
      if (!item) continue
      const platform = platformFor(item, platforms)
      const inActiveRow = activeRow !== undefined && Math.floor(index / perRow) === activeRow
      cells.push(
        <li
          key={`${item.game.slug}:${item.copy?.platform ?? ''}`}
          className="shelf-cell"
          data-cell=""
          data-enter={enter ? '' : undefined}
          aria-posinset={index + 1}
          aria-setsize={total}
          style={
            {
              '--i': index - from,
              // The whole row takes the color of the game in focus on it.
              '--led': inActiveRow ? activeLed : undefined,
            } as CSSProperties
          }
        >
          <GameBox
            item={item}
            platform={platform}
            density={density}
            label={describe(item, platform)}
            active={index === active}
            tabbable={index === tabStop}
            index={index}
            eager={index < eager}
            onOpen={() => onOpen(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        </li>,
      )
    }
    for (const row of Array.from({ length: end - start }, (_, at) => start + at)) {
      bays.push(
        <div
          key={row}
          className="bay shelf-bay"
          style={
            { '--row': row, '--led': row === activeRow ? activeLed : undefined } as CSSProperties
          }
        >
          <div className="bay-glow" />
          <div className="ledge" />
        </div>,
      )
    }
    previousEnd = end
  }
  if (rows > previousEnd) {
    cells.push(
      <li
        key="gap-end"
        className="shelf-gap"
        aria-hidden="true"
        style={{ gridRow: `span ${rows - previousEnd}` }}
      />,
    )
  }

  return (
    // Safari stops calling a list a list once its bullets are styled away; the role says it again.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul
      ref={ref}
      role="list"
      className="shelf-grid"
      data-shelf={shelfKey}
      data-density={density}
      aria-label={label}
      style={{ '--slot': slot, '--tall': tall } as CSSProperties}
      onFocus={(event) => {
        const index = indexOf(event.target)
        if (index === undefined) return
        setHot(index)
        setStop(index)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHot(undefined)
      }}
      onPointerOver={(event) => {
        // A finger has no hover: a touch opens the game instead.
        if (event.pointerType === 'touch') return
        const index = indexOf(event.target)
        if (index !== undefined) setHot(index)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setHot(undefined)
      }}
    >
      {cells}
      <li className="shelf-bays" aria-hidden="true">
        {bays}
      </li>
    </ul>
  )
}
