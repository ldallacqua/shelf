import type { Shelf } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'

/** A shelf as a view draws it: the boxes known so far, and how many there will be. */
export type DrawnShelf = Shelf & { total: number }

/** Which box has its details open: the shelf it stands on, and its place there. */
export type OpenBox = { key: string; index: number }

/** What every view of the library is given. They show the same shelves in the same order. */
export type ViewProps = {
  shelves: readonly DrawnShelf[]
  platforms: ReadonlyMap<number, LibraryPlatform>
  open?: OpenBox
  onOpen: (box: OpenBox) => void
  /** Boxes arrive in a stagger: the first time the library is drawn. */
  enter: boolean
  /**
   * How many boxes a screen is taken to hold, as the server judged from the
   * request. Shelves that have not measured themselves share this many.
   */
  firstBoxes: number
}
