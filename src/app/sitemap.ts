import type { MetadataRoute } from 'next'

import { routing } from '@/i18n/routing'
import { listPublicShelves } from '@/server/services/library'
import { siteUrl } from '@/server/site-url'

/**
 * Every page a search engine may list (architecture, section 16): the
 * landing page, sign-up, privacy, and each public shelf with its trophy wall and games, in both
 * languages, each naming the other. A private shelf is never listed (ADR 004).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl()
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${site}/${routing.defaultLocale}${path}`,
    priority,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${site}/${locale}${path}`]),
      ),
    },
  })
  const shelves = await listPublicShelves()
  return [
    page('', 1),
    page('/sign-up', 0.8),
    page('/privacy', 0.2),
    ...shelves.flatMap(({ handle, games, trophies }) => [
      page(`/u/${handle}`, 0.6),
      // An empty trophy wall is not indexed, so it is not listed.
      ...(trophies ? [page(`/u/${handle}/trophies`, 0.5)] : []),
      ...games.map((slug) => page(`/u/${handle}/game/${slug}`, 0.4)),
    ]),
  ]
}
