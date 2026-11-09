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

export { NO_HANDLE } from '@/features/library/shelf-address'
