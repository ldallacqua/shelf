import type { IgdbPlatform } from '@/domain/igdb/schema'

/**
 * What Shelf knows about a platform beyond what IGDB says: which family it
 * belongs to, what its game cases look like, and the short key filters use
 * (`owned:ps5`). IGDB supplies the id and the full name.
 */

export const families = ['playstation', 'xbox', 'nintendo', 'pc', 'sega', 'other'] as const
export type Family = (typeof families)[number]

/**
 * The physical case a platform's games come in. Sizes live with the drawing
 * code in `ui`; a test keeps the two lists the same.
 */
export const caseShapes = [
  'bluRay', // 135 × 171 mm
  'keepCase', // 135 × 190 mm, the DVD-size case
  'switch', // 105 × 170 mm
  'jewel', // 142 × 125 mm, a CD case
  'ds', // 122 × 135 mm
  'vita', // 105 × 135 mm
  'psp', // 99 × 168 mm
  'boxTall', // a cardboard box or clamshell, portrait
  'boxWide', // a cardboard box, landscape
  'boxSmall', // a handheld's small square box
] as const
export type CaseShape = (typeof caseShapes)[number]

/** The color of the case's plastic or card. The interface maps each to a paint. */
export const plastics = ['blue', 'red', 'green', 'white', 'black', 'clear'] as const
export type Plastic = (typeof plastics)[number]

export type Platform = {
  igdbId: number
  /** Lower-case, hyphenated, stable: what `owned:` and `platform:` filters take. */
  key: string
  name: string
  /** A label short enough for a tab or a case's band. */
  short: string
  family: Family
  /** Console generation, when there is one. Orders shelves within a family. */
  generation?: number
  shape: CaseShape
  plastic: Plastic
}

type Curated = Omit<Platform, 'igdbId'>

const p = (
  key: string,
  name: string,
  short: string,
  family: Family,
  generation: number | undefined,
  shape: CaseShape,
  plastic: Plastic,
): Curated => {
  const platform: Curated = { key, name, short, family, shape, plastic }
  if (generation !== undefined) platform.generation = generation
  return platform
}

/**
 * Keyed by IGDB platform id (checked against IGDB's list on 13 Oct 2026; a
 * test compares the names). Case shapes and colors are from the keep-case
 * research (docs/research.md, section 4). Cardboard-box sizes are estimates.
 */
