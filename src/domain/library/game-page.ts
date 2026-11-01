import type { AchievementProvider } from '@/domain/achievements/achievements'
import type { GameArtwork, GameImage, GameVideo, Length, Release } from '@/domain/igdb/game'
import type {
  Library,
  LibraryGame,
  LibraryNames,
  LibraryTag,
  Named,
} from '@/domain/library/library'
import { storeNames, type StoreLink, type StoreName } from '@/domain/library/stores'
import { filterWord, type ListKey } from '@/domain/query/keys'

/**
 * A game's page (spec 7.1). The library file carries what a shelf, a filter
 * or a sort needs; the page also shows what only it needs (the summary, the
 * screenshots, the key art, a release date per platform), which are its
 * facts. The page built on the server is sent them inside it; the game
 * opened over the shelf fetches them as a small file of their own.
 */

/** Names for the ids a game's lists hold, and for no others. */
export type GameNames = Omit<LibraryNames, 'tag'>

export type GameFacts = {
  slug: string
  /** What IGDB calls this version, such as "Definitive Edition". */
  versionTitle?: string
  summary?: string
  storyline?: string
  /** Behind the cover: key art, or a screenshot when there is none. Without either, the cover's colors. */
  backdrop?: GameImage
  screenshots: GameImage[]
  /** Trailers and gameplay, played from YouTube only when pressed. Absent when IGDB lists none. */
  videos?: GameVideo[]
  /** The first release on each platform, across every version folded into the entry. */
  releases: Release[]
  /** Hours to beat, three ways, in minutes. */
  length?: Length
  igdbUrl?: string
  /** Where it is sold, across every version, one link to a store. Absent when none is known. */
  stores?: StoreLink[]
  /** Mine, when I have made them public for this game. Private notes are never here. */
  notes?: string
  /** The providers with achievements for it, which its page asks for as it opens (issue 72). */
  achievements?: AchievementProvider[]
  names: GameNames
}

/** Everything a game's page shows: the game as the library has it, its tags, and its facts. */
export type GamePage = {
  game: LibraryGame
  /** The game's tags, by name, in the library's order. */
  tags: LibraryTag[]
  facts: GameFacts
}

/** What the database has for a game beyond the library file. */
export type GameExtras = {
  versionTitle?: string
  summary?: string
  storyline?: string
  artworks: GameArtwork[]
  screenshots: GameImage[]
  videos: GameVideo[]
  /** Each version's own releases: the primary's first. */
  releases: Release[][]
  length?: Length
  igdbUrl?: string
  storeLinks?: StoreLink[]
  notes?: string
  notesPublic: boolean
  achievements?: AchievementProvider[]
}

const pick = (names: readonly Named[], ids: Iterable<number>): Named[] => {
  const wanted = new Set(ids)
  return names.filter((named) => wanted.has(named.id))
}

/**
 * The first release on each platform, across versions: a port released on
 * the Switch years later still gives the Switch its own date. A full date
 * beats a year alone; the earlier date wins.
 */
export const firstReleases = (versions: readonly (readonly Release[])[]): Release[] => {
  const byPlatform = new Map<number, Release>()
  for (const release of versions.flat()) {
    const known = byPlatform.get(release.platform)
    const earlier =
      !known ||
      (release.day !== undefined && (known.day === undefined || release.day < known.day)) ||
      (known.day === undefined &&
        release.year !== undefined &&
        (known.year === undefined || release.year < known.year))
    if (earlier) byPlatform.set(release.platform, release)
  }
  // Oldest first; a release with no date at all goes last.
  const when = (release: Release) => release.day ?? `${release.year ?? 9999}-99`
  return [...byPlatform.values()].sort((a, b) =>
    when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : 0,
  )
}

