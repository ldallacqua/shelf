import { getLibrarySnapshot, getLibraryVersion, snapshotPath } from '@/server/services/library'

/**
 * The library file. Its address contains the library's version, so the
 * content at an address never changes and can be cached for a year by the
 * edge and by the browser. A return visit downloads nothing unless the
 * library changed.
 */

/**
 * The current version's file is made when the site is built, and served as a
 * static file: the first visitor after a deployment does not wait for a
 * server to start. A version that appears later (I added a game) is made on
 * its first request.
 */
export async function generateStaticParams() {
  return [{ version: String(await getLibraryVersion()) }]
}

export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/library/snapshot/[version]'>,
) {
  const { version } = await context.params
  const snapshot = await getLibrarySnapshot()

  // Any other address is sent on to the current one: a page opened a moment
  // before a write may still point at the version before it.
  if (version !== String(snapshot.version)) {
    return new Response(null, {
      status: 307,
      headers: { Location: snapshotPath(snapshot.version), 'Cache-Control': 'no-store' },
    })
  }

  return new Response(snapshot.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
