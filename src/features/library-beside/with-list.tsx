import { Suspense, type ReactNode } from 'react'

import { LibraryBeside } from './beside'
import { BesideColumn, BesideGhost } from './beside-ghost'

/**
 * A game's page with my library beside it, as a list (ADR 009, phase 2): the
 * layout around a shelf's games, and the same frame a shelf's page draws in
 * its place for a game the router is still fetching (`hand-off.tsx`), so
 * nothing moves when the router lands.
 *
 * Nothing here is read on the server, so its frame is the same for every
 * shelf and the router draws it at once wherever a game is opened from. The
 * list reads its shelf from the address in the browser, which a page built
 * ahead without one cannot: there it is the list's ghost.
 */
export function WithList({ children }: { children: ReactNode }) {
  return (
    <div className="game-layout">
      <Suspense
        fallback={
          <BesideColumn>
            <BesideGhost />
          </BesideColumn>
        }
      >
        <LibraryBeside />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
