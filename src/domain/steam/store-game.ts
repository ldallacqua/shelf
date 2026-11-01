import { z } from 'zod'

import { dayFromSeconds, EROTIC, type GameData, type GameImage } from '@/domain/igdb/game'
import type { IgdbNamed, VocabKind } from '@/domain/igdb/schema'
import type { Day } from '@/domain/library/values'
import { isSteamImage } from '@/domain/igdb/images'

/**
 * A game IGDB does not have, read from Steam's store (ADR 006): the only
 * place that knows the store's fields for a game's page. `IStoreBrowseService/GetItems`
 * answers everything in one request, and tells screenshots for anyone from
 * those it keeps for adults.
 */

/** What a moderator pastes: a store page, its community hub, or Steam's short address. */
const LINKS = [
  /^(?:https?:\/\/)?(?:www\.)?store\.steampowered\.com\/(?:[a-z]+\/)?app\/(\d{1,10})(?:[/?#]|$)/i,
  /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/app\/(\d{1,10})(?:[/?#]|$)/i,
  /^(?:https?:\/\/)?s\.team\/a\/(\d{1,10})(?:[/?#]|$)/i,
]

/**
 * The app a pasted link is for, or nothing. Only this number goes on from
 * here: the address itself is never fetched, so a link can't send the server anywhere.
 */
export const steamAppIdIn = (text: string): string | undefined => {
  const trimmed = text.trim()
  for (const link of LINKS) {
    const id = link.exec(trimmed)?.[1]
    if (id && Number(id) > 0) return String(Number(id))
  }
  return undefined
}

export const steamAppId = z.string().regex(/^[1-9]\d{0,9}$/)

/** Everything a game's page takes, asked of the store in the language and country given. */
export const storeGameQuestion = (appId: string, country: string): string =>
  JSON.stringify({
    ids: [{ appid: Number(appId) }],
    context: { language: 'english', country_code: country },
    data_request: {
      include_assets: true,
      include_basic_info: true,
      include_platforms: true,
      include_release: true,
      include_screenshots: true,
      include_tag_count: 20,
    },
  })

const named = z.array(z.object({ name: z.string().trim().min(1) })).default([])

export const storeGameSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          id: z.number().int().nonnegative(),
          success: z.number().int(),
          name: z.string().optional(),
          type: z.number().int().nonnegative().optional(),
          content_descriptorids: z.array(z.number().int()).default([]),
          tagids: z.array(z.number().int()).default([]),
          categories: z
            .object({ supported_player_categoryids: z.array(z.number().int()).default([]) })
            .optional(),
          basic_info: z
            .object({
              short_description: z.string().optional(),
              developers: named,
              publishers: named,
            })
            .optional(),
          assets: z
            .object({
              asset_url_format: z.string(),
              library_capsule: z.string().optional(),
              library_capsule_2x: z.string().optional(),
              library_hero: z.string().optional(),
            })
            .optional(),
          release: z.object({ steam_release_date: z.number().int().optional() }).optional(),
          platforms: z
            .object({
              windows: z.boolean().optional(),
              mac: z.boolean().optional(),
              steamos_linux: z.boolean().optional(),
            })
            .optional(),
          screenshots: z
            .object({
              all_ages_screenshots: z.array(z.object({ filename: z.string() })).default([]),
              mature_content_screenshots: z.array(z.object({ filename: z.string() })).default([]),
            })
            .optional(),
        }),
      )
      .default([]),
  }),
})

export type StoreGame = z.infer<typeof storeGameSchema>['response']['store_items'][number]

/** Whether the store has a page for it in the country asked. */
export const onTheStore = (item: StoreGame | undefined): item is StoreGame => item?.success === 1

/** Steam's own word that it is a game: not a soundtrack, a DLC, a demo or software. */
export const isStoreGame = (item: StoreGame): boolean => (item.type ?? 0) === 0

