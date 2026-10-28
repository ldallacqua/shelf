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
 * come from the site itself, covers from IGDB's image servers, achievements'
 * artwork from Steam's (`domain/achievements/steam.ts`), and nothing
 * else is fetched but the desktop app's commands; a game's video, once pressed, plays in YouTube's frame. Inline scripts are allowed: pages are built ahead of
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
    'https://cdn.akamai.steamstatic.com',
    ...toolbar('https://vercel.live', 'https://vercel.com'),
  ],
  'font-src': ["'self'", ...toolbar('https://vercel.live', 'https://assets.vercel.com')],
  'connect-src': [
    "'self'",
    // Shelf for Windows' channel to its own commands, on Windows (ADR 005): nothing answers
    // there in a browser.
    'http://ipc.localhost',
    ...toolbar('https://vercel.live', 'wss://ws-us3.pusher.com'),
  ],
  // A game's video, once pressed (spec 7.1): YouTube's privacy-enhanced player, nothing else.
  'frame-src': ['https://www.youtube-nocookie.com', ...toolbar('https://vercel.live')],
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
  // No `Cross-Origin-Opener-Policy`: an assistant signing in may open the
  // consent page in a window of its own and need to hear back from it.
]

const nextConfig: NextConfig = {
  async headers() {
    // Not on Next.js's own script, style and font files: a policy governs a
    // page, and on every one of those files it was 600 bytes for nothing.
    return [{ source: '/((?!_next/static/).*)', headers: securityHeaders }]
  },
  cacheComponents: true,
  // A page with a part made per visit (the library) carries a second copy of its
  // React payload, for the browser's cache of what links lead to. Without it,
  // every link in view is prefetched as the page starts: measured at step 9 on
  // a phone's speed, that blocked the library 758 ms in place of 511, and the
  // landing page 595 in place of 322.
  partialPrefetching: true,
  experimental: {
    // The stylesheet is written into each page, not linked from it: the first
    // paint no longer waits for a second file. Measured at step 9 on a phone's
    // speed, alternating with the linked file: the landing page painted in
    // 1.36 s in place of 1.86, the library in 1.20 in place of 2.16. A page
    // loaded again carries its 18 KB again; moving between pages does not.
    inlineCss: true,
  },
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
