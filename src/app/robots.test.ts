import { describe, expect, it } from 'vitest'

import robots from './robots'

/**
 * Whether a crawler may fetch an address under these rules, as RFC 9309 has
 * it: `*` is any run of characters (the rules end in no `$`), and of the
 * rules that match, the longest wins, an allow on a tie.
 */
const mayCrawl = (address: string) => {
  const { rules } = robots()
  const [rule] = [rules].flat()
  if (!rule) throw new Error('robots.txt has no rules')
  const list = (value: string | string[] | undefined) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value]
  const matching = [
    ...list(rule.allow).map((pattern) => ({ pattern, allow: true })),
    ...list(rule.disallow).map((pattern) => ({ pattern, allow: false })),
  ].filter(({ pattern }) => {
    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${source}`).test(address)
  })
  matching.sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow))
  return matching[0]?.allow ?? true
}

describe('robots.txt', () => {
  it('opens the public pages, and a trophy wall’s year', () => {
    for (const address of [
      '/en',
      '/en/u/lucas',
      '/pt-BR/u/lucas/trophies',
      '/en/u/lucas/trophies?year=2025',
      '/en/u/lucas/shelves/backlog',
      '/en/u/lucas/game/hades',
      '/_next/static/chunks/main.js?dpl=dpl_123',
    ]) {
      expect(mayCrawl(address), address).toBe(true)
    }
  })

  it('keeps crawlers off a page seen another way, wherever the parameter stands', () => {
    for (const address of [
      '/en/u/lucas/trophies?q=genre%3Arpg',
      '/en/u/lucas/trophies?year=2025&q=genre%3Arpg+%28genre%3Aaction%29',
      '/pt-BR/u/lucas/trophies?by=hours',
      '/en/u/lucas/trophies?year=2024&rarity=rare',
      '/en/u/lucas?q=status%3Abacklog&sort=-rating',
      '/en/u/lucas?view=list&group=platform',
      '/en/u/lucas?seed=42',
      '/en/u/lucas/shelves/backlog?sort=-added',
    ]) {
      expect(mayCrawl(address), address).toBe(false)
    }
  })

  it('keeps the API, the account and the consent page private', () => {
    for (const address of ['/api/v1/u/lucas/library', '/en/account', '/pt-BR/consent']) {
      expect(mayCrawl(address), address).toBe(false)
    }
  })
})
