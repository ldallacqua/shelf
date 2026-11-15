import type { Library } from '@/domain/library/library'
import { decodeLibrary, type SnapshotFile } from '@/domain/library/snapshot'

/**
 * My whole library, for the duel (spec 3.14), read from my own file as a private shelf reads it
 * (`GET /api/v1/me/library`, fresh). Fetched here rather than through the library's `loadMine`, as
 * setting up does: importing `use-library.ts` into another page split the library page's script
 * past its budget (`features/start/my-games.ts`). Undefined when the file can't be read.
 */
export async function readMyLibrary(signal?: AbortSignal): Promise<Library | undefined> {
  try {
    const response = await fetch('/api/v1/me/library', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) return undefined
    return decodeLibrary((await response.json()) as SnapshotFile)
  } catch {
    return undefined
  }
}
