import type { WallOptions } from '@/domain/library/trophies'
import { isMeasure } from '@/domain/library/trophy-taste'

/** The longest filter the trophy page takes, as the library's API does. */
const LONGEST_FILTER = 1000

/**
 * Which trophies the page's address asks for (issue 68): `year`, a year
 * with something in it to be finished, `q`, a filter in the library's
 * language, and `by`, what the kinds are ranked by when it is not games
 * finished. Anything else in the address is ignored.
 */
export const wallAddress = (
  query: Record<string, string | string[] | undefined>,
  thisYear: number,
): Pick<WallOptions, 'scope' | 'q' | 'by'> => {
  const year = typeof query.year === 'string' ? query.year : undefined
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, LONGEST_FILTER) : ''
  const scope = year && /^\d{4}$/.test(year) ? Number(year) : undefined
  return {
    ...(scope !== undefined && scope >= 1970 && scope <= thisYear + 1 ? { scope } : {}),
    ...(q ? { q } : {}),
    ...(isMeasure(query.by) && query.by !== 'finished' ? { by: query.by } : {}),
  }
}
