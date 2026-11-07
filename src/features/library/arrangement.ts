import {
  ARRANGEMENT_COOKIE,
  ARRANGEMENT_MAX_AGE,
  readRemembered,
  rememberChoice,
  writeRemembered,
  type Remembered,
} from '@/domain/library/remembered'
import type { Grouping } from '@/domain/library/group'
import type { Sort } from '@/domain/library/sort'
import type { View } from '@/domain/library/view'

/**
 * The library's arrangement as this device remembers it (issue 149), in the
 * browser: read when a private shelf is built here, and written each time
 * the toolbar changes the view, the grouping or the sort. The server reads
 * the same cookie for a public shelf's first screen.
 */

const PREFIX = `${ARRANGEMENT_COOKIE}=`

/** What this device remembers. Cookies switched off: nothing, and the defaults apply. */
export const readRememberedHere = (): Remembered => {
  try {
    const cookie = document.cookie.split(/;\s*/).find((each) => each.startsWith(PREFIX))
    return readRemembered(cookie?.slice(PREFIX.length))
  } catch {
    return {}
  }
}

/** Remembers the library as a choice in the toolbar leaves it. */
export const rememberArrangement = (
  arrangement: { view: View; group: Grouping; sort: Sort },
  { smart }: { smart: boolean },
): void => {
  const value = writeRemembered(rememberChoice(readRememberedHere(), arrangement, { smart }))
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  // The defaults are nothing to remember: the cookie goes.
  const age = value ? ARRANGEMENT_MAX_AGE : 0
  try {
    document.cookie = `${PREFIX}${value}; Path=/; Max-Age=${age}; SameSite=Lax${secure}`
  } catch {
    // Cookies are switched off: the choice still applies to this page.
  }
}
