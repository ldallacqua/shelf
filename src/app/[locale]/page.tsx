import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Landing } from '@/features/landing/landing'
import { siteUrl } from '@/server/site-url'

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations('Landing')
  const meta = await getTranslations('Meta')
  // The page's own first screen, in its language (`pnpm landing:share`).
  const picture = {
    url: `/share/${locale}.jpg`,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: t('shareAlt'),
  }
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    openGraph: {
      type: 'website',
      siteName: meta('siteName'),
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: [picture],
    },
    twitter: { card: 'summary_large_image', images: [picture] },
  }
}

/** The landing page (spec 15), with what it is for search engines: the site itself. */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params
  const t = await getTranslations('Landing')
  const meta = await getTranslations('Meta')
  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: meta('siteName'),
    url: `${siteUrl()}/${locale}`,
    description: t('metaDescription'),
    inLanguage: locale,
  }
  return (
    <>
      <script
        type="application/ld+json"
        // Its own words only; `<` is escaped so no text can close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(site).replace(/</g, '\\u003c') }}
      />
      <Landing />
    </>
  )
}
