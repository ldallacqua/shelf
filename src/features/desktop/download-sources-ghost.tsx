'use client'

import { useTranslations } from 'next-intl'

import { Ghost, GhostText, Loading } from '@/ui/ghost'

/** A source's card on its way, in the card's shape. */
export function SourceCardGhost() {
  return (
    <div className="grid gap-4 rounded-panel border border-line bg-surface p-5 md:max-w-[calc(50%-0.5rem)]">
      <div className="grid gap-1">
        <GhostText order={0} className="w-40 text-lg" />
        <GhostText order={1} className="w-64 text-sm" />
      </div>
      <GhostText order={2} className="w-48 text-sm" />
      <Ghost order={3} className="h-8 w-28 rounded-control" />
    </div>
  )
}

/**
 * The section on its way, in its shape: its own words come with its code (`messages/app`), so the
 * label is Platforms' plain one, as the sources' ghost has it.
 */
export function ThisComputerGhost() {
  const t = useTranslations('Sync')
  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <Loading label={t('loading')} className="contents">
        <GhostText order={0} className="w-44 text-xl sm:text-2xl" />
        <GhostText order={1} className="w-full max-w-xl" />
        <div className="grid max-w-md gap-1.5">
          <GhostText order={2} className="w-16 text-sm" />
          <Ghost order={3} className="h-10 w-full rounded-control pointer-coarse:h-11" />
          <GhostText order={4} className="w-60 text-xs" />
        </div>
        <Ghost order={5} className="h-10 w-32 rounded-control" />
      </Loading>
    </section>
  )
}
