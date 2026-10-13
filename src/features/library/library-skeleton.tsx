import { useTranslations } from 'next-intl'

import { Ledge } from '@/ui/ledge'

/**
 * The library before its first boxes arrive: the heading, and lit boards
 * with nothing on them yet. It is part of the page built ahead of time, so it
 * is what a visitor sees first.
 */
export function LibrarySkeleton() {
  const t = useTranslations('Library')

  return (
    <div className="library" aria-busy="true">
      <div className="pt-4 pb-3 sm:pt-10 sm:pb-5">
        <h1 className="title text-2xl sm:text-5xl">{t('title')}</h1>
      </div>
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <div className="shelves pt-16">
        <Ledge itemsClassName="h-40 sm:h-52" />
        <Ledge className="mt-10" itemsClassName="h-40 sm:h-52" />
      </div>
    </div>
  )
}
