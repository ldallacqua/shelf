import type { CSSProperties } from 'react'

import { cn } from '@/ui/cn'
import { caseShapes } from '@/ui/game-case'

/**
 * Places for games on their way, in each view's own shapes: cases on the
 * shelf here, covers on the wall and rows in the list beside those views.
 * The library draws them before its first boxes arrive, and in the places
 * whose boxes come with the library file. They are where the games will
 * stand, so nothing moves when the games arrive. Hidden from assistive
 * technology, which is told "Loading" instead.
 *
 * No hooks and no words, so the page built ahead of time can use them too.
 */

/** Places in the widest row of the loading shelf: more than the widest page holds. */
const WIDEST_ROW = 10

/** The case the loading shelf is drawn with: the one a box with no platform known gets. */
const PLAIN = caseShapes.keepCase

/** A ghost's turn in the wave that runs along the row. */
export const ghostOrder = (index: number) => ({ '--i': index }) as CSSProperties

/** A case-shaped place on a shelf, at the shelf's own size. */
export function GhostCase({ index }: { index: number }) {
  return (
    <li
      className="shelf-cell"
      data-cell=""
      data-ghost=""
      aria-hidden="true"
      style={ghostOrder(index)}
    >
      <span className="ghost ghost-case" />
    </li>
  )
}

/** A shelf's name and count, before they are known. */
export function GhostHeading({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-7 items-center gap-3', className)}>
      <span className="ghost h-4 w-36" />
      <span className="ghost h-2.5 w-14" />
    </div>
  )
}

/** One loading shelf: a name, and `rows` rows of cases on lit boards. */
function GhostShelf({ rows, className }: { rows: number; className?: string }) {
  return (
    <section className={cn('shelf-panel sm:mt-10 sm:first:mt-6', className)}>
      <GhostHeading className="box-content pt-3 pb-1 sm:pt-0" />
      <ul
        className="shelf-grid"
        data-rows=""
        style={{ '--slot': PLAIN.width, '--tall': PLAIN.height, '--rows': rows } as CSSProperties}
      >
        {Array.from({ length: rows * WIDEST_ROW }, (_, index) => (
          <GhostCase key={index} index={index} />
        ))}
        <li className="shelf-bays">
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="bay shelf-bay" style={{ '--row': row } as CSSProperties}>
              <div className="bay-glow" />
              <div className="ledge" />
            </div>
          ))}
        </li>
      </ul>
    </section>
  )
}

/** The shelf view, loading: on a phone one shelf and its row of tabs, on anything wider two shelves. */
export function GhostShelves() {
  return (
    <div className="shelves" aria-hidden="true">
      <div className="shelf-tabs">
        {['w-20', 'w-16', 'w-16', 'w-24', 'w-14'].map((width, index) => (
          <span
            key={index}
            className={cn('ghost h-9 flex-none rounded-full', width)}
            style={ghostOrder(index)}
          />
        ))}
      </div>
      <div className="shelf-pager">
        <GhostShelf rows={3} />
        <GhostShelf rows={2} className="max-sm:hidden" />
      </div>
    </div>
  )
}
