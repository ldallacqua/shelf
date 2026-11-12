import { decodeLibrary, type SnapshotFile } from '@/domain/library/snapshot'
import { showcaseOf, type ShowcaseGame } from '@/domain/setup/showcase'

/**
 * Some of my own games, for setting up's shelves (`showcaseOf`), read from my library file as a
 * private shelf reads it (`GET /api/v1/me/library`, fresh). Fetched here rather than through the
 * library's `loadMine`: importing `use-library.ts` into this page split the library page's script
 * into more files, 1.4 KB past its budget (measured 12 Nov 2026). Nothing, when the file can't be
 * read: cases in the room's colors stand in.
 */
export async function readMyGames(count: number): Promise<ShowcaseGame[] | undefined> {
  try {
    const response = await fetch('/api/v1/me/library', { cache: 'no-store' })
    if (!response.ok) return undefined
    return showcaseOf(decodeLibrary((await response.json()) as SnapshotFile), count)
  } catch {
    return undefined
  }
}
