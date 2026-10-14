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
    '/library': '/library',
    '/shelves/[slug]': '/shelves/[slug]',
    '/trophies': '/trophies',
  },
})

export type Locale = (typeof routing.locales)[number]
export type Pathname = keyof typeof routing.pathnames

/**
 * Language names in their own language. They read the same on every page, so
 * they are not in the translation files.
 */
export const localeLabels: Record<Locale, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  'pt-BR': { short: 'PT', name: 'Português (Brasil)' },
}
