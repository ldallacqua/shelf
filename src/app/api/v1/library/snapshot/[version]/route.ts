import { getLibrarySnapshot, snapshotPath } from '@/server/services/library'

/**
 * The library file. Its address contains the library's version, so the
 * content at an address never changes and can be cached for a year by the
 * edge and by the browser. A return visit downloads nothing unless the
 * library changed.
 *
 * An address with an old version is sent on to the current one: a page built
 * a moment before a write may still point there.
 */
export async function GET(request: Request, context: { params: Promise<{ version: string }> }) {
  const { version } = await context.params
  const snapshot = await getLibrarySnapshot()

  if (version !== String(snapshot.version)) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: new URL(snapshotPath(snapshot.version), request.url).pathname,
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response(snapshot.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
