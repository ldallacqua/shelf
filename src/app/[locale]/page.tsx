import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Landing } from '@/features/landing/landing'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Landing')
  return { title: { absolute: t('metaTitle') }, description: t('metaDescription') }
}

export default function HomePage() {
  return <Landing />
}
