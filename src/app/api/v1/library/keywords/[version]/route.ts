import { getKeywordsFile, getLibraryVersion, keywordsPath } from '@/server/services/library'

/**
 * The keywords file: fetched the first time a filter asks for a keyword.
 * Like the library file, its address carries the library's version, so it
 * is cached for a year and a return visit downloads nothing.
 */

export async function generateStaticParams() {
  return [{ version: String(await getLibraryVersion()) }]
}

export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/library/keywords/[version]'>,
) {
  const { version } = await context.params
  const file = await getKeywordsFile()

  // A page opened a moment before a write may still ask for the version before it.
  if (version !== String(file.version)) {
    return new Response(null, {
      status: 307,
      headers: { Location: keywordsPath(file.version), 'Cache-Control': 'no-store' },
    })
  }

  return new Response(file.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
