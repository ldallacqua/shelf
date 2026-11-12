import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import {
  addGameAction,
  addSteamGameAction,
  groupingAction,
  searchGamesAction,
  steamLinkAction,
  undoAddAction,
} from '@/app/actions/games'
import { Page } from '@/features/shell/page'
import { SetUpShelf } from '@/features/start/set-up-shelf'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Start')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/**
 * Setting a shelf up (spec 4.6): built ahead as an empty frame, filled in the browser for
 * whoever is signed in. The page's name is a small heading over the steps, each of which has a
 * heading of its own. The Add dialog's actions are the header's, checked on the server whoever
 * calls them.
 */
export default async function StartPage() {
  const t = await getTranslations('Start')
  return (
    <Page className="pb-16">
      <h1 className="pt-8 readout text-[0.6875rem] text-accent sm:pt-12">{t('title')}</h1>
      <SetUpShelf
        add={{
          search: searchGamesAction,
          grouping: groupingAction,
          add: addGameAction,
          undo: undoAddAction,
          steamLink: steamLinkAction,
          addSteam: addSteamGameAction,
        }}
      />
    </Page>
  )
}
