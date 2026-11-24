import type { MetadataRoute } from 'next'

import { siteUrl } from '@/server/site-url'

/**
 * The parameters that show a page another way: the library's filter and its
 * arrangement, and the trophy wall's filter, ranking and rarity. Each links
 * to more of them (a filtered wall's genres filter within its filter), so
 * their addresses never end. Not the year: a year's recap is a page of its
 * own, with its own card.
 */
const VIEW_PARAMETERS = ['q', 'sort', 'group', 'view', 'seed', 'by', 'rarity'] as const

/**
 * Search engines may read the public pages (architecture, section 16), but
 * not the same page in every filter: a crawler that followed them spent the
 * database's month of reads in days (section 25). The API is for programs,
 * which `/llms.txt` describes; one's account and an assistant's consent page
 * are no one else's. Pages that must not be listed, a private shelf or the
 * design foundations among them, say so themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/*/account',
        '/*/consent',
        '/*/downloads',
        // Wherever the parameter stands in the query: first, or after another.
        ...VIEW_PARAMETERS.flatMap((name) => [`/*?${name}=`, `/*&${name}=`]),
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
