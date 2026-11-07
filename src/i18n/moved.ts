/**
 * Pages that moved, so links and bookmarks to them still arrive (issue 152): the account page and
 * its Settings tab became Settings' own pages. An address from before that came back from linking
 * Steam lands on Platforms, where it shows how linking went. The address is given without the
 * language, as `splitLocale` leaves it.
 */
export function movedTo(rest: string, query: URLSearchParams): string | undefined {
  if (rest === '/account') return query.has('steam') ? '/settings/platforms' : '/settings/profile'
  if (rest === '/account/settings') return '/settings'
  return undefined
}
