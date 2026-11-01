import { describe, expect, it } from 'vitest'

import { chooseStoreLinks, linksOfRecord, mergeStoreLinks } from './store-links'
import { cleanStores, storeChoices } from './store-choices'
import { takesStore } from './stores'

describe('chooseStoreLinks', () => {
  it('keeps one link to each store, in our order, the best address first', () => {
    expect(
      chooseStoreLinks([
        { store: 'epic', url: 'https://www.epicgames.com/store/p/control' },
        { store: 'gog', url: 'https://www.gog.com/game/control' },
        { store: 'gog', url: 'https://www.gog.com/game/control_ultimate' },
        { store: 'epic', url: 'https://store.epicgames.com/p/control' },
        { store: 'steam', url: 'https://store.steampowered.com/app/870780' },
      ]),
    ).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/870780' },
      { store: 'gog', url: 'https://www.gog.com/game/control' },
      { store: 'epic', url: 'https://store.epicgames.com/p/control' },
    ])
  })

  it('never links anywhere but the store it names', () => {
    expect(
      chooseStoreLinks([
        { store: 'steam', url: 'https://store.steampowered.com.evil.example/app/1' },
        { store: 'steam', url: 'https://evil.example/store.steampowered.com/app/1' },
        { store: 'gog', url: 'javascript:alert(1)' },
        { store: 'epic', url: 'not an address' },
        { store: 'itch', url: 'https://itch.io.evil.example/game' },
      ]),
    ).toEqual([])
  })

  it('leaves out the old Xbox marketplace, which is gone', () => {
    expect(
      chooseStoreLinks([
        { store: 'microsoft', url: 'http://marketplace.xbox.com/en-US/Product/Portal-2/66acd000' },
      ]),
    ).toEqual([])
  })

  it('takes the language out, so each store answers in the visitor’s own, and asks securely', () => {
    const links = chooseStoreLinks([
      { store: 'microsoft', url: 'https://www.xbox.com/en-us/games/store/control/BZ6W9LRPC26W' },
      { store: 'playstation', url: 'https://store.playstation.com/en-us/concept/232654' },
      { store: 'gog', url: 'https://www.gog.com/en/game/hollow_knight' },
      { store: 'epic', url: 'http://store.epicgames.com/en-US/p/hades' },
    ])
    expect(links.map((link) => link.url)).toEqual([
      'https://www.gog.com/game/hollow_knight',
      'https://store.epicgames.com/p/hades',
      'https://www.xbox.com/games/store/control/BZ6W9LRPC26W',
      'https://store.playstation.com/concept/232654',
    ])
  })

  it('takes it out of Epic’s old addresses too', () => {
    expect(
      chooseStoreLinks([
        { store: 'epic', url: 'https://www.epicgames.com/store/en-US/product/control/home' },
      ]),
    ).toEqual([{ store: 'epic', url: 'https://www.epicgames.com/store/product/control/home' }])
  })

  it('prefers Amazon’s main shop to any country’s', () => {
    expect(
      chooseStoreLinks([
        { store: 'amazon', url: 'https://amazon.jp/dp/B09BNLT4BT' },
        { store: 'amazon', url: 'https://amazon.com/dp/B096C4TK3J' },
      ]),
    ).toEqual([{ store: 'amazon', url: 'https://amazon.com/dp/B096C4TK3J' }])
  })
})

describe('mergeStoreLinks', () => {
  it('lets the first version with a store give its link, and the others fill in', () => {
    expect(
      mergeStoreLinks([
        [{ store: 'gog', url: 'https://www.gog.com/game/main' }],
        [
          { store: 'steam', url: 'https://store.steampowered.com/app/2' },
          { store: 'gog', url: 'https://www.gog.com/game/edition' },
        ],
      ]),
    ).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/2' },
      { store: 'gog', url: 'https://www.gog.com/game/main' },
    ])
  })
})

describe('linksOfRecord', () => {
  it('reads a record’s links', () => {
    const storeLinks = [{ store: 'gog' as const, url: 'https://www.gog.com/game/a' }]
    expect(linksOfRecord({ storeLinks, storeIds: [{ source: 'steam', uid: '1' }] })).toBe(
      storeLinks,
    )
  })

  it('gives one stored before links were asked for its Steam app until the refresh', () => {
    expect(
      linksOfRecord({ storeLinks: null, storeIds: [{ source: 'steam', uid: '620' }] }),
    ).toEqual([{ store: 'steam', url: 'https://store.steampowered.com/app/620' }])
    expect(linksOfRecord({ storeLinks: null, storeIds: [{ source: 'gog', uid: '9' }] })).toEqual([])
  })
})

describe('takesStore', () => {
  it('is a download on a PC and nothing else, for now', () => {
    expect(takesStore(6, 'digital')).toBe(true)
    expect(takesStore(14, 'digital')).toBe(true)
    expect(takesStore(6, 'physical')).toBe(false)
    expect(takesStore(167, 'digital')).toBe(false)
  })
})

describe('storeChoices', () => {
  it('offers what it is sold on and what I said, and keeps the rest to ask for', () => {
    const { offered, rest } = storeChoices(['steam', 'epic', 'playstation'], ['battlenet'])
    expect(offered).toEqual(['steam', 'epic', 'battlenet'])
    expect(rest).toEqual(['gog', 'microsoft', 'itch', 'ea', 'ubisoft'])
  })

  it('offers what nearly every PC game is on when it knows nothing', () => {
    expect(storeChoices([], []).offered).toEqual(['steam', 'gog', 'epic'])
  })
})

describe('cleanStores', () => {
  it('keeps each PC store once, in our order, and nothing a PC game cannot be from', () => {
    expect(cleanStores(['epic', 'steam', 'epic', 'playstation'])).toEqual(['steam', 'epic'])
    expect(cleanStores(null)).toEqual([])
  })
})
