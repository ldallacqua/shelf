import { failure } from '@/server/api/respond'
import { findPublicLibraryByKey, getLibrarySnapshot, snapshotPath } from '@/server/services/library'

/**
 * A public library's file. Its address contains the library's key and
 * version, so the content at an address never changes and can be cached
 * for a year by the edge and by the browser. A return visit downloads
 * nothing unless the library changed. A private library has no file here:
 * its account reads it from `/api/v1/me/library` (ADR 004).
 *
 * Made on its first request, then kept by the edge.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/libraries/[key]/snapshot/[version]'>,
) {
  const { key, version } = await context.params
  const library = await findPublicLibraryByKey(key)
  if (!library) return failure(404, 'not-found', 'There is no public library at this address.')
  const snapshot = await getLibrarySnapshot(library.id)

  // Any other address is sent on to the current one: a page opened a moment
  // before a write may still point at the version before it.
  if (version !== String(snapshot.version)) {
    return new Response(null, {
      status: 307,
      headers: { Location: snapshotPath(key, snapshot.version), 'Cache-Control': 'no-store' },
    })
  }

  return new Response(snapshot.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
