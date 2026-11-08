import { createTranslator, type Locale } from 'next-intl'

import en from '@messages/app/en.json'
import ptBR from '@messages/app/pt-BR.json'

import type { Checked } from './bridge'

/** What Play has to say about a game's saves: a look that found trouble, or saves being worked on. */
export type BeforePlaySaid = Checked | 'busy'

/**
 * What Play's page says after the look at a game's saves (ADR 008, section 7), in the app's own words
 * (`messages/app/`), which no page's HTML carries: Play imports this only when there is something to
 * say. `open` names the way to the game's Saves, for the notice's action.
 */
export function beforePlayNotice(locale: Locale, title: string, said: BeforePlaySaid) {
  const t = createTranslator({
    locale,
    messages: locale === 'pt-BR' ? ptBR : en,
    namespace: 'Saves',
  })
  const key =
    said === 'busy'
      ? 'busy'
      : said.did === 'unreachable'
        ? said.why === 'signed-out'
          ? 'signedOut'
          : said.why === 'full'
            ? 'full'
            : 'unreachable'
        : said.why === 'damaged' || said.why === 'large'
          ? said.why
          : 'failed'
  return { message: t(`beforePlay.${key}`, { title }), open: t('open') }
}
