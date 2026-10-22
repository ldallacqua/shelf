import { useTranslations } from 'next-intl'

import { AddDemo } from './add-demo'
import { AskDemo } from './ask-demo'
import { Assistant } from './assistant'
import { Closing } from './closing'
import { askGames, askMatches, demoGames, demoTrophies, everyCopy } from './demo'
import type { DemoGame } from './demo-case'
import { EveryCopy } from './every-copy'
import { FinishedWall } from './finished-wall'
import { Hero } from './hero'
import { Privacy } from './privacy'
import { Reveals } from './reveals'
import { Section } from './section'
import { ViewsDemo } from './views-demo'

import './landing.css'

/** The hero's games: every seventeenth of the example shelf, round, so its case shapes mix. */
const HERO_GAMES = 24

/** What is typed in "Add in seconds", and the list pasted there, by title and by slug. */
const TYPED = 'zelda'
const PASTED = [
  ['Hades', 'hades--1'],
  ['Celeste', 'celeste'],
  ['Outer Wilds', 'outer-wilds'],
  ['Disco Elysium', 'disco-elysium'],
  ['Inside', 'inside'],
] as const

const pick = (games: readonly DemoGame[], slugs: readonly string[]): DemoGame[] =>
  slugs.flatMap((slug) => games.find((game) => game.slug === slug) ?? [])

/**
 * The landing page (spec 15): what Shelf is, shown with an example shelf of
 * real games, part by part, each with the call to create one's own. It is
 * built ahead whole, from `demo-library.json`; nothing on it asks the server
 * anything, and no account's games are on it.
 */
export function Landing() {
  const t = useTranslations('Landing')
  const games = demoGames()
  const matches = askMatches()
  const trophies = demoTrophies()

  const hero = Array.from({ length: HERO_GAMES }, (_, index) => games[(index * 17) % games.length])
  const typed = games.filter((game) => game.title.toLowerCase().includes(TYPED)).slice(0, 3)
  const pasted = PASTED.flatMap(([line, slug]) =>
    pick(games, [slug]).map((game) => ({ line, game })),
  )
  const picks = games.filter((game) =>
    Object.values(matches).every((found) => found.includes(game.slug)),
  )
  const rated = games
    .filter((game) => game.rating !== undefined)
    .toSorted((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 12)

  return (
    <div id="landing">
      <Reveals root="landing" />
      <Hero games={hero.filter((game) => game !== undefined)} />
      <Section id="how" eyebrow={t('ask.eyebrow')} title={t('ask.title')} body={t('ask.body')}>
        <AskDemo games={askGames()} matches={matches} />
      </Section>
      <Section
        id="copies"
        flip
        eyebrow={t('copies.eyebrow')}
        title={t('copies.title')}
        body={t('copies.body')}
      >
        <EveryCopy copies={everyCopy()} />
      </Section>
      <Section id="add" eyebrow={t('add.eyebrow')} title={t('add.title')} body={t('add.body')}>
        <AddDemo query={TYPED} found={typed} pasted={pasted} />
      </Section>
      <Section
        id="views"
        flip
        eyebrow={t('views.eyebrow')}
        title={t('views.title')}
        body={t('views.body')}
      >
        <ViewsDemo games={rated} />
      </Section>
      <Section
        id="finished"
        eyebrow={t('finished.eyebrow')}
        title={t('finished.title')}
        body={t('finished.body')}
      >
        <FinishedWall stats={trophies.stats} latest={trophies.latest} />
      </Section>
      <Section
        id="privacy"
        flip
        eyebrow={t('privacy.eyebrow')}
        title={t('privacy.title')}
        body={t('privacy.body')}
      >
        <Privacy />
      </Section>
      <Section
        id="assistant"
        eyebrow={t('assistant.eyebrow')}
        title={t('assistant.title')}
        body={t('assistant.body')}
      >
        <Assistant picks={picks} />
      </Section>
      <Closing />
    </div>
  )
}
