import type { TestInfo } from '@playwright/test'

/**
 * Games in the fixtures that the sample library does not have, each with a
 * title no other fixture shares. The nine projects that change the library
 * run at once against one server, so each test in each project adds a game
 * of its own, and none can find another's game on the shelf.
 */
const GAMES = [
  'Half-Life',
  'Mass Effect',
  'Minecraft: Java Edition',
  'Grand Theft Auto IV',
  'Life Is Strange',
  'Borderlands 2',
  'Mass Effect 3',
  'Max Payne',
  'Fallout 3',
  'The Walking Dead',
  'Warcraft III: Reign of Chaos',
  'Grand Theft Auto III',
  'Diablo II',
  'Mafia',
  'Batman: Arkham Knight',
  "Assassin's Creed III",
  'Call of Duty: Black Ops',
  'Wolfenstein: The New Order',
  'Hotline Miami',
  'Mafia II',
  'StarCraft',
  'Dead Space',
  "Assassin's Creed Revelations",
  'The Wolf Among Us',
  "Uncharted: Drake's Fortune",
  'Far Cry 4',
  'Watch Dogs',
  'Max Payne 3',
  "Sid Meier's Civilization V",
  'Heavy Rain',
  'Resident Evil 7: Biohazard',
  'BioShock 2',
  "Assassin's Creed Origins",
  "Hellblade: Senua's Sacrifice",
  'Dragon Age: Inquisition',
  'Dead Space 2',
  'Battlefield 3',
  'Call of Duty 2',
  'Dying Light',
  'Deus Ex: Human Revolution',
  'Star Wars Jedi: Fallen Order',
  'God of War II',
  'Borderlands',
  'Alan Wake',
  'League of Legends',
  'Fortnite',
  'Call of Duty: World at War',
  "Assassin's Creed Unity",
  "Mirror's Edge",
  'Diablo III',
  'Call of Duty: Black Ops II',
  'Spec Ops: The Line',
  'Battlefield 4',
  'Battlefield 1',
  'Fallout 2',
  'World of Warcraft',
  'Team Fortress 2',
  'Metro 2033',
  'Need for Speed: Underground 2',
  'Far Cry 5',
  'Titanfall 2',
  'Dark Souls II',
  'The Walking Dead: Season Two',
  'Call of Duty',
  "Assassin's Creed Syndicate",
  'Super Meat Boy',
  'Deus Ex',
] as const

/** How many games one project's tests may use: one per test. */
const SLOTS = 7

/** The nine projects, in a fixed order. */
const PROJECTS = ['chromium', 'firefox', 'webkit'].flatMap((browser) =>
  ['phone', 'tablet', 'desktop'].map((size) => `${browser}-${size}`),
)

const projectIndex = (info: TestInfo) =>
  Math.max(PROJECTS.indexOf(info.project.name.replace(/-writes$/, '')), 0)

/** The game this test adds: its own, in its own project. */
export const gameToAdd = (info: TestInfo, slot: number): string =>
  GAMES[(projectIndex(info) * SLOTS + slot) % GAMES.length]!

/**
 * More such games, none related to a game on the sample shelf (no port,
 * edition or remake of one), so each lands as an entry of its own: three a
 * project, for adding from a pasted list.
 */
const LIST_GAMES = [
  'Call of Duty 4: Modern Warfare',
  'The Elder Scrolls IV: Oblivion',
  'Call of Duty: Modern Warfare 2',
  'The Witcher 2: Assassins of Kings',
  'Super Mario Bros.',
  'South Park: The Stick of Truth',
  'Call of Duty: Modern Warfare 3',
  'StarCraft II: Wings of Liberty',
  'L.A. Noire',
  'Metal Gear Solid 2: Sons of Liberty',
  'Age of Empires II: The Age of Kings',
  'The Elder Scrolls III: Morrowind',
  'Batman: Arkham Origins',
  'Need for Speed: Underground',
  'Resident Evil 5',
  'A Plague Tale: Innocence',
  'Crysis',
  'Beyond: Two Souls',
  'Dota 2',
  'Left 4 Dead',
  'Watch Dogs 2',
  'Bastion',
  'Little Nightmares',
  'Stray',
  'Metal Gear Solid 4: Guns of the Patriots',
  'Saints Row: The Third',
  'Call of Duty: Ghosts',
] as const

/** The three games this project adds from a list. */
export const listToAdd = (info: TestInfo): [string, string, string] => {
  const at = projectIndex(info) * 3
  return [LIST_GAMES[at]!, LIST_GAMES[at + 1]!, LIST_GAMES[at + 2]!]
}
