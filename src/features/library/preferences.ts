/**
 * Choices that belong to this device, not to the address: whether the
 * unfinished views are offered, how boxes stand on the shelf, whether the
 * shelf is drawn in 2D or 3D, and how large covers are on the wall. They are
 * kept in the browser's storage and mirrored on the page's <html> element,
 * where a small script puts them before the first paint (see
 * `preference-script.tsx`).
 */

export const experimentalChoices = ['off', 'on'] as const
export type ExperimentalChoice = (typeof experimentalChoices)[number]

export const densities = ['covers', 'compact'] as const
export type Density = (typeof densities)[number]

export const wallSizes = ['small', 'medium', 'large'] as const
export type WallSize = (typeof wallSizes)[number]

export const dimensions = ['2d', '3d'] as const
export type Dimension = (typeof dimensions)[number]

type Preference<Value extends string> = {
  /** The key in the browser's storage. */
  storageKey: string
  /** The attribute on <html>, without `data-`. */
  attribute: string
  values: readonly Value[]
  /** What the server draws, and what applies when nothing better is known. */
  fallback: Value
  /**
   * A choice of an unfinished view (issue 63): it applies only while
   * experimental views are on, on this device. Otherwise the fallback does,
   * whatever is stored, so a choice made before cannot bring the view back.
   */
  experimental?: true
}

/**
 * Whether this device is offered the unfinished views, the 3D shelf and the
 * compact one (issue 63). Off until it is turned on, on the account page.
 */
export const experimentalPreference: Preference<ExperimentalChoice> = {
  storageKey: 'shelf:experimental',
  attribute: 'experimental',
  values: experimentalChoices,
  fallback: 'off',
}

export const densityPreference: Preference<Density> = {
  storageKey: 'shelf:density',
  attribute: 'density',
  values: densities,
  fallback: 'covers',
  experimental: true,
}

export const wallSizePreference: Preference<WallSize> = {
  storageKey: 'shelf:wall-size',
  attribute: 'wall-size',
  values: wallSizes,
  fallback: 'medium',
}

/**
 * Every device starts in 2D (spec 3.6): 3D is experimental, and only drawn
 * once it is chosen. Whether WebGL 2 really works is only known once a
 * context is made; if it does not, the shelf says so and stays in 2D.
 */
export const dimensionPreference: Preference<Dimension> = {
  storageKey: 'shelf:dimension',
  attribute: 'shelf-mode',
  values: dimensions,
  fallback: '2d',
  experimental: true,
}

/**
 * A window too small for the 3D shelf: a phone, held either way. The boxes
 * there would be too small to read or to tap, and the 2D shelf is made for
 * it, so 3D is not offered at all. A choice of 3D made in a larger window is
 * kept, and applies again when there is room. The `too-small-for-3d` variant
 * in `globals.css` is the same query, for what must be right before the
 * first paint.
 */
export const TOO_SMALL_FOR_3D = '(width < 40rem), (height < 36rem)'

export const adultChoices = ['shown', 'hidden'] as const
export type AdultChoice = (typeof adultChoices)[number]

/**
 * Whether adult games are hidden on this device (spec 3.13): whoever is at this screen
 * chooses, on every shelf it shows. On <html> before the first paint, so CSS keeps their
 * boxes out of a page the server drew with them.
 */
export const adultPreference: Preference<AdultChoice> = {
  storageKey: 'shelf:adult',
  attribute: 'adult',
  values: adultChoices,
  fallback: 'shown',
}

export const readyChoices = ['all', 'ready'] as const
export type ReadyChoice = (typeof readyChoices)[number]

/**
 * Whether one's own shelf shows only the games ready to play on this
 * computer (spec 7.7, Ready to play): offered only in Shelf for Windows, and
 * kept on it, as Steam keeps its own.
 */
export const readyPreference: Preference<ReadyChoice> = {
  storageKey: 'shelf:ready-to-play',
  attribute: 'ready-to-play',
  values: readyChoices,
  fallback: 'all',
}

// Experimental views first: the head script reads them back for the choices they hold.
const preferences = [
  experimentalPreference,
  densityPreference,
  wallSizePreference,
  dimensionPreference,
  adultPreference,
  readyPreference,
] as const

const parse = <Value extends string>(preference: Preference<Value>, value: unknown): Value =>
  (preference.values as readonly unknown[]).includes(value) ? (value as Value) : preference.fallback

const listeners = new Set<() => void>()

export const subscribeToPreferences = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const attributeOf = (preference: Preference<string>): string => `data-${preference.attribute}`

const experimentalOn = (): boolean =>
  document.documentElement.getAttribute(attributeOf(experimentalPreference)) === 'on'

export const readPreference = <Value extends string>(preference: Preference<Value>): Value =>
  preference.experimental && !experimentalOn()
    ? preference.fallback
    : parse(preference, document.documentElement.getAttribute(attributeOf(preference)))

export const writePreference = <Value extends string>(
  preference: Preference<Value>,
  value: Value,
): void => {
  try {
    if (value === preference.fallback) window.localStorage.removeItem(preference.storageKey)
    else window.localStorage.setItem(preference.storageKey, value)
  } catch {
    // Storage is blocked: the choice still applies to this page.
  }
  document.documentElement.setAttribute(attributeOf(preference), value)
  for (const listener of listeners) listener()
}

/**
 * Turns experimental views on or off. Either way the shelf starts again in
 * 2D with covers: turned off, a view it was in goes away with its buttons;
 * turned on, nothing changes until one is chosen.
 */
export const writeExperimental = (value: ExperimentalChoice): void => {
  writePreference(dimensionPreference, dimensionPreference.fallback)
  writePreference(densityPreference, densityPreference.fallback)
  writePreference(experimentalPreference, value)
}

/**
 * The script that runs in <head> before the first paint. It must stand alone
 * and must never throw: storage can be blocked.
 */
export const preferenceScript = (): string =>
  `(function(){var d=document.documentElement;` +
  preferences
    .map((preference) => {
      const key = JSON.stringify(preference.storageKey)
      const allowed = JSON.stringify(preference.values)
      const fallback = JSON.stringify(preference.fallback)
      const attribute = JSON.stringify(attributeOf(preference))
      // An unfinished view's choice is not even read while experimental views are off.
      const off = preference.experimental
        ? `d.getAttribute(${JSON.stringify(attributeOf(experimentalPreference))})!=="on"||`
        : ''
      return (
        `try{var v=localStorage.getItem(${key});` +
        `d.setAttribute(${attribute},${off}${allowed}.indexOf(v)<0?${fallback}:v)}` +
        `catch(e){d.setAttribute(${attribute},${fallback})}`
      )
    })
    .join('') +
  `})()`
