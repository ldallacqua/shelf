import { routing } from './routing'

/**
 * Turns a route like "/game/[slug]" into a pattern that matches "/game/anything".
 * "[name]" stands for one part of the address, "[...name]" for one or more.
 */
function toPattern(route: string): RegExp {
  const source = route
    .split('/')
    .map((part) => {
      if (/^\[\.\.\..+\]$/.test(part)) return '.+'
      if (/^\[.+\]$/.test(part)) return '[^/]+'
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return new RegExp(`^${source}$`)
}

const patterns = Object.keys(routing.pathnames).map(toPattern)
const localePrefix = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`)

/**
 * Splits an address into its language and the rest.
 * Returns nothing when the address does not start with a language.
 */
export function splitLocale(pathname: string): { locale: string; rest: string } | undefined {
  const match = localePrefix.exec(pathname)
  if (!match?.[1]) return undefined
  const rest = pathname.slice(match[0].length).replace(/\/+$/, '')
  return { locale: match[1], rest: rest === '' ? '/' : rest }
}

/** Whether a page exists at this address. The address must not include the language. */
export function isKnownPath(path: string): boolean {
  return patterns.some((pattern) => pattern.test(path))
}
