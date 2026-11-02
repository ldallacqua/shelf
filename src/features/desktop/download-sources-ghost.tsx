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
 * The section before its code is here. Its own words come with that code, so that no page's HTML
 * carries them (`messages/app`): even its title is a ghost, and the label is Platforms' plain one.
 * Apart from the section, so the account page can draw this without fetching any of it.
 */
export function DownloadSourcesGhost() {
  const t = useTranslations('Sync')
  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <Loading label={t('loading')} className="contents">
        <GhostText order={0} className="w-56 text-xl sm:text-2xl" />
        <SourceCardGhost />
      </Loading>
    </section>
  )
}
