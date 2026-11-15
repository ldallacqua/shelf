import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { preconnect } from 'react-dom'

import { IMAGE_HOSTS } from '@/domain/igdb/images'
import { DuelPage } from '@/features/duel/duel-page'
import { DuelWords } from '@/features/duel/duel-words'
import { Page } from '@/features/shell/page'
import en from '@messages/duel/en.json'
import ptBR from '@messages/duel/pt-BR.json'

export async function generateMetadata(): Promise<Metadata> {
  const words = (await getLocale()) === 'pt-BR' ? ptBR : en
  return { title: words.Duel.metaTitle, robots: { index: false, follow: false } }
}

/**
 * The duel (spec 3.14): built ahead as an empty frame, the same for everyone, and filled in the
 * browser for whoever is signed in. Its words come with it, not with every page.
 */
export default function DuelRoute() {
  // Covers come from Steam's and IGDB's image servers: open the connections while the page arrives.
  for (const host of IMAGE_HOSTS) preconnect(host)

  return (
    <Page className="pb-16">
      <DuelWords>
        <DuelPage />
      </DuelWords>
    </Page>
  )
}
