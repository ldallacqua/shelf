import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmptyTrophies } from '@/features/trophies/empty-trophies'

import { NO_HANDLE } from '../shelf-info'

/** Built on its first visit, as every page of a shelf is (`shelf-info.ts`). */
export function generateStaticParams() {
  return [{ handle: NO_HANDLE }]
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trophies')
  // The same empty wall for every handle until the wall is built: nothing to list.
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/** A shelf's trophy wall (spec 3.9). Built at step 9; until then, the empty wall for every shelf. */
export default function TrophiesPage() {
  return <EmptyTrophies />
}
