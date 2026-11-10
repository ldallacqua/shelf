import type { ReactElement } from 'react'

import type { LibraryGame, LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { GameAbove } from '@/features/library-beside/steps'
import { WithList } from '@/features/library-beside/with-list'
import { ShelfProvider } from '@/features/library/shelf'
import type { ShelfInfo } from '@/features/library/shelf-address'

import { GameDetail } from './game-detail'

export { loadEditor } from './owner-mine'

type DrawnPageProps = {
  shelf: ShelfInfo
  game: LibraryGame
  /** The game's tags, by name. */
  tags: readonly LibraryTag[]
  platforms: ReadonlyMap<number, LibraryPlatform>
  /** The file the shelf shows for the cover, drawn at once under the larger one. */
  placeholder?: string
}

/**
 * A game's page as the library draws it, from what the library file knows
 * (`hand-off.tsx`): the parts only the page knows wait as ghosts. It is the
 * page the server draws, so what arrives replaces it where it stands.
 */
export function drawPage({ shelf, game, tags, platforms, placeholder }: DrawnPageProps) {
  return (
    <ShelfProvider shelf={shelf}>
      <GameDetail
        handle={shelf.handle}
        game={game}
        tags={tags}
        platforms={platforms}
        placeholder={placeholder}
        above={<GameAbove handle={shelf.handle} slug={game.slug} />}
        editable
      />
    </ShelfProvider>
  )
}

/**
 * The drawn page with the library beside it, as the layout around a shelf's
 * games draws the page: what a shelf's page draws in its place while the
 * router fetches the game (`Arriving`, in `hand-off.tsx`).
 */
export function withList(page: ReactElement) {
  return <WithList>{page}</WithList>
}
