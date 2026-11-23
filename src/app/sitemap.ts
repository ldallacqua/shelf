import type { MetadataRoute } from 'next'

import { routing } from '@/i18n/routing'
import { listPublicShelves } from '@/server/services/library'
import { siteUrl } from '@/server/site-url'

/**
 * Every page a search engine may list (architecture, section 16): the
 * landing page, sign-up, privacy, the terms, and each public shelf with its trophy wall, in both
 * languages, each naming the other. A private shelf is never listed (ADR 004).
 *
 * A game's page is not listed, though it may still be indexed from its shelf's links. Listed, every
 * game of every public shelf was handed to crawlers, and a crawl after a deployment or a change to the
 * library writes each page into Vercel's cache again, over a megabyte apiece: the likeliest source of
 * the ISR writes that neared the plan's limit, for pages that mostly repeat a store's description
 * (architecture, section 25).
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
    page('/terms', 0.2),
    ...shelves.flatMap(({ handle, trophies }) => [
      page(`/u/${handle}`, 0.6),
      // An empty trophy wall is not indexed, so it is not listed.
      ...(trophies ? [page(`/u/${handle}/trophies`, 0.5)] : []),
    ]),
  ]
}
