import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NotFound } from '@/features/shell/not-found'

/**
 * The "not found" page, as an ordinary page built ahead of time.
 *
 * Nobody links here. The proxy (src/proxy.ts) fetches this page and returns
 * its HTML with a 404 status for any address that has no page. That way the
 * answer is a real 404 and the page is complete in the HTML, in the right
 * language and theme, before any JavaScript runs. Calling notFound() cannot do
 * both: with pages built ahead, Next.js draws its "not found" page in the browser.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('NotFound')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default function MissingPage() {
  return <NotFound />
}
