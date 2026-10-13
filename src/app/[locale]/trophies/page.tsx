import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmptyTrophies } from '@/features/trophies/empty-trophies'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trophies')
  return { title: t('metaTitle') }
}

export default function TrophiesPage() {
  return <EmptyTrophies />
}
