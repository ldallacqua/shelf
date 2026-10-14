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

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  // A deployment with no database connected serves a sample database that was
  // built with it (`pnpm db:prepare`). Next.js only ships files it can see
  // being imported, so the file is named here. With a database connected the
  // file does not exist and this matches nothing.
  outputFileTracingIncludes: {
    '/*': ['./.data/shelf.db'],
  },
}

export default withNextIntl(nextConfig)
