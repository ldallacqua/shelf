import { Arriving } from '@/features/game-detail/hand-off'
import { WithList } from '@/features/library-beside/with-list'

/**
 * Around every game's page on a shelf: my library beside it, as a list
 * (ADR 009, phase 2). A layout, so the list stays put from one game to the
 * next and only the page beside it changes. A game opened from the list is
 * drawn here while the router waits for it (`Arriving`).
 */
export default function GameLayout({ children }: LayoutProps<'/[locale]/u/[handle]/game'>) {
  return (
    <WithList>
      <Arriving>{children}</Arriving>
    </WithList>
  )
}
