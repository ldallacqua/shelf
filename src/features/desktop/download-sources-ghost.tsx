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
 * The section before its code is here: its title for real, and a ghost for what is unknown. Apart
 * from the section, so the account page can draw this without fetching Zod and the commands.
 */
export function DownloadSourcesGhost() {
  const t = useTranslations('DownloadSources')
  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <h2 className="title text-xl sm:text-2xl">{t('title')}</h2>
      <Loading label={t('loading')} className="contents">
        <SourceCardGhost />
      </Loading>
    </section>
  )
}