const CURATED_IN_ORDER: readonly (readonly [number, Curated])[] = [
  // PlayStation
  [167, p('ps5', 'PlayStation 5', 'PS5', 'playstation', 9, 'bluRay', 'blue')],
  [390, p('psvr2', 'PlayStation VR2', 'PS VR2', 'playstation', 9, 'bluRay', 'white')],
  [48, p('ps4', 'PlayStation 4', 'PS4', 'playstation', 8, 'bluRay', 'blue')],
  [165, p('psvr', 'PlayStation VR', 'PS VR', 'playstation', 8, 'bluRay', 'blue')],
  [46, p('vita', 'PlayStation Vita', 'Vita', 'playstation', 8, 'vita', 'blue')],
  [9, p('ps3', 'PlayStation 3', 'PS3', 'playstation', 7, 'bluRay', 'clear')],
  [38, p('psp', 'PlayStation Portable', 'PSP', 'playstation', 7, 'psp', 'clear')],
  [8, p('ps2', 'PlayStation 2', 'PS2', 'playstation', 6, 'keepCase', 'black')],
  [7, p('ps1', 'PlayStation', 'PS1', 'playstation', 5, 'jewel', 'clear')],

  // Xbox
  [169, p('xbox-series', 'Xbox Series X|S', 'Series X|S', 'xbox', 9, 'bluRay', 'green')],
  [49, p('xbox-one', 'Xbox One', 'Xbox One', 'xbox', 8, 'bluRay', 'green')],
  [12, p('xbox-360', 'Xbox 360', 'Xbox 360', 'xbox', 7, 'keepCase', 'green')],
  [11, p('xbox', 'Xbox', 'Xbox', 'xbox', 6, 'keepCase', 'green')],

  // Nintendo
  [508, p('switch-2', 'Nintendo Switch 2', 'Switch 2', 'nintendo', 9, 'switch', 'red')],
  [130, p('switch', 'Nintendo Switch', 'Switch', 'nintendo', 8, 'switch', 'red')],
  [41, p('wii-u', 'Wii U', 'Wii U', 'nintendo', 8, 'keepCase', 'blue')],
  [37, p('3ds', 'Nintendo 3DS', '3DS', 'nintendo', 8, 'ds', 'white')],
  [137, p('new-3ds', 'New Nintendo 3DS', 'New 3DS', 'nintendo', 8, 'ds', 'white')],
  [5, p('wii', 'Wii', 'Wii', 'nintendo', 7, 'keepCase', 'white')],
  [20, p('ds', 'Nintendo DS', 'DS', 'nintendo', 7, 'ds', 'black')],
  [159, p('dsi', 'Nintendo DSi', 'DSi', 'nintendo', 7, 'ds', 'white')],
  [21, p('gamecube', 'Nintendo GameCube', 'GameCube', 'nintendo', 6, 'keepCase', 'black')],
  [24, p('gba', 'Game Boy Advance', 'GBA', 'nintendo', 6, 'boxSmall', 'black')],
  [4, p('n64', 'Nintendo 64', 'N64', 'nintendo', 5, 'boxWide', 'black')],
  [22, p('gbc', 'Game Boy Color', 'GBC', 'nintendo', 5, 'boxSmall', 'black')],
  [87, p('virtual-boy', 'Virtual Boy', 'Virtual Boy', 'nintendo', 5, 'boxWide', 'red')],
  [19, p('snes', 'Super Nintendo', 'SNES', 'nintendo', 4, 'boxWide', 'black')],
  [58, p('super-famicom', 'Super Famicom', 'SFC', 'nintendo', 4, 'boxTall', 'white')],
  [33, p('gb', 'Game Boy', 'Game Boy', 'nintendo', 4, 'boxSmall', 'white')],
  [18, p('nes', 'Nintendo Entertainment System', 'NES', 'nintendo', 3, 'boxTall', 'black')],
  [99, p('famicom', 'Family Computer', 'Famicom', 'nintendo', 3, 'boxSmall', 'white')],
  [51, p('fds', 'Famicom Disk System', 'FDS', 'nintendo', 3, 'boxSmall', 'white')],

  // PC and other computers
  [6, p('pc', 'PC', 'PC', 'pc', undefined, 'keepCase', 'black')],
  [14, p('mac', 'Mac', 'Mac', 'pc', undefined, 'keepCase', 'white')],
  [3, p('linux', 'Linux', 'Linux', 'pc', undefined, 'keepCase', 'black')],
  [13, p('dos', 'DOS', 'DOS', 'pc', undefined, 'boxTall', 'white')],
  [163, p('steam-vr', 'SteamVR', 'SteamVR', 'pc', undefined, 'keepCase', 'black')],

  // Sega
  [23, p('dreamcast', 'Dreamcast', 'Dreamcast', 'sega', 6, 'jewel', 'white')],
  [32, p('saturn', 'Sega Saturn', 'Saturn', 'sega', 5, 'jewel', 'clear')],
  [29, p('genesis', 'Sega Mega Drive/Genesis', 'Mega Drive', 'sega', 4, 'boxTall', 'black')],
  [78, p('sega-cd', 'Sega CD', 'Sega CD', 'sega', 4, 'jewel', 'clear')],
  [30, p('32x', 'Sega 32X', '32X', 'sega', 4, 'boxTall', 'black')],
  [35, p('game-gear', 'Sega Game Gear', 'Game Gear', 'sega', 4, 'boxSmall', 'black')],
  [64, p('master-system', 'Sega Master System', 'Master System', 'sega', 3, 'boxTall', 'white')],

  // Others worth a name of their own
  [39, p('ios', 'iOS', 'iOS', 'other', undefined, 'keepCase', 'white')],
  [34, p('android', 'Android', 'Android', 'other', undefined, 'keepCase', 'green')],
  [52, p('arcade', 'Arcade', 'Arcade', 'other', undefined, 'keepCase', 'black')],
  [82, p('browser', 'Web browser', 'Browser', 'other', undefined, 'keepCase', 'white')],
  [170, p('stadia', 'Google Stadia', 'Stadia', 'other', undefined, 'keepCase', 'white')],
  [80, p('neo-geo', 'Neo Geo AES', 'Neo Geo', 'other', 4, 'boxTall', 'black')],
  [86, p('pc-engine', 'TurboGrafx-16/PC Engine', 'PC Engine', 'other', 4, 'jewel', 'clear')],
  [59, p('atari-2600', 'Atari 2600', 'Atari 2600', 'other', 2, 'boxTall', 'black')],
  [386, p('quest-2', 'Meta Quest 2', 'Quest 2', 'other', undefined, 'keepCase', 'white')],
  [471, p('quest-3', 'Meta Quest 3', 'Quest 3', 'other', undefined, 'keepCase', 'white')],
]

const CURATED = new Map(CURATED_IN_ORDER)

/** Where a curated platform sits in the list above: the tie-break within a family. */
const RANK = new Map(CURATED_IN_ORDER.map(([igdbId], index) => [igdbId, index]))

const FAMILY_BY_IGDB_NAME: Record<string, Family> = {
  PlayStation: 'playstation',
  Xbox: 'xbox',
  Nintendo: 'nintendo',
  Sega: 'sega',
}

const toKey = (text: string): string =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A curated platform by its IGDB id, if Shelf has one. */
export const curatedPlatform = (igdbId: number): Platform | undefined => {
  const curated = CURATED.get(igdbId)
  return curated ? { igdbId, ...curated } : undefined
}

export const curatedPlatformIds = (): number[] => [...CURATED.keys()]

/**
 * The platform for an IGDB record. Curated platforms keep our name, key and
 * case; anything else gets a sensible default from what IGDB says, so an
 * obscure platform still has a shelf.
 */
export const toPlatform = (record: IgdbPlatform): Platform => {
  const curated = curatedPlatform(record.id)
  if (curated) return curated
  const platform: Platform = {
    igdbId: record.id,
    key: toKey(record.slug) || `platform-${record.id}`,
    name: record.name,
    short: record.abbreviation?.trim() || record.name,
    family: FAMILY_BY_IGDB_NAME[record.platform_family?.name ?? ''] ?? 'other',
    shape: 'keepCase',
    plastic: 'black',
  }
  if (record.generation !== undefined) platform.generation = record.generation
  return platform
}

/**
 * Shelf order: by family, newest generation first. Within a generation,
 * curated platforms keep the order of the list above (home console before
 * handheld, PC before Mac), and anything else follows by name.
 */
export const comparePlatforms = (a: Platform, b: Platform): number => {
  const family = families.indexOf(a.family) - families.indexOf(b.family)
  if (family !== 0) return family
  const generation = (b.generation ?? -1) - (a.generation ?? -1)
  if (generation !== 0) return generation
  const rank = (RANK.get(a.igdbId) ?? Infinity) - (RANK.get(b.igdbId) ?? Infinity)
  if (rank !== 0 && !Number.isNaN(rank)) return rank
  return a.name.localeCompare(b.name, 'en')
}