/** IGDB's names for its ids, as `vocab` keeps them, for the words Steam's tags are turned into. */
const WORDS = {
  genre: {
    2: ['Point-and-click', 'point-and-click'],
    4: ['Fighting', 'fighting'],
    5: ['Shooter', 'shooter'],
    7: ['Music', 'music'],
    8: ['Platform', 'platform'],
    9: ['Puzzle', 'puzzle'],
    10: ['Racing', 'racing'],
    11: ['Real Time Strategy (RTS)', 'real-time-strategy-rts'],
    12: ['Role-playing (RPG)', 'role-playing-rpg'],
    13: ['Simulator', 'simulator'],
    14: ['Sport', 'sport'],
    15: ['Strategy', 'strategy'],
    16: ['Turn-based strategy (TBS)', 'turn-based-strategy-tbs'],
    24: ['Tactical', 'tactical'],
    25: ["Hack and slash/Beat 'em up", 'hack-and-slash-beat-em-up'],
    26: ['Quiz/Trivia', 'quiz-trivia'],
    31: ['Adventure', 'adventure'],
    32: ['Indie', 'indie'],
    33: ['Arcade', 'arcade'],
    34: ['Visual Novel', 'visual-novel'],
    35: ['Card & Board Game', 'card-and-board-game'],
  },
  theme: {
    1: ['Action', 'action'],
    17: ['Fantasy', 'fantasy'],
    18: ['Science fiction', 'science-fiction'],
    19: ['Horror', 'horror'],
    20: ['Thriller', 'thriller'],
    21: ['Survival', 'survival'],
    22: ['Historical', 'historical'],
    23: ['Stealth', 'stealth'],
    27: ['Comedy', 'comedy'],
    33: ['Sandbox', 'sandbox'],
    35: ['Kids', 'kids'],
    38: ['Open world', 'open-world'],
    39: ['Warfare', 'warfare'],
    40: ['Party', 'party'],
    41: [
      '4X (explore, expand, exploit, and exterminate)',
      '4x-explore-expand-exploit-and-exterminate',
    ],
    42: ['Erotic', 'erotic'],
    43: ['Mystery', 'mystery'],
    44: ['Romance', 'romance'],
  },
  mode: {
    1: ['Single player', 'single-player'],
    2: ['Multiplayer', 'multiplayer'],
    3: ['Co-operative', 'co-operative'],
    4: ['Split screen', 'split-screen'],
  },
  perspective: {
    1: ['First person', 'first-person'],
    2: ['Third person', 'third-person'],
    3: ['Bird view / Isometric', 'bird-view-slash-isometric'],
    4: ['Side view', 'side-view'],
    7: ['Virtual Reality', 'virtual-reality'],
  },
} as const satisfies Record<string, Record<number, readonly [string, string]>>

type WordKind = keyof typeof WORDS

// Steam's tag ids, from `IStoreService/GetTagList`, read on 1 Nov 2026.
const GENRE_OF_TAG: Record<number, number> = {
  21: 31, // Adventure
  122: 12, // RPG
  4434: 12, // JRPG
  9: 15, // Strategy
  599: 13, // Simulation
  699: 10, // Racing
  701: 14, // Sports
  1664: 9, // Puzzle
  1625: 8, // Platformer
  1774: 5, // Shooter
  1663: 5, // FPS
  3814: 5, // Third-Person Shooter
  1743: 4, // Fighting
  3799: 34, // Visual Novel
  1698: 2, // Point & Click
  1666: 35, // Card Game
  1741: 16, // Turn-Based Strategy
  1676: 11, // RTS
  1708: 24, // Tactical
  1773: 33, // Arcade
  1646: 25, // Hack and Slash
  1621: 7, // Music
  1752: 7, // Rhythm
  492: 32, // Indie
  10437: 26, // Trivia
}

