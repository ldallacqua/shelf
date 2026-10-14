import { useTranslations } from 'next-intl'

import { Ledge } from '@/ui/ledge'

/**
 * The library before its first boxes arrive: the heading, the controls'
 * places, and lit boards with nothing on them yet. It is part of the page
 * built ahead of time, so it is what a visitor sees first; it keeps the
 * controls' room, so nothing moves when they arrive.
 */
export function LibrarySkeleton({ title }: { title?: string }) {
  const t = useTranslations('Library')

  return (
    <div className="library" aria-busy="true">
      <div className="pt-4 pb-3 sm:pt-10 sm:pb-5">
        <h1 className="title text-2xl sm:text-5xl">{title ?? t('title')}</h1>
      </div>
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="grid flex-none gap-3">
        <div className="h-10 rounded-control border border-line-strong bg-surface sm:max-w-xl pointer-coarse:h-11" />
        <div className="h-9 pointer-coarse:h-10" />
      </div>
      {/* The toolbar's place: under the search on a wide screen, two rows at the bottom on a phone. */}
      <div aria-hidden="true" className="library-controls grid gap-2 sm:mt-3">
        <div className="h-10 pointer-coarse:h-11" />
        <div className="h-10 sm:hidden pointer-coarse:h-11" />
      </div>
      <div className="shelves pt-6">
        <Ledge itemsClassName="h-40 sm:h-52" />
        <Ledge className="mt-10" itemsClassName="h-40 sm:h-52" />
      </div>
    </div>
  )
}
