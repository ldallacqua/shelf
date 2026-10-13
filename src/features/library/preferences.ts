/**
 * Choices that belong to this device, not to the address: how boxes stand on
 * the shelf, and how large covers are on the wall. They are kept in the
 * browser's storage and mirrored on the page's <html> element, where a small
 * script puts them before the first paint (see `preference-script.tsx`).
 */

export const densities = ['covers', 'compact'] as const
export type Density = (typeof densities)[number]

export const wallSizes = ['small', 'medium', 'large'] as const
export type WallSize = (typeof wallSizes)[number]

type Preference<Value extends string> = {
  /** The key in the browser's storage. */
  storageKey: string
  /** The attribute on <html>, without `data-`. */
  attribute: string
  values: readonly Value[]
  fallback: Value
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

const preferences = [densityPreference, wallSizePreference] as const

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
    if (value === preference.fallback) window.localStorage.removeItem(preference.storageKey)
    else window.localStorage.setItem(preference.storageKey, value)
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
      return (
        `try{var v=localStorage.getItem(${key});` +
        `d.setAttribute(${attribute},${allowed}.indexOf(v)<0?${fallback}:v)}` +
        `catch(e){d.setAttribute(${attribute},${fallback})}`
      )
    })
    .join('') +
  `})()`
