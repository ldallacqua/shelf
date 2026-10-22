import type { MetadataRoute } from 'next'

import { siteUrl } from '@/server/site-url'

/**
 * Search engines may read the public pages (architecture, section 16). The
 * API is for programs, which `/llms.txt` describes; one's account and an
 * assistant's consent page are no one else's. Pages that must not be listed,
 * a private shelf or the design foundations among them, say so themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/*/account', '/*/consent'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
