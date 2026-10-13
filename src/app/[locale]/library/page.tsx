import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmptyLibrary } from '@/features/library/empty-library'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Library')
  return { title: t('metaTitle') }
}

export default function LibraryPage() {
  return <EmptyLibrary />
}
