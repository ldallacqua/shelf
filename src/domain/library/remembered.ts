import { isGrouping, type Grouping } from '@/domain/library/group'
import { DEFAULT_SORT, parseSort, sameSort, writeSort, type Sort } from '@/domain/library/sort'
import { DEFAULT_GROUPING, DEFAULT_VIEW, isView, type View } from '@/domain/library/view'

/**
 * How this device last arranged a library (issue 149): the view, the grouping
 * and the sort chosen in the toolbar, so the library opens the way it was
 * left. It is kept in a cookie, the one place both the browser and the
 * server can read: the server draws the first screen already arranged, so
 * nothing flashes from the default shelf to the remembered one.
 *
 * The address still wins. A library opened from an address that names none
 * of the three is arranged as remembered, and the remembered parts are put
 * into its address, in the same step of history; one that names any of them
 * shows exactly what it names, and arriving through it remembers nothing.
 * Only using the toolbar does.
 */

/** The cookie. One for the whole device, for every shelf, mine or anyone's. */
export const ARRANGEMENT_COOKIE = 'shelf_arrangement'

/** A year. Browsers keep a cookie 400 days at most. */
export const ARRANGEMENT_MAX_AGE = 60 * 60 * 24 * 365

/** What is remembered: only what differs from the defaults, so nothing at all is the default library. */
export type Remembered = { view?: View; group?: Grouping; sort?: string }

/**
 * What is put into an address that named none of the arranging parameters:
 * the remembered parts, and a new seed for a remembered shuffle.
 */
export type Completion = { view?: View; group?: Grouping; sort?: string; seed?: string }

/** The address's parameters that arrange the library. */
const ARRANGING = ['view', 'group', 'sort'] as const

/**
 * Whether an address names any of the view, the grouping or the sort: then it
 * is shown as it is. Anything there counts, even a value that is not one, as
 * an address someone wrote is theirs to get wrong.
 */
export const namesArrangement = (
  params: Partial<Record<string, string | readonly string[] | null | undefined>>,
): boolean => ARRANGING.some((key) => params[key] !== undefined && params[key] !== null)

/** A whole arrangement, as the library shows it, down to what differs from the defaults. */
export const rememberedOf = (arrangement: {
  view: View
  group: Grouping
  sort: Sort
}): Remembered => ({
  ...(arrangement.view !== DEFAULT_VIEW && { view: arrangement.view }),
  ...(arrangement.group !== DEFAULT_GROUPING && { group: arrangement.group }),
  ...(!sameSort(arrangement.sort, DEFAULT_SORT) && { sort: writeSort(arrangement.sort) }),
})

/**
 * Reads the cookie's value. Anything it cannot read, or a view, grouping or
 * sort that no longer exists, is the default, as `parseLibraryQuery` does
 * for the address. It never throws.
 */
export const readRemembered = (text: string | undefined): Remembered => {
  if (!text) return {}
  let params: URLSearchParams
  try {
    params = new URLSearchParams(decodeURIComponent(text))
  } catch {
    return {}
  }
  const view = params.get('view')
  const group = params.get('group')
  return rememberedOf({
    view: isView(view) ? view : DEFAULT_VIEW,
    group: isGrouping(group) ? group : DEFAULT_GROUPING,
    sort: parseSort(params.get('sort') ?? undefined),
  })
}

/** The cookie's value: `view=wall&group=status&sort=-title`, the parts in that order; empty for the defaults. */
export const writeRemembered = (remembered: Remembered): string =>
  encodeURIComponent(
    ARRANGING.flatMap((key) => {
      const value = remembered[key]
      return value ? [`${key}=${value}`] : []
    }).join('&'),
  )

/** A new seed for a shuffle: short, and safe in an address. */
export const newSeed = (): string => Math.random().toString(36).slice(2, 8)

/**
 * What an address that names none of the arranging parameters is completed
 * with, or nothing when the defaults are what is remembered. A smart shelf
 * has its own grouping and sort, which it was saved with: only the view
 * applies to it. A shuffle is remembered as a shuffle, with a new seed.
 */
export const completionOf = (
  remembered: Remembered,
  { smart, seed = newSeed }: { smart: boolean; seed?: () => string },
): Completion | undefined => {
  const parts: Completion = smart
    ? { ...(remembered.view && { view: remembered.view }) }
    : remembered
  if (parts.view === undefined && parts.group === undefined && parts.sort === undefined)
    return undefined
  return parts.sort === 'random' ? { ...parts, seed: seed() } : { ...parts }
}

/**
 * What to remember after a choice in the toolbar: the library as it now
 * stands. On a smart shelf only the view is the device's; its grouping and
 * sort are the shelf's, so what was remembered of them stays.
 */
export const rememberChoice = (
  before: Remembered,
  arrangement: { view: View; group: Grouping; sort: Sort },
  { smart }: { smart: boolean },
): Remembered => {
  const now = rememberedOf(arrangement)
  if (!smart) return now
  return {
    ...(now.view && { view: now.view }),
    ...(before.group && { group: before.group }),
    ...(before.sort && { sort: before.sort }),
  }
}
