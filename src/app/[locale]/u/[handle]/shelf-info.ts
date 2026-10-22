import type { ShelfInfo } from '@/features/library/shelf-address'
import type { LibraryInfo } from '@/server/services/library'

/**
 * What a shelf's pages tell the browser about it (ADR 004). A private one's
 * name and file key stay on the server: its pages are frames, which its own
 * account fills from `/api/v1/me/…`, and anyone else is told only that it is
 * private.
 */
export const shelfInfoOf = (library: LibraryInfo): ShelfInfo =>
  library.public
    ? {
        handle: library.handle,
        name: library.name,
        public: true,
        files: { kind: 'public', key: library.key },
      }
    : { handle: library.handle, name: '', public: false, files: { kind: 'mine' } }

/**
 * No shelf's pages are built ahead: each is built on its first visit, from
 * the frame built here, and kept until its library changes. Cache Components
 * needs one handle to build that frame from, and `none` is no shelf's: it is
 * reserved.
 */
export const NO_HANDLE = 'none'
