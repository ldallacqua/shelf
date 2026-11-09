import { Suspense } from 'react'

import type { LibraryGame, LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { ShelfProvider } from '@/features/library/shelf'
import type { ShelfInfo } from '@/features/library/shelf-address'

import { BackToLibrary, LibraryLink } from './back-to-library'
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
        above={
          <Suspense fallback={<LibraryLink handle={shelf.handle} />}>
            <BackToLibrary handle={shelf.handle} />
          </Suspense>
        }
        editable
      />
    </ShelfProvider>
  )
}
