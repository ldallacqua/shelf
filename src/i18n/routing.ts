import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'pt-BR'],
  defaultLocale: 'en',
  // Every address carries its language: /en/… and /pt-BR/…
  localePrefix: 'always',
  /**
   * Every page that exists, by its address after the language.
   * Links are type-checked against this list, and the proxy answers "not
   * found" for anything that is not on it. A test fails if it and src/app disagree.
   */
  pathnames: {
    '/': '/',
    // Each account's shelf, by its handle (ADR 004).
    '/u/[handle]': '/u/[handle]',
    '/u/[handle]/shelves/[slug]': '/u/[handle]/shelves/[slug]',
    '/u/[handle]/game/[slug]': '/u/[handle]/game/[slug]',
    '/u/[handle]/trophies': '/u/[handle]/trophies',
    '/sign-in': '/sign-in',
    '/sign-up': '/sign-up',
    '/account': '/account',
    // Setting a new shelf up, where signing up leads.
    '/account/start': '/account/start',
    // Organizing one's games, a tab each (spec 4.5): placing the games a sync
    // brought in, and the hours of games whose stores count far past IGDB's (4.7).
    '/account/unsorted': '/account/unsorted',
    '/account/hours': '/account/hours',
    '/consent': '/consent',
    // What Shelf keeps, and how to remove it: Steam's terms ask for one (ADR 003).
    '/privacy': '/privacy',
    // The design foundations, for reference: not linked, not indexed.
    '/foundations': '/foundations',
  },
})

export type Locale = (typeof routing.locales)[number]
export type Pathname = keyof typeof routing.pathnames

/**
 * Language names in their own language, and the switch's tip that leads to
 * each. They read the same on every page, so they are not in the translation
 * files.
 */
export const localeLabels: Record<Locale, { short: string; name: string; switchTo: string }> = {
  en: { short: 'EN', name: 'English', switchTo: 'Read Shelf in English' },
  'pt-BR': { short: 'PT', name: 'Português (Brasil)', switchTo: 'Ler o Shelf em português' },
}
