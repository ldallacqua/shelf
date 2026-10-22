'use client'

/**
 * The address while a game is open over the shelf (spec 7.2). Opening it
 * adds `/u/{handle}/game/{slug}` to the browser's history, so the address
 * can be sent and opens the game's own page on that shelf; Back closes it,
 * and the shelf is where it was. The library's own query string is kept on
 * it, so the shelf behind reads the same filter, sort and view from the
 * address while the game is open.
 *
 * The browser's history API is used directly, not the router: the game is a
 * panel drawn by the library, and asking the router for the game's page
 * would replace the library with it. Next.js keeps its own state in step
 * with these calls.
 */

const GAME_PATH = /^\/([^/]+)\/u\/([^/]+)\/game\/([^/]+)\/?$/

/** The slug of the game an address opens, if it is a game's address. */
export const gameSlugIn = (pathname: string): string | undefined => {
  const slug = GAME_PATH.exec(pathname)?.[3]
  if (!slug) return undefined
  try {
    return decodeURIComponent(slug)
  } catch {
    return undefined
  }
}

/** The language and the shelf of the page: `/en/u/ana`, from `/en/u/ana/…`. */
const shelfOf = (pathname: string): string => {
  const [, language = '', u = '', handle = ''] = pathname.split('/')
  return u === 'u' ? `/${language}/u/${handle}` : `/${language}`
}

/** A game's address on the page's shelf, in its language, with the library's query string kept. */
const gameAddress = (slug: string): string =>
  `${shelfOf(window.location.pathname)}/game/${encodeURIComponent(slug)}${window.location.search}`

/** A Back asked for and not arrived yet. History moves arriving meanwhile wait for it. */
let leaving = false
let waiting: (() => void) | undefined

const whenSettled = (move: () => void) => {
  if (leaving) waiting = move
  else move()
}

/** Called on every Back and Forward: a Back this module asked for has arrived. */
export const historyMoved = (): void => {
  if (!leaving) return
  leaving = false
  const move = waiting
  waiting = undefined
  move?.()
}

/** A game opened from the shelf: a new step in history. */
export const showGame = (slug: string): void =>
  whenSettled(() => {
    // Next.js adds its own state to whatever is passed; it must be given none of its own.
    window.history.pushState(null, '', gameAddress(slug))
  })

/** Another game in the same panel, by the arrows or a swipe: the same step, now this game. */
export const replaceGame = (slug: string): void =>
  whenSettled(() => {
    window.history.replaceState(null, '', gameAddress(slug))
  })

/** The panel closed by a button, Escape or a click outside: back to the step before it. */
export const leaveGame = (): void => {
  if (leaving || !gameSlugIn(window.location.pathname)) return
  leaving = true
  window.history.back()
}
