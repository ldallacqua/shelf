/**
 * Setting a new shelf up (spec 4.6): the steps in their order, where someone plays, and how the
 * flow remembers both. Nothing here is required: every step can be skipped, and going through
 * the steps again changes nothing that was chosen in them.
 */

/** The steps, in order: where I play, my games in, my colors, my games sorted, then ready. */
export const setupSteps = ['play', 'bring', 'look', 'sort', 'ready'] as const
export type SetupStep = (typeof setupSteps)[number]

/** The steps that ask something, numbered for the progress line; `ready` is where they lead. */
export const askingSteps = setupSteps.filter(
  (step): step is Exclude<SetupStep, 'ready'> => step !== 'ready',
)

/**
 * Where someone plays, asked first so the next step offers the quickest way in for each: Steam
 * for a PC, Nintendo's play history for a Switch, and a pasted list where no sync is built yet.
 */
export const playPlaces = ['pc', 'switch', 'playstation', 'xbox', 'physical'] as const
export type PlayPlace = (typeof playPlaces)[number]

/** A platform Shelf syncs, by the place it stands for. */
export const syncFor = { pc: 'steam', switch: 'nintendo' } as const satisfies Partial<
  Record<PlayPlace, string>
>
export type SyncedPlace = keyof typeof syncFor

/**
 * What the flow remembers on this device, for one account: where it stands, where I play, and
 * whether the colors were looked at (a choice the device always has, so only passing it says so).
 */
export type SetupMemory = { step: SetupStep; places: PlayPlace[]; looked: boolean }

export const FIRST_STEP: SetupStep = 'play'

export const isSetupStep = (value: unknown): value is SetupStep =>
  typeof value === 'string' && (setupSteps as readonly string[]).includes(value)

export const isPlayPlace = (value: unknown): value is PlayPlace =>
  typeof value === 'string' && (playPlaces as readonly string[]).includes(value)

/** The places in their own order, each once, whatever order they were chosen in. */
export const orderPlaces = (places: Iterable<PlayPlace>): PlayPlace[] => {
  const chosen = new Set(places)
  return playPlaces.filter((place) => chosen.has(place))
}

/**
 * What was stored, read back. Anything this version cannot read starts the flow afresh, with no
 * places chosen: a stored value is never trusted to be well formed.
 */
export const parseSetupMemory = (stored: unknown): SetupMemory => {
  const fresh: SetupMemory = { step: FIRST_STEP, places: [], looked: false }
  if (typeof stored !== 'string') return fresh
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return fresh
  }
  if (typeof value !== 'object' || value === null) return fresh
  const { step, places, looked } = value as { step?: unknown; places?: unknown; looked?: unknown }
  return {
    step: isSetupStep(step) ? step : FIRST_STEP,
    places: Array.isArray(places) ? orderPlaces(places.filter(isPlayPlace)) : [],
    looked: looked === true,
  }
}

export const writeSetupMemory = (memory: SetupMemory): string =>
  JSON.stringify({ step: memory.step, places: orderPlaces(memory.places), looked: memory.looked })

/** The step after this one, or the same at the end. */
export const nextStep = (step: SetupStep): SetupStep =>
  setupSteps[Math.min(setupSteps.indexOf(step) + 1, setupSteps.length - 1)] ?? step

/** The step before this one, or the same at the start. */
export const previousStep = (step: SetupStep): SetupStep =>
  setupSteps[Math.max(setupSteps.indexOf(step) - 1, 0)] ?? step

/**
 * Which step the page opens on. An address that names a step wins: that is how Settings starts
 * the flow over (`#play`), and how Back and Forward move through it. Back from Steam's sign-in,
 * started on the second step, it is the second step. Otherwise where this device left it.
 */
export const openingStep = ({
  hash,
  backFromSteam,
  stored,
}: {
  hash: string
  backFromSteam: boolean
  stored: SetupStep
}): SetupStep => {
  const named = hash.replace(/^#/, '')
  if (isSetupStep(named)) return named
  if (backFromSteam) return 'bring'
  return stored
}

/**
 * The places a linked platform already says, chosen for me the first time: a shelf linked to
 * Steam is played on a PC. Places I chose stay as I chose them.
 */
export const placesWithLinks = (
  chosen: readonly PlayPlace[],
  linked: readonly string[],
): PlayPlace[] => {
  const said = (Object.entries(syncFor) as [SyncedPlace, string][])
    .filter(([, source]) => linked.includes(source))
    .map(([place]) => place)
  return orderPlaces([...chosen, ...said])
}

/**
 * Which platforms to offer to link, for the places chosen: Steam for a PC, Nintendo for a Switch.
 * With neither chosen (nothing at all, or only places no sync reaches yet), both, since a shelf
 * may still have games on either.
 */
export const sourcesFor = (places: readonly PlayPlace[]): ('steam' | 'nintendo')[] => {
  const sources = places.flatMap((place) =>
    place === 'pc' || place === 'switch' ? [syncFor[place]] : [],
  )
  return sources.length > 0 ? sources : ['steam', 'nintendo']
}

/** Whether a place has games only a pasted list or a search can bring in today. */
export const byHandOnly = (places: readonly PlayPlace[]): PlayPlace[] =>
  places.filter((place) => place === 'playstation' || place === 'xbox' || place === 'physical')
