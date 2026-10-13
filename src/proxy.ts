import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { isKnownPath, splitLocale } from './i18n/known-paths'
import { routing } from './i18n/routing'

// Sends `/` to the visitor's language and keeps every address prefixed.
const withLanguage = createMiddleware(routing)

// The route that draws "not found": src/app/[locale]/missing.
const MISSING = '/missing'
// Marks the proxy's own request for that page, so it is let through.
const INTERNAL = 'x-shelf-internal'

export default async function proxy(request: NextRequest) {
  const address = splitLocale(request.nextUrl.pathname)

  if (address && !isKnownPath(address.rest)) {
    if (address.rest === MISSING && request.headers.has(INTERNAL)) return NextResponse.next()
    return notFound(request, address.locale)
  }

  return withLanguage(request)
}

/**
 * Answers 404 with that language's "not found" page as the body. The address
 * in the browser stays as typed.
 */
async function notFound(request: NextRequest, locale: string): Promise<NextResponse> {
  const headers = new Headers({ [INTERNAL]: '1' })
  // A preview deployment sits behind Vercel's sign-in. Pass the visitor's pass along.
  for (const name of ['cookie', 'x-vercel-protection-bypass']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const page = await fetch(new URL(`/${locale}${MISSING}`, request.url), { headers })
    if (page.ok) {
      return new NextResponse(page.body, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex',
        },
      })
    }
  } catch {
    // Fall through to the plain answer.
  }

  return new NextResponse('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export const config = {
  // Everything except the API, Next's own files, and anything with a file extension.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
}
