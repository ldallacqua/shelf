'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'

import { GameBox, platformFor } from './game-box'
import { GhostCase } from './ghosts'
import type { Density } from './preferences'
import { useScrub } from './scrub'
import { boardsOf, piecesOf, runsOf } from './shelf-layout'
import { useRowWindow } from './use-row-window'
import type { OpenBox } from './view-props'

/** Fewest boxes a row can hold, at the narrowest width: enough boards are drawn for that before the width is known. */
const FEWEST_COLUMNS = 3

type ShelfGridProps = {
  shelfKey: string
  /** The boxes known so far, from the shelf's first. */
  items: readonly ShelfItem[]
  /** How many boxes the shelf holds once the whole library has arrived. Until then, the rest are ghosts. */
  total: number
  /**
   * How many boxes to draw before the layout has been measured: this shelf's
   * share of the first screen. A shelf further down draws one, and the rest
   * of its window a frame later.
   */
  unmeasured: number
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
  /** This shelf's place among the shelves, from 0. */
  position: number
  onOpen: (box: OpenBox) => void
  /** Page Up or Page Down: to the shelf before or after the one at `position`. */
  onLeave: (position: number, direction: -1 | 1) => void
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
  unmeasured,
  platforms,
  density,
  slot,
  tall,
  label,
  describe,
  openIndex,
  eager = 0,
  enter,
  position,
  onOpen,
  onLeave,
}: ShelfGridProps) {
  const ref = useRef<HTMLUListElement>(null)
  const scrubTitle = useRef<HTMLLIElement>(null)
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

  // Every place on the shelf, the ones whose boxes come with the library file included: those hold ghosts.
  const runs = runsOf(rowWindow, total, unmeasured, tabStop)
  const perRow = columns ?? FEWEST_COLUMNS
  const rows = rowWindow?.rows ?? Math.ceil((runs[0]?.to ?? 0) / perRow)

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
      PageDown: () => onLeave(position, 1),
      PageUp: () => onLeave(position, -1),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  // One function for the whole shelf, the same from one drawing to the next,
  // so a box that did not change is not drawn again.
  const openAt = (index: number) => onOpen({ key: shelfKey, index })

  // Spines are narrow: pressing and sliding along the ledge picks one precisely.
  useScrub(ref, scrubTitle, {
    enabled: density === 'compact',
    titleOf: (index) => items[index]?.game.title,
    onHot: setHot,
    onPick: openAt,
  })

  const indexOf = (target: EventTarget | null): number | undefined => {
    const box = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-index]')
    return box ? Number(box.dataset.index) : undefined
  }

  const cells = piecesOf(runs, perRow, rows).map((piece) => {
    if (piece.kind !== 'box') {
      return (
        <li
          key={`${piece.kind}-${piece.at}`}
          className="shelf-gap"
          aria-hidden="true"
          style={
            piece.kind === 'rows'
              ? { gridRow: `span ${piece.rows}` }
              : { gridColumn: `span ${piece.places}` }
          }
        />
      )
    }
    const { index } = piece
    const item = items[index]
    if (!item) return <GhostCase key={`ghost-${index}`} index={piece.stagger} />
    const platform = platformFor(item, platforms)
    const inActiveRow = activeRow !== undefined && Math.floor(index / perRow) === activeRow
    return (
      <li
        key={`${item.game.slug}:${item.copy?.platform ?? ''}`}
        className="shelf-cell"
        data-cell=""
        data-enter={enter ? '' : undefined}
        aria-posinset={index + 1}
        aria-setsize={total}
        style={
          {
            '--i': piece.stagger,
            // The whole row takes the color of the game in focus on it.
            '--led': inActiveRow ? activeLed : undefined,
          } as CSSProperties
        }
      >
        <GameBox
          item={item}
          platform={platform}
          density={density}
          label={describe}
          active={index === active}
          tabbable={index === tabStop}
          index={index}
          eager={index < eager}
          onOpen={openAt}
          onKeyDown={onKeyDown}
        />
      </li>
    )
  })

  const bays = boardsOf(runs, perRow).map((row) => (
    <div
      key={row}
      className="bay shelf-bay"
      style={{ '--row': row, '--led': row === activeRow ? activeLed : undefined } as CSSProperties}
    >
      <div className="bay-glow" />
      <div className="ledge" />
    </div>
  ))

  return (
    // Safari stops calling a list a list once its bullets are styled away; the role says it again.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul
      ref={ref}
      role="list"
      className="shelf-grid"
      data-shelf={shelfKey}
      data-grid-of={shelfKey}
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
      {density === 'compact' ? (
        // The title of the spine under a scrubbing finger, above it (`useScrub`).
        <li ref={scrubTitle} className="scrub-title" aria-hidden="true" hidden />
      ) : null}
    </ul>
  )
}
