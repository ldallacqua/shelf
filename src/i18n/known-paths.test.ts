import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isKnownPath, splitLocale } from './known-paths'
import { routing } from './routing'

describe('splitLocale', () => {
  it('separates the language from the rest of the address', () => {
    expect(splitLocale('/en')).toEqual({ locale: 'en', rest: '/' })
    expect(splitLocale('/pt-BR/library')).toEqual({ locale: 'pt-BR', rest: '/library' })
    expect(splitLocale('/en/game/hollow-knight')).toEqual({
      locale: 'en',
      rest: '/game/hollow-knight',
    })
  })

  it('ignores a trailing slash', () => {
    expect(splitLocale('/en/')).toEqual({ locale: 'en', rest: '/' })
    expect(splitLocale('/en/library/')).toEqual({ locale: 'en', rest: '/library' })
  })

  it('returns nothing for an address without a language', () => {
    expect(splitLocale('/')).toBeUndefined()
    expect(splitLocale('/library')).toBeUndefined()
    expect(splitLocale('/xx/library')).toBeUndefined()
    // "/english" starts with "en" but is not the language "en".
    expect(splitLocale('/english')).toBeUndefined()
  })
})

describe('isKnownPath', () => {
  it.each(Object.keys(routing.pathnames))('knows %s', (path) => {
    expect(isKnownPath(path)).toBe(true)
  })

  it.each(['/nope', '/library/extra', '/trophies2', '/Library', ''])('does not know %j', (path) => {
    expect(isKnownPath(path)).toBe(false)
  })
})

/**
 * The list in routing.ts is what links are checked against and what the proxy
 * answers 404 from, so it must name exactly the pages that exist.
 */
describe('the list of pages', () => {
  const appDirectory = join(import.meta.dirname, '..', 'app', '[locale]')

  function pagesUnder(directory: string, route = ''): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) {
        // "missing" draws the "not found" page. The proxy fetches it; nothing links to it.
        if (entry.name === 'missing') return []
        // Route groups add nothing to the address.
        const isGroup = entry.name.startsWith('(')
        return pagesUnder(join(directory, entry.name), isGroup ? route : `${route}/${entry.name}`)
      }
      return entry.name === 'page.tsx' ? [route === '' ? '/' : route] : []
    })
  }

  it('matches the pages in src/app', () => {
    expect(Object.keys(routing.pathnames).sort()).toEqual(pagesUnder(appDirectory).sort())
  })
})
