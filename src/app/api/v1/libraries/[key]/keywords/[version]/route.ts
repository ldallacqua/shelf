import { failure } from '@/server/api/respond'
import { findPublicLibraryByKey, getKeywordsFile, keywordsPath } from '@/server/services/library'

/**
 * A public library's keywords file: fetched the first time a filter asks
 * for a keyword. Like the library file, its address carries the library's
 * key and version, so it is cached for a year and a return visit downloads
 * nothing.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/libraries/[key]/keywords/[version]'>,
) {
  const { key, version } = await context.params
  const library = await findPublicLibraryByKey(key)
  if (!library) return failure(404, 'not-found', 'There is no public library at this address.')
  const file = await getKeywordsFile(library.id)

  // A page opened a moment before a write may still ask for the version before it.
  if (version !== String(file.version)) {
    return new Response(null, {
      status: 307,
      headers: { Location: keywordsPath(key, file.version), 'Cache-Control': 'no-store' },
    })
  }

  return new Response(file.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