/** Key art, then any other art, then a screenshot for anyone: what stands dimmed behind the cover. */
export const backdropOf = (
  artworks: readonly GameArtwork[],
  screenshots: readonly GameImage[],
): GameImage | undefined => {
  const art = artworks.find((each) => each.type === 'key') ?? artworks[0]
  const image = art ?? screenshots.find((shot) => !shot.mature)
  if (!image) return undefined
  return {
    id: image.id,
    width: image.width,
    height: image.height,
    ...(image.mature ? { mature: image.mature } : {}),
  }
}

/** On the wishlist, or not owned at all: where it is sold is what I came for. */
export const isBuying = (game: Pick<LibraryGame, 'status' | 'copies'>): boolean =>
  game.status === 'wishlist' || game.copies.length === 0

/** One store on a game's page: its link, if it has one, and what it is to me. */
export type StoreRow = { store: StoreName; url?: string; mine?: 'have' | 'want' }

/** How many stores a game I don't have shows before the rest is asked for. */
const STORES_SHOWN = 4

// The store of a console's games, for one I have a copy on or want it on.
const STORE_OF_FAMILY: Partial<Record<string, StoreName>> = {
  playstation: 'playstation',
  xbox: 'microsoft',
  nintendo: 'nintendo',
}

/**
 * A game's stores as its page lists them, and how many stand out of the fold
 * (spec 7.9), as Letterboxd's "Where to watch" has my own services first. Mine
 * come first, and the store of a console I have it on or want it on. Buying it,
 * the first few show, enough to compare. Having it, only what is mine: the rest
 * stays folded so the page is about my copy.
 */
export const storeRows = (
  game: Pick<LibraryGame, 'status' | 'copies' | 'wanted' | 'wantedStores'>,
  links: readonly StoreLink[],
  platforms: ReadonlyMap<number, { family: string }>,
): { rows: StoreRow[]; shown: number } => {
  const have = new Set(game.copies.flatMap((copy) => copy.stores ?? []))
  const want = new Set(game.wantedStores)
  const near = new Set(
    [...game.copies.map((copy) => copy.platform), ...(game.wanted ?? [])].flatMap(
      (id) => STORE_OF_FAMILY[platforms.get(id)?.family ?? ''] ?? [],
    ),
  )
  const urls = new Map(links.map((link) => [link.store, link.url]))
  const listed = storeNames.filter((store) => urls.has(store) || have.has(store) || want.has(store))
  const rank = (store: StoreName) =>
    have.has(store) || want.has(store) ? 0 : near.has(store) ? 1 : 2
  const rows = listed
    .map((store): StoreRow => {
      const url = urls.get(store)
      const mine = have.has(store) ? 'have' : want.has(store) ? 'want' : undefined
      return { store, ...(url ? { url } : {}), ...(mine ? { mine } : {}) }
    })
    .sort((a, b) => rank(a.store) - rank(b.store))
  const close = rows.filter((row) => rank(row.store) < 2).length
  const shown = isBuying(game) ? Math.max(close, STORES_SHOWN) : close
  // Hiding one is no shorter than showing it.
  return { rows, shown: rows.length - shown <= 1 ? rows.length : shown }
}

/** A game's page from the library it stands in and what the database adds. */
export const buildGamePage = (
  library: Library,
  game: LibraryGame,
  extras: GameExtras,
): GamePage => {
  const releases = firstReleases(extras.releases)
  const platformIds = new Set([
    ...game.platforms,
    ...game.copies.map((copy) => copy.platform),
    ...releases.map((release) => release.platform),
  ])
  const names: GameNames = {
    genre: pick(library.names.genre, game.genres),
    theme: pick(library.names.theme, game.themes),
    mode: pick(library.names.mode, game.modes),
    perspective: pick(library.names.perspective, game.perspectives),
    franchise: pick(library.names.franchise, game.franchises),
    series: pick(library.names.series, game.series),
    company: pick(library.names.company, [...game.developers, ...game.publishers]),
    platform: library.names.platform.filter((platform) => platformIds.has(platform.id)),
  }

  const facts: GameFacts = {
    slug: game.slug,
    screenshots: extras.screenshots,
    releases,
    names,
  }
  if (extras.videos.length > 0) facts.videos = extras.videos
  if (extras.versionTitle) facts.versionTitle = extras.versionTitle
  if (extras.summary) facts.summary = extras.summary
  if (extras.storyline) facts.storyline = extras.storyline
  const backdrop = backdropOf(extras.artworks, extras.screenshots)
  if (backdrop) facts.backdrop = backdrop
  if (extras.length) facts.length = extras.length
  if (extras.igdbUrl) facts.igdbUrl = extras.igdbUrl
  if (extras.storeLinks?.length) facts.stores = extras.storeLinks
  // A visitor never sees a private note: it does not leave the server.
  if (extras.notes && extras.notesPublic) facts.notes = extras.notes
  if (extras.achievements) facts.achievements = extras.achievements

  return {
    game,
    tags: game.tags.flatMap((position) => library.names.tag[position] ?? []),
    facts,
  }
}

