import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

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
