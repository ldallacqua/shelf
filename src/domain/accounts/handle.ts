/**
 * A shelf's handle: the part of its address after `/u/` (ADR 004). Chosen at
 * sign-up, changeable later, unique, and lowercase so that `/u/Lucas` and
 * `/u/lucas` are never two shelves.
 */

export const HANDLE_MIN = 3
export const HANDLE_MAX = 24

/** Letters, digits and single hyphens, starting and ending with a letter or digit. */
const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Words that are, or could one day be, addresses of the site's own, or that
 * would read as the site speaking.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'about',
  'account',
  'accounts',
  'admin',
  'api',
  'auth',
  'consent',
  'explore',
  'game',
  'games',
  'help',
  'home',
  'igdb',
  'library',
  'login',
  'logout',
  'me',
  'mcp',
  'missing',
  'new',
  // The handle a shelf's page frames are built from (`app/[locale]/u/[handle]`).
  'none',
  'null',
  'owner',
  'root',
  'settings',
  'shelf',
  'shelves',
  'sign-in',
  'sign-out',
  'sign-up',
  'signin',
  'signup',
  'staff',
  'support',
  'system',
  'trophies',
  'u',
  'undefined',
  'user',
  'users',
])

export type HandleProblem = 'short' | 'long' | 'shape' | 'reserved'

/** Why this text cannot be a handle, or nothing when it can. */
export const handleProblem = (text: string): HandleProblem | undefined => {
  if (text.length < HANDLE_MIN) return 'short'
  if (text.length > HANDLE_MAX) return 'long'
  if (!SHAPE.test(text)) return 'shape'
  if (RESERVED_HANDLES.has(text)) return 'reserved'
  return undefined
}

export const isHandle = (text: string): boolean => handleProblem(text) === undefined

/**
 * A handle made from other words, such as the part of an email address
 * before the @: lowercase, anything else turned into single hyphens. May
 * still be short or reserved; the caller makes it unique.
 */
export const handleFrom = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, HANDLE_MAX)
    .replace(/-+$/, '')

/**
 * The handle of the account the library belonged to before there were
 * accounts. Its old addresses (`/library`, `/game/…`) lead here.
 */
export const FIRST_HANDLE = 'lucas'
