import { Suspense } from 'react'

import { LibraryBeside } from '@/features/library-beside/beside'
import { BesideColumn, BesideGhost } from '@/features/library-beside/beside-ghost'

/**
 * Around every game's page on a shelf: my library beside it, as a list
 * (ADR 009, phase 2). A layout, so the list stays put from one game to the
 * next and only the page beside it changes.
 *
 * Nothing here is read on the server, so its frame is the same for every
 * shelf and the router draws it at once wherever a game is opened from. The
 * list reads its shelf from the address in the browser, which a page built
 * ahead without one cannot: there it is the list's ghost.
 */
export default function GameLayout({ children }: LayoutProps<'/[locale]/u/[handle]/game'>) {
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