/**
 * The filter that finds every game sharing a value with this one:
 * `genre:rpg`, `developer:fromsoftware`, `platform:ps5`. What a value on the
 * page links to.
 */
export const filterFor = (key: ListKey, named: Named): string =>
  `${key}:${filterWord(key, named.id, named.slug)}`

/** Names in the order the game lists their ids: IGDB's order, which puts the main one first. */
export const namesOf = (names: readonly Named[], ids: readonly number[]): Named[] => {
  const byId = new Map(names.map((named) => [named.id, named]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

/** IGDB's game modes as schema.org names them: single player, multiplayer, co-operative. */
const PLAY_MODES: Record<number, string> = {
  1: 'https://schema.org/SinglePlayer',
  2: 'https://schema.org/MultiPlayer',
  3: 'https://schema.org/CoOp',
  4: 'https://schema.org/MultiPlayer',
  5: 'https://schema.org/MultiPlayer',
  6: 'https://schema.org/MultiPlayer',
}

/**
 * The game described for search engines and assistants: schema.org's
 * `VideoGame` (architecture, section 16). `address` is the page's own full
 * address; `cover` and `screenshot` turn IGDB's image ids into addresses.
 * My notes and rating stay out: they are about me, not the game.
 */
export const videoGameData = (
  page: GamePage,
  address: string,
  image: { cover: (id: string) => string; screenshot: (id: string) => string },
): Record<string, unknown> => {
  const { game, facts } = page
  const named = (list: readonly Named[], ids: readonly number[]) =>
    namesOf(list, ids).map((each) => each.name)
  const companies = (ids: readonly number[]) =>
    namesOf(facts.names.company, ids).map((each) => ({ '@type': 'Organization', name: each.name }))
  const platforms = new Map(facts.names.platform.map((platform) => [platform.id, platform.name]))

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    url: address,
    gamePlatform: game.platforms.flatMap((id) => platforms.get(id) ?? []),
    genre: named(facts.names.genre, game.genres),
  }
  if (facts.summary) data.description = facts.summary
  if (game.releasedOn) data.datePublished = game.releasedOn
  const images = [
    ...(game.cover ? [image.cover(game.cover)] : []),
    ...facts.screenshots
      .filter((shot) => !shot.mature)
      .slice(0, 3)
      .map((shot) => image.screenshot(shot.id)),
  ]
  if (images.length > 0) data.image = images
  if (game.developers.length > 0) data.author = companies(game.developers)
  if (game.publishers.length > 0) data.publisher = companies(game.publishers)
  const series =
    named(facts.names.series, game.series)[0] ?? named(facts.names.franchise, game.franchises)[0]
  if (series) data.isPartOf = { '@type': 'CreativeWorkSeries', name: series }
  const modes = [...new Set(game.modes.flatMap((id) => PLAY_MODES[id] ?? []))]
  if (modes.length > 0) data.playMode = modes
  if (facts.igdbUrl) data.sameAs = facts.igdbUrl
  return data
}
