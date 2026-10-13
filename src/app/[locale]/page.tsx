import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Foundations } from '@/features/foundations/foundations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Foundations')
  return { title: t('metaTitle') }
}

export default function HomePage() {
  return <Foundations />
}
