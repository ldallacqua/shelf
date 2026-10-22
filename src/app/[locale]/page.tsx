import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Landing } from '@/features/landing/landing'
import { siteUrl } from '@/server/site-url'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Landing')
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    // The picture is opengraph-image.png, beside this page.
    openGraph: { type: 'website', title: t('metaTitle'), description: t('metaDescription') },
    twitter: { card: 'summary_large_image' },
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
