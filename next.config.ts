import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: {
    // The messages are compiled when the app is built, so the browser neither
    // downloads a message parser nor runs one while the page starts up: on a
    // mid-range phone that was about 50 ms of the library's first second.
    // `t.raw` does not work with compiled messages, and nothing here uses it.
    // `locales: []` because nothing is extracted from the code.
    messages: { path: './messages', format: 'json', locales: [], precompile: true },
  },
})

const development = process.env.NODE_ENV === 'development'
// Vercel's toolbar is offered on previews only, and comes from its own hosts.
const preview = process.env.VERCEL_ENV === 'preview'
const toolbar = (...sources: string[]) => (preview ? sources : [])

/**
 * What a page may load and do (architecture, section 20). Scripts and styles
 * come from the site itself, covers from IGDB's image servers, and nothing
 * else is fetched. Inline scripts are allowed: pages are built ahead of
 * time, so they cannot carry a fresh nonce, and Next.js and React write
 * inline scripts of their own. React needs `eval` while developing only.
 */
const contentSecurityPolicy = Object.entries({
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    ...(development ? ["'unsafe-eval'"] : []),
    ...toolbar('https://vercel.live'),
  ],
  'style-src': ["'self'", "'unsafe-inline'", ...toolbar('https://vercel.live')],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://images.igdb.com',
    ...toolbar('https://vercel.live', 'https://vercel.com'),
  ],
  'font-src': ["'self'", ...toolbar('https://vercel.live', 'https://assets.vercel.com')],
  'connect-src': ["'self'", ...toolbar('https://vercel.live', 'wss://ws-us3.pusher.com')],
  'frame-src': preview ? ['https://vercel.live'] : ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'manifest-src': ["'self'"],
})
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing on the site uses these; a page that is broken into cannot either.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // For browsers older than `frame-ancestors`.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig: NextConfig = {
  async headers() {
    // Not on Next.js's own script, style and font files: a policy governs a
    // page, and on every one of those files it was 600 bytes for nothing.
    return [{ source: '/((?!_next/static/).*)', headers: securityHeaders }]
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  // React's preloads (the fonts, the cover host) go in the page's <head>, not
  // in a Link header. A shelf's page is built again in the background after a
  // change, and a header can be lost from that build where a tag can't: the
  // library then painted in fallback fonts and shifted when they swapped.
  reactMaxHeadersLength: 0,
  // A deployment with no database connected serves a sample database that was
  // built with it (`pnpm db:prepare`). Next.js only ships files it can see
  // being imported, so the file is named here. With a database connected the
  // file does not exist and this matches nothing.
  outputFileTracingIncludes: {
    '/*': ['./.data/shelf.db'],
  },
}

export default withNextIntl(nextConfig)
