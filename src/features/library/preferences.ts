/**
 * Choices that belong to this device, not to the address: how boxes stand on
 * the shelf, whether the shelf is drawn in 2D or 3D, and how large covers are
 * on the wall. They are kept in the
 * browser's storage and mirrored on the page's <html> element, where a small
 * script puts them before the first paint (see `preference-script.tsx`).
 */

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
   * For a choice whose default depends on the device: an expression the head
   * script evaluates, before the first paint, when nothing is stored. A choice
   * with one is always stored once made, even when it equals the default,
   * because the default could differ the next time.
   */
  deviceDefault?: string
}

export const densityPreference: Preference<Density> = {
  storageKey: 'shelf:density',
  attribute: 'density',
  values: densities,
  fallback: 'covers',
}

export const wallSizePreference: Preference<WallSize> = {
  storageKey: 'shelf:wall-size',
  attribute: 'wall-size',
  values: wallSizes,
  fallback: 'medium',
}

/**
 * The desktop that can draw it starts in 3D: a fine pointer that can hover, a
 * wide window, WebGL 2, and no request for reduced motion. Phones and tablets
 * start in 2D (spec 3.6). Whether WebGL 2 really works is only known once a
 * context is made; if it does not, the shelf says so and stays in 2D.
 */
export const dimensionPreference: Preference<Dimension> = {
  storageKey: 'shelf:dimension',
  attribute: 'shelf-mode',
  values: dimensions,
  fallback: '2d',
  deviceDefault:
    "matchMedia('(hover: hover) and (pointer: fine) and (min-width: 64rem)').matches&&" +
    "!matchMedia('(prefers-reduced-motion: reduce)').matches&&" +
    "'WebGL2RenderingContext' in window?'3d':'2d'",
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

const preferences = [
  densityPreference,
  wallSizePreference,
  dimensionPreference,
  adultPreference,
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

export const readPreference = <Value extends string>(preference: Preference<Value>): Value =>
  parse(preference, document.documentElement.getAttribute(`data-${preference.attribute}`))

export const writePreference = <Value extends string>(
  preference: Preference<Value>,
  value: Value,
): void => {
  try {
    if (value === preference.fallback && !preference.deviceDefault) {
      window.localStorage.removeItem(preference.storageKey)
    } else window.localStorage.setItem(preference.storageKey, value)
  } catch {
    // Storage is blocked: the choice still applies to this page.
  }
  document.documentElement.setAttribute(`data-${preference.attribute}`, value)
  for (const listener of listeners) listener()
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
      const attribute = JSON.stringify(`data-${preference.attribute}`)
      // Worked out only when nothing usable is stored. It must never throw either.
      const otherwise = preference.deviceDefault
        ? `(function(){try{return ${preference.deviceDefault}}catch(e){return ${fallback}}})()`
        : fallback
      return (
        `try{var v=localStorage.getItem(${key});` +
        `d.setAttribute(${attribute},${allowed}.indexOf(v)<0?${otherwise}:v)}` +
        `catch(e){d.setAttribute(${attribute},${otherwise})}`
      )
    })
    .join('') +
  `})()`