const THEME_OF_TAG: Record<number, number> = {
  19: 1, // Action
  1667: 19, // Horror
  3978: 19, // Survival Horror
  1721: 19, // Psychological Horror
  3942: 18, // Sci-fi
  1684: 17, // Fantasy
  1719: 27, // Comedy
  1662: 21, // Survival
  5716: 43, // Mystery
  1687: 23, // Stealth
  3810: 33, // Sandbox
  1695: 38, // Open World
  3987: 22, // Historical
  4168: 39, // Military
  4064: 20, // Thriller
  4947: 44, // Romance
  4162: 35, // Kids
  1670: 41, // 4X
  7108: 40, // Party
}

const PERSPECTIVE_OF_TAG: Record<number, number> = {
  3839: 1, // First-Person
  1697: 2, // Third Person
  5851: 3, // Isometric
  3798: 4, // Side Scroller
  21978: 7, // VR
}

// Steam's categories for who plays.
const MODE_OF_CATEGORY: Record<number, number> = {
  2: 1, // Single-player
  1: 2, // Multi-player
  9: 3, // Co-op
  38: 3, // Online Co-op
  24: 4, // Shared/Split Screen
  39: 4, // Shared/Split Screen Co-op
}

/**
 * Steam's Mature Content descriptors. 3 is Adult Only Sexual Content and 4
 * Frequent Nudity or Sexual Content; 1 (some nudity), 2 (violence) and 5
 * (general) are on many a game no one would call adult. Valve documents none
 * of them: read from what the store answers for games whose content is known.
 */
const ADULT_ONLY = 3
const FREQUENT_SEXUAL_CONTENT = 4

// IGDB's platform ids.
const PC = 6
const MAC = 14
const LINUX = 3

/**
 * The store shows a release's day as it was in Seattle: at 2 in the morning in
 * London it is still yesterday's. Matches what its pages say, on ten games checked.
 */
const STORE_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const storeDay = (seconds: number | undefined): Day | undefined =>
  dayFromSeconds(seconds) && seconds !== undefined
    ? (STORE_DAY.format(seconds * 1000) as Day)
    : undefined

const unique = (values: readonly number[]): number[] => [...new Set(values)]

const mapped = (ids: readonly number[], table: Record<number, number>): number[] =>
  unique(ids.flatMap((id) => table[id] ?? []))

/** A file's address on the store's image servers, in the id `images.ts` reads. */
const assetPath = (format: string, file: string): string =>
  format.split('?')[0]!.replace('${FILENAME}', file)

/** `@2x` on the id says the file at twice the size is beside it, where it is named as expected. */
const coverOf = (assets: StoreGame['assets']): GameImage | undefined => {
  if (!assets?.library_capsule) return undefined
  const path = assetPath(assets.asset_url_format, assets.library_capsule)
  if (!isSteamImage(path)) return undefined
  const double =
    assets.library_capsule_2x && assetPath(assets.asset_url_format, assets.library_capsule_2x)
  const id = double === path.replace(/(\.\w+)$/, '_2x$1') ? `${path}@2x` : path
  return { id, width: 300, height: 450 }
}

/** What Shelf stores of a game from Steam: as of IGDB's, its companies still only names. */
export type SteamGameData = Omit<
  GameData,
  'igdbId' | 'slug' | 'parent' | 'igdbUrl' | 'igdbUpdatedAt' | 'developers' | 'publishers'
> & {
  steamAppId: string
  developerNames: string[]
  publisherNames: string[]
}

const MAX_SCREENSHOTS = 24

const shotsOf = (shots: readonly { filename: string }[] = [], mature?: true): GameImage[] =>
  shots
    .map((shot) => shot.filename.split('?')[0]!)
    .filter(isSteamImage)
    .map((id) => ({ id, width: 1920, height: 1080, ...(mature ? { mature } : {}) }))

