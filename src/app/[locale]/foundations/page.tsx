import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Foundations } from '@/features/foundations/foundations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Foundations')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/** The design foundations in place, kept for reference now the landing page has the address it had. */
export default function FoundationsPage() {
  return <Foundations />
}