/** Turns a store page into Shelf's own shape. `title` is the moderator's, over Steam's. */
export const toSteamGame = (item: StoreGame, title?: string): SteamGameData => {
  const appId = String(item.id)
  const descriptors = new Set(item.content_descriptorids)
  const adultsOnly = descriptors.has(ADULT_ONLY)
  // What makes a game adult on a shelf (spec 3.13), so "Hide adult games" takes it too.
  const adult = adultsOnly || descriptors.has(FREQUENT_SEXUAL_CONTENT)
  const platforms = [
    ...(item.platforms?.windows ? [PC] : []),
    ...(item.platforms?.mac ? [MAC] : []),
    ...(item.platforms?.steamos_linux ? [LINUX] : []),
  ]
  const on = platforms.length > 0 ? platforms : [PC]
  const releasedOn = storeDay(item.release?.steam_release_date)
  const year = releasedOn ? Number(releasedOn.slice(0, 4)) : undefined
  const developerNames = (item.basic_info?.developers ?? []).map((company) => company.name)
  const publisherNames = (item.basic_info?.publishers ?? []).map((company) => company.name)
  const hero = item.assets?.library_hero
    ? assetPath(item.assets.asset_url_format, item.assets.library_hero)
    : undefined
  const cover = coverOf(item.assets)
  const summary = item.basic_info?.short_description?.trim()

  return {
    steamAppId: appId,
    title: (title ?? item.name ?? '').trim(),
    kind: 'main',
    igdbRatingCount: 0,
    genres: mapped(item.tagids, GENRE_OF_TAG),
    themes: unique([...mapped(item.tagids, THEME_OF_TAG), ...(adult ? [EROTIC] : [])]),
    modes: mapped(item.categories?.supported_player_categoryids ?? [], MODE_OF_CATEGORY),
    perspectives: mapped(item.tagids, PERSPECTIVE_OF_TAG),
    platforms: on,
    franchises: [],
    series: [],
    keywords: [],
    developerNames: [...new Set(developerNames)],
    publisherNames: [...new Set(publisherNames)],
    companies: [],
    // What Steam shows to anyone first; then what it keeps for adults, marked, to be drawn blurred.
    screenshots: [
      ...shotsOf(item.screenshots?.all_ages_screenshots),
      ...shotsOf(item.screenshots?.mature_content_screenshots, true),
    ].slice(0, MAX_SCREENSHOTS),
    // Valve's rules hold only a cover to PG-13, so a game for adults has this marked: on its page
    // and nowhere a page's rules don't reach.
    artworks:
      hero && isSteamImage(hero)
        ? [{ id: hero, width: 1920, height: 620, type: 'key', ...(adult ? { mature: true } : {}) }]
        : [],
    videos: [],
    releases: on.map((platform) => ({
      platform,
      ...(releasedOn ? { day: releasedOn } : {}),
      ...(year ? { year } : {}),
    })),
    storeIds: [{ source: 'steam', uid: appId }],
    ages: [],
    adultsOnly,
    ...(releasedOn ? { releasedOn } : {}),
    ...(year ? { year } : {}),
    ...(cover ? { cover } : {}),
    ...(summary ? { summary } : {}),
  }
}

/** Whether Shelf will treat a game read from Steam as adult. */
export const isAdultOnSteam = (data: SteamGameData): boolean => data.themes.includes(EROTIC)

/** The names of the words a game from Steam uses, for `vocab`. */
export const wordsOf = (
  data: SteamGameData,
): { kind: Exclude<VocabKind, 'company'>; items: IgdbNamed[] }[] => {
  const of = (kind: WordKind, ids: readonly number[]) => ({
    kind,
    items: ids.flatMap((id): IgdbNamed[] => {
      const word = (WORDS[kind] as Record<number, readonly [string, string]>)[id]
      return word ? [{ id, name: word[0], slug: word[1] }] : []
    }),
  })
  return [
    of('genre', data.genres),
    of('theme', data.themes),
    of('mode', data.modes),
    of('perspective', data.perspectives),
  ]
}
